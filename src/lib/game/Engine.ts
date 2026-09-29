// ============ RIFT BRAWL — Game Engine (fixed timestep loop) ============

import { STEP_MS } from './core/constants';
import { InputManager } from './core/input';
import { GameSettings, MatchConfig, MatchResult } from './core/types';
import { Match, MatchMods } from './Match';
import { audio } from './audio/AudioManager';
import { ReplayData, ReplayPlayback, ReplayRecorder } from './replay/format';

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
  /** the recording of the most recently finished local match, if any */
  lastReplay: ReplayData | null = null;
  /** playback rate multiplier — replays can be watched at 0.25x … 4x */
  timeScale = 1;
  private recorder: ReplayRecorder | null = null;
  private replayMeta: ReplayData['meta'] | null = null;
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
      this.match.mods.reduceMotion = s.reduceMotion;
      this.match.mods.hudScale = s.hudScale;
      this.match.mods.playerMarkers = s.playerMarkers;
      this.match.camera.reduceShake = s.reduceMotion ? 0 : s.screenShake;
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

  /**
   * Watch a recorded match. The simulation is byte-for-byte deterministic, so
   * replaying the input tracks reproduces the original match exactly — no
   * state snapshots and no video, just the buttons that were pressed.
   */
  startReplay(data: ReplayData, mods: MatchMods) {
    const playback = new ReplayPlayback(data);
    this.start(data.meta.config, mods, 'off', { record: false });
    if (!this.match) return;
    this.match.playback = playback;
    this.match.inputProvider = playback.provide;
    this.match.isReplay = true;
  }

  start(
    config: MatchConfig,
    mods: MatchMods,
    netMode: 'off' | 'host' | 'client' = 'off',
    opts: { record?: boolean } = {},
  ) {
    if (!this.ctx) return;
    this.stop();
    this.quality = this.settings.quality;
    this.resize();
    this.match = new Match(config, audio, this.viewW, this.viewH, {
      onEnd: (r) => {
        if (this.recorder && this.replayMeta) {
          this.lastReplay = this.recorder.finish({
            ...this.replayMeta,
            winner: r.winner,
            durationFrames: r.durationFrames,
            timeout: !!r.timeout,
          });
        }
        this.callbacks?.onEnd(r);
      },
      onPauseRequest: () => this.callbacks?.onPauseRequest(),
    }, mods, netMode);
    this.match.engineInputs = [this.input.controllers[0], this.input.controllers[1]];
    // Local matches are always recorded: it costs a few bytes per frame and it
    // is what makes the replay theatre possible without asking first.
    const record = opts.record ?? (netMode === 'off');
    if (record) {
      this.recorder = new ReplayRecorder(config.players.length);
      this.match.recorder = this.recorder;
      this.replayMeta = {
        version: 0, createdAt: 0,
        config: JSON.parse(JSON.stringify(config)) as MatchConfig,
        mods: { ...mods } as unknown as Record<string, unknown>,
        chars: config.players.map((p) => p.char),
        labels: config.players.map((p) => p.label),
        stageId: config.stageId,
        winner: -1, durationFrames: 0, timeout: false,
      };
    } else {
      this.recorder = null;
      this.replayMeta = null;
    }
    this.match.mods.showFps = this.settings.showFps;
    this.match.mods.reduceFlash = this.settings.reduceFlashing;
    (window as unknown as { __match?: Match }).__match = this.match;
    // shake setting (reduced motion overrides it entirely)
    this.match.camera.reduceShake = this.settings.reduceMotion ? 0 : this.settings.screenShake;
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
    this.acc += rawDt * Math.min(this.match.slowmo, this.match.koCam.timeScale()) * this.timeScale;
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

  /** Replay transport speed. A method (not a raw field write) so React views
   *  never mutate engine internals during render. */
  setTimeScale(v: number) { this.timeScale = Math.max(0.05, Math.min(8, v)); }

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

    // The KO cinematic's freeze takes priority over the match's own slow-mo:
    // whichever wants time to run slower this frame wins.
    const slowmo = Math.min(this.match.slowmo, this.match.koCam.timeScale()) * this.timeScale;
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
