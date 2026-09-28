// ============ RIFT BRAWL — Game Engine (fixed timestep loop) ============

import { STEP_MS } from './core/constants';
import { InputManager } from './core/input';
import { GameSettings, MatchConfig, MatchResult } from './core/types';
import { Match, MatchMods } from './Match';
import { audio } from './audio/AudioManager';

export interface EngineCallbacks {
  onEnd(result: MatchResult): void;
  onPauseRequest(): void;
}

const THEME_BY_STAGE: Record<string, string> = {
  forest: 'forest', volcano: 'volcano', neon: 'neon', frozen: 'frozen', sky: 'sky', rift: 'rift',
};

export class GameEngine {
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  input = new InputManager();
  settings: GameSettings;
  match: Match | null = null;
  /** called after every fixed simulation step (used by netplay transport) */
  onFixedStep: (() => void) | null = null;
  private raf = 0;
  private acc = 0;
  private lastT = 0;
  private running = false;
  /** background catch-up: keeps online matches alive when the host tab loses focus */
  private bgTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: EngineCallbacks | null = null;
  private fpsAvg = 60;
  private quality: 'low' | 'medium' | 'high' = 'high';
  private viewW = 1280;
  private viewH = 720;
  private escHandler = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && this.match) {
      e.preventDefault();
      this.callbacks?.onPauseRequest();
      return;
    }
    const trainingKeys = ['KeyR', 'KeyT', 'KeyH', 'KeyG', 'KeyY'];
    if (this.match && trainingKeys.includes(e.code)) {
      this.match.onKeyDown(e.code);
    }
  };

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  applySettings(s: GameSettings) {
    this.settings = s;
    this.quality = s.quality;
    this.input.setBinds(s.keybinds.p1, s.keybinds.p2);
    audio.setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol });
    if (this.match) {
      this.match.mods.showFps = s.showFps;
      this.match.mods.reduceFlash = s.reduceFlashing;
      this.match.mods.quality = s.quality;
    }
    this.resize();
  }

  attach(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.callbacks = callbacks;
    this.input.attach();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.escHandler);
    this.resize();
  }

  detach() {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.escHandler);
    this.input.detach();
    this.canvas = null;
    this.ctx = null;
  }

  resize = () => {
    const canvas = this.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.viewW = Math.max(320, Math.round(rect.width));
    this.viewH = Math.max(240, Math.round(rect.height));
    const dprCap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.4 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.round(this.viewW * dpr);
    canvas.height = Math.round(this.viewH * dpr);
    if (this.match) {
      this.match.viewW = this.viewW;
      this.match.viewH = this.viewH;
      this.match.camera.resize(this.viewW, this.viewH);
    }
  };

  start(config: MatchConfig, mods: MatchMods, netMode: 'off' | 'host' | 'client' = 'off') {
    if (!this.ctx) return;
    this.stop();
    this.quality = this.settings.quality;
    this.resize();
    this.match = new Match(config, audio, this.viewW, this.viewH, {
      onEnd: (r) => this.callbacks?.onEnd(r),
      onPauseRequest: () => this.callbacks?.onPauseRequest(),
    }, mods, netMode);
    this.match.engineInputs = [this.input.controllers[0], this.input.controllers[1]];
    this.match.mods.showFps = this.settings.showFps;
    this.match.mods.reduceFlash = this.settings.reduceFlashing;
    (window as unknown as { __match?: Match }).__match = this.match;
    // shake setting
    this.match.camera.reduceShake = this.settings.screenShake;
    // music
    audio.ensure();
    audio.playMusic(THEME_BY_STAGE[config.stageId] ?? 'forest');
    this.lastT = performance.now();
    this.acc = 0;
    this.running = true;
    this.input.attach();
    this.raf = requestAnimationFrame(this.loop);
    if (this.bgTimer) clearInterval(this.bgTimer);
    this.bgTimer = setInterval(this.bgPump, 120);
  }

  /** Called on a timer: when the tab is hidden rAF stops, so online matches would stall.
   *  This pumps a few simulation steps per tick so remote players keep playing (render skipped). */
  private bgPump = () => {
    if (!this.running || !this.match || !document.hidden) return;
    const now = performance.now();
    const rawDt = Math.min(250, now - this.lastT);
    this.lastT = now;
    this.acc += rawDt * this.match.slowmo;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 6) {
      this.match.step();
      this.onFixedStep?.();
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps >= 6) this.acc = 0;
  };

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.bgTimer) { clearInterval(this.bgTimer); this.bgTimer = null; }
    this.match?.destroy();
    this.match = null;
    audio.stopMusic();
  }

  setPaused(p: boolean) {
    if (this.match) this.match.paused = p;
    if (p) audio.setMusicEnabled(false); else if (this.settings) audio.setMusicEnabled(true);
  }

  private loop = (t: number) => {
    if (!this.running || !this.match || !this.ctx) return;
    const rawDt = Math.min(50, t - this.lastT);
    this.lastT = t;
    // fps tracking
    this.fpsAvg = this.fpsAvg * 0.95 + (1000 / Math.max(1, rawDt)) * 0.05;
    this.match.fps = this.fpsAvg;

    const slowmo = this.match.slowmo;
    this.acc += rawDt * slowmo;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 5) {
      this.input.poll();
      this.match.step();
      this.onFixedStep?.();
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps >= 5) this.acc = 0; // avoid spiral of death

    const alpha = Math.min(1, this.acc / STEP_MS);
    const ctx = this.ctx;
    const dpr = this.canvas!.width / this.viewW;
    this.match.camera.dpr = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.match.render(ctx, alpha);
    this.raf = requestAnimationFrame(this.loop);
  };
}
