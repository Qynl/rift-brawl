// ============ RIFT BRAWL — Match Orchestrator ============
// Combat resolution, KO/stocks flow, HUD rendering, announcements.
// N-player (2..4) + host-authoritative netplay (host sim / client mirrors).

import {
  ChallengeModifiers, FighterId, InputState, MatchConfig, MatchResult, MoveData, ProjectileDef, TrainingDummy, emptyInput,
} from './core/types';
import { STEP, clamp, lerp, rand, SHIELD, MATCH, KB, shieldstunOf } from './core/constants';
import { Stage } from './stages/Stage';
import { buildStage } from './stages/stages';
import { ParticleSystem } from './effects/Particles';
import { Camera } from './core/camera';
import { AudioManager } from './audio/AudioManager';
import { Fighter, World, HitInfo, ActiveHitbox, segDist, moveActive } from './fighters/Fighter';
import { FIGHTER_CONFIGS } from './fighters/configs';
import { drawFighter, drawFighterShadow, drawShield, drawGrabLink } from './fighters/render';
import { Projectile, Trap, swingFXSpec } from './fighters/combat';
import { cachedLinear, cachedRadial } from './effects/gradientCache';
import { applyPostFX } from './effects/postfx';
import { AIController } from './ai/AIController';
import type { NetEvent, NetProjectile, NetSnapshot, NetTrap } from './net/protocol';

export interface MatchMods extends ChallengeModifiers {
  reduceFlash: boolean;
  particleQ: number;
  showFps: boolean;
  quality: string;
}

export interface MatchCallbacks {
  onEnd(result: MatchResult): void;
  onPauseRequest(): void;
}

interface Announcement { text: string; sub?: string; timer: number; max: number; size: number; color: string }

// NOTE: the Titan shockwave move data lives in fighters/Fighter.ts (single
// source of truth). Match used to carry a second, differently-tuned copy.

export class Match implements World {
  stage: Stage;
  particles = new ParticleSystem(700);
  camera: Camera;
  audio: AudioManager;
  mods: MatchMods;
  fighters: Fighter[] = [];
  projectiles: Projectile[] = [];
  traps: Trap[] = [];
  tick = 0;
  gravity = 0.52;

  phase: 'countdown' | 'fight' | 'end' = 'countdown';
  countdown = 190;
  endTimer = 0;
  winner = -1;

  // ---- match clock ----
  // Before this, a stalemate simply never ended: the balance harness measured
  // 20% of AI matches running past four minutes with no resolution.
  timeLimitFrames = 0;
  timeLeftFrames = 0;
  timedOut = false;

  // netplay
  netMode: 'off' | 'host' | 'client' = 'off';
  netSend: ((snap: NetSnapshot) => void) | null = null;   // host: transport hook
  remotePackets = new Map<number, { h: number; p: number; ax: number; ay: number }[]>(); // host: queued inputs by player index
  private remoteInputs = new Map<number, InputState>();   // host: decoded persistent input per remote player
  private clientSnapA: NetSnapshot | null = null;         // client: older snapshot
  private clientSnapB: NetSnapshot | null = null;         // client: newer snapshot
  private clientBlend = 0;                                // client: steps since snap B
  private clientEndFired = false;

  announcements: Announcement[] = [];
  respawnQueue: { f: Fighter; timer: number }[] = [];
  suddenDeath = false;

  // ui state
  shownDamage: number[] = [0, 0];
  damagePop: number[] = [0, 0];
  fade = 1;
  slowmo = 1;
  debugHitboxes = false;
  fps = 60;
  frameDataOn = false;
  paused = false;

  ais: AIController[] = [];
  inputProvider: ((slot: number) => InputState) | null = null;
  engineInputs: InputState[] = [];
  private trainingDummy: TrainingDummy | null;
  private config: MatchConfig;
  private callbacks: MatchCallbacks;
  private portraits: HTMLCanvasElement[] = [];
  private ended = false;
  private stockIcons: number;
  private koFlashTimer = 0;
  private hazardWarned = false;
  private speedlines = 0; // radial screen lines after heavy launches / KOs

  viewW = 1280; viewH = 720;

  constructor(config: MatchConfig, audio: AudioManager, viewW: number, viewH: number, callbacks: MatchCallbacks, mods: MatchMods, netMode: 'off' | 'host' | 'client' = 'off') {
    this.config = config;
    this.callbacks = callbacks;
    this.audio = audio;
    this.viewW = viewW; this.viewH = viewH;
    this.mods = mods;
    this.netMode = netMode;
    this.stage = buildStage(config.stageId);
    this.trainingDummy = config.training?.dummy ?? null;
    if (config.training) this.trainingDummy = config.training.dummy;
    this.stockIcons = config.stocks;
    const limit = config.training ? 0 : (config.timeLimit ?? MATCH.defaultTime);
    this.timeLimitFrames = Math.max(0, Math.round(limit * 60));
    this.timeLeftFrames = this.timeLimitFrames;
    this.stage.seedRng(this.stage.id.length * 7919 + config.players.length * 104729);

    if (mods.lowGravity) this.gravity *= 0.58;

    this.camera = new Camera(viewW, viewH, this.stage.camBounds);

    const mk = (id: FighterId, idx: number, label: string, stocks: number): Fighter => {
      let cfg = FIGHTER_CONFIGS[id];
      if (mods.giant) {
        cfg = { ...cfg, stats: { ...cfg.stats, scale: cfg.stats.scale * 1.45 } };
      }
      const f = new Fighter(cfg, idx, this, label);
      f.stocks = mods.oneHitKO ? 2 : stocks;
      return f;
    };

    // tiny arena: shrink geometry toward center
    if (mods.tinyArena) {
      const SHRINK = 0.55;
      for (const p of this.stage.platforms) {
        p.x *= SHRINK; p.y = 150 + (p.y - 150) * 0.8;
        p.w *= SHRINK;
        p.cx = p.x; p.cy = p.y;
        if (p.move) { p.move = { ...p.move, bx: p.move.bx * SHRINK }; }
      }
      this.stage.blast = {
        left: this.stage.blast.left * 0.62,
        right: this.stage.blast.right * 0.62,
        top: this.stage.blast.top * 0.7,
        bottom: this.stage.blast.bottom * 0.72,
      };
      this.stage.camBounds = {
        minX: this.stage.camBounds.minX * 0.62, maxX: this.stage.camBounds.maxX * 0.62,
        minY: this.stage.camBounds.minY * 0.7, maxY: this.stage.camBounds.maxY * 0.72,
      };
      this.stage.spawns = this.stage.spawns.map(s => ({ x: s.x * 0.6, y: s.y }));
    }

    // ---- build fighters (2..4) ----
    const n = clamp(config.players.length, 2, 4);
    this.shownDamage = new Array(n).fill(0);
    this.damagePop = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const ps = config.players[i];
      const stocks = ps.stocks ?? config.stocks;
      this.fighters.push(mk(ps.char, i, ps.label, stocks));
    }
    for (let i = 0; i < n; i++) {
      const ps = config.players[i];
      const f = this.fighters[i];
      if (ps.kind === 'ai') {
        f.isAI = true;
        if (!(this.trainingDummy && i === 1 && this.trainingDummy !== 'cpu')) {
          this.ais.push(new AIController(this, i, ps.personality ?? 'balanced', ps.difficulty ?? 'normal'));
        }
      }
    }

    // spawn (spread across stage spawn points)
    for (let i = 0; i < n; i++) {
      const sp = this.stage.spawns[i % this.stage.spawns.length];
      const other = this.stage.spawns[(i + 1) % this.stage.spawns.length];
      this.fighters[i].spawnAt(sp.x, sp.y - 60, sp.x < other.x ? 1 : -1);
    }

    this.portraits = this.fighters.map(f => renderPortrait(f));

    if (this.netMode !== 'client') {
      this.announcements.push({ text: '3', timer: 55, max: 55, size: 110, color: '#ffffff' });
      this.audio.play('count');
      this.pushEv({ k: 'ann', t: '3', size: 110, color: '#ffffff' });
      this.pushEv({ k: 'sfx', s: 'count' });
    }
  }

  // ================= World interface =================

  shake(a: number) {
    this.camera.addShake(a * 0.9);
    this.pushEv({ k: 'shake', a: a * 0.9 });
  }
  flash(a: number, color?: string) {
    if (!this.mods.reduceFlash) this.camera.addFlash(a, color);
    this.pushEv({ k: 'flash', a, c: color ?? '255,255,255' });
  }
  punchZoom(a: number) {
    this.camera.punchZoom(a);
    this.pushEv({ k: 'zoom', a });
  }
  emitSfx(s: string) {
    this.audio.play(s as Parameters<AudioManager['play']>[0]);
    this.pushEv({ k: 'sfx', s });
  }

  private pushEv(ev: NetEvent) {
    if (this.netMode === 'host') this.netEventBuffer.push(ev);
  }
  private netEventBuffer: NetEvent[] = [];

  announce(text: string, size: number, color: string, sub?: string, timer = 60) {
    this.announcements.push({ text, sub, timer, max: timer, size, color });
    this.pushEv({ k: 'ann', t: text, sub, size, color });
  }

  spawnProjectile(f: Fighter, move: MoveData, dir: number) {
    if (move.behavior === 'hook_grapple') {
      const hookMove: MoveData = { ...move, projectile: { kind: 'hookshot', speed: 15, life: 26, r: 8, dmg: 4, angle: 30, bkb: 10, kbg: 20, color: move.fxColor ?? '#c99aff', sfx: 'proj_boomer' } };
      this.projectiles.push(new Projectile(f, hookMove, dir));
      this.emitSfx('proj_boomer');
      return;
    }
    if (!move.projectile) return;
    // scatter volley: one input, a fan of pellets (JAEGER)
    if (move.projectile.kind === 'scatter') {
      const n = move.projectile.pellets ?? 3;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.16;
        const pellet: ProjectileDef = {
          ...move.projectile,
          vy: move.projectile.vy !== undefined ? move.projectile.vy + Math.sin(spread) * Math.abs(move.projectile.speed) * 0.7 : spread * move.projectile.speed,
        };
        this.projectiles.push(new Projectile(f, { ...move, projectile: pellet }, dir));
      }
      this.emitSfx(move.projectile.sfx);
      return;
    }
    this.projectiles.push(new Projectile(f, move, dir));
    this.emitSfx(move.projectile.sfx);
  }

  /**
   * Shared placement for every ground trap. Snaps to the platform top under the
   * requested spot and enforces a PER-OWNER CAP so a zoner cannot carpet the
   * stage — the oldest trap is retired when the cap is hit.
   */
  private placeTrap(f: Fighter, offset: number, style: Trap['style'], arm: number, cap: number, sfx = 'trap') {
    const x = f.x + f.facing * offset;
    const feet = f.y + f.h / 2;
    let bestY = feet;
    let found = false;
    for (const p of this.stage.platforms) {
      if (p.broken > 0) continue;
      if (x > p.cx && x < p.cx + p.w && p.cy >= feet - 30) {
        if (!found || p.cy < bestY) { bestY = p.cy; found = true; }
      }
    }
    const mine = this.traps.filter(t => t.owner === f && t.style === style);
    while (mine.length >= cap) {
      const oldest = mine.shift()!;
      oldest.life = 0;
      const idx = this.traps.indexOf(oldest);
      if (idx >= 0) this.traps.splice(idx, 1);
      this.particles.emit({ type: 'spark', x: oldest.x, y: oldest.y, maxLife: 14, size: 3, color: '#889', vx: 0, vy: -1 });
    }
    const t = new Trap(f, x, bestY);
    t.style = style;
    if (arm > 0) t.arm = arm;
    this.traps.push(t);
    if (sfx) this.emitSfx(sfx as Parameters<Match['emitSfx']>[0]);
    return t;
  }

  spawnTrap(f: Fighter) { this.placeTrap(f, 34, 'rune', 0, 2); }

  /** WRAITH's space control: a void pool further out than Hook's snare */
  spawnVoidSpikes(f: Fighter) { this.placeTrap(f, 96, 'spikes', 0, 2); }

  spawnVenomCloud(x: number, y: number, owner: Fighter) {
    const mine = this.traps.filter(t => t.owner === owner && t.style === 'venom');
    while (mine.length >= 3) {
      const oldest = mine.shift()!;
      const idx = this.traps.indexOf(oldest);
      if (idx >= 0) this.traps.splice(idx, 1);
    }
    const t = new Trap(owner, x, y);
    t.style = 'venom';
    t.arm = 6;
    this.traps.push(t);
    this.pushEv({ k: 'sfx', s: 'poison' });
  }

  spawnLightWard(f: Fighter) { this.placeTrap(f, 80, 'light', 0, 1); }

  /** JAEGER's Snare Trap: clamps the first fighter that steps on it */
  spawnBearTrap(f: Fighter) { this.placeTrap(f, 52, 'beartrap', 24, 2); }

  onSwing(f: Fighter, m: MoveData) {
    // replicate the weapon-swing FX on remote clients (particles are local-only)
    if (this.netMode !== 'host' || !m.hitboxes) return;
    const spec = swingFXSpec(f, m);
    if (!spec) return;
    this.pushEv({ k: 'swing', x: spec.x, y: spec.y, c: spec.ang, d: spec.dir, r: spec.radius, w: spec.scale, col: spec.color, mk: spec.kind, sp: spec.span, st: spec.style });
  }

  onHitConnect(attacker: Fighter, victim: Fighter, info: HitInfo) {
    void attacker; void victim; void info;
  }

  onCounterSuccess(f: Fighter) {
    f.startMove(FIGHTER_CONFIGS[f.id].moves['counterattack'] ?? FIGHTER_CONFIGS[f.id].moves['jab']);
    this.emitSfx('counter');
    this.flash(0.25, '180,255,220');
  }

  onShieldBreak(f: Fighter) {
    this.flash(0.3, '255,220,120');
    this.shake(0.4);
    this.announce('SHIELD BREAK!', 44, '#ffd166');
  }

  // ================= FIXED STEP =================

  step() {
    if (this.paused) return;
    if (this.netMode === 'client') { this.stepClientFrame(); return; }
    this.tick++;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.03);
    if (this.speedlines > 0) this.speedlines--;
    const inputs = this.gatherInputs();

    for (const a of this.announcements) a.timer--;
    this.announcements = this.announcements.filter(a => a.timer > 0);
    if (this.koFlashTimer > 0) this.koFlashTimer--;

    if (this.phase === 'countdown') {
      this.stepCountdown();
    } else if (this.phase === 'fight') {
      this.stepFight(inputs);
    } else if (this.phase === 'end') {
      this.stepEnd();
    }

    // damage display animation
    for (let i = 0; i < this.fighters.length; i++) {
      const target = this.fighters[i].damage;
      if (target > this.shownDamage[i]) {
        this.shownDamage[i] = Math.min(target, this.shownDamage[i] + Math.max(0.6, (target - this.shownDamage[i]) * 0.25));
        this.damagePop[i] = Math.min(1, this.damagePop[i] + 0.2);
      } else if (target < this.shownDamage[i]) {
        this.shownDamage[i] = Math.max(target, this.shownDamage[i] - 2);
      }
      this.damagePop[i] *= 0.9;
    }

    // host: broadcast snapshots at 30Hz
    if (this.netMode === 'host' && this.netSend && this.tick % 2 === 0) {
      this.netSend(this.buildSnapshot());
      this.netEventBuffer.length = 0;
    }
  }

  private gatherInputs(): InputState[] {
    const out: InputState[] = [];
    for (let i = 0; i < this.fighters.length; i++) {
      const ps = this.config.players[i];
      if (ps?.kind === 'remote') {
        out.push(this.consumeRemoteInput(i));
      } else if (this.inputProvider) {
        out.push(this.inputProvider(i));
      } else {
        out.push(this.engineInputs[i] ?? emptyInput());
      }
    }
    return out;
  }

  /** host: turn queued client packets into an InputState with proper edge semantics */
  private consumeRemoteInput(i: number): InputState {
    let st = this.remoteInputs.get(i);
    if (!st) { st = emptyInput(); this.remoteInputs.set(i, st); }
    const q = this.remotePackets.get(i);
    if (q && q.length > 0) {
      // merge all packets that arrived this step
      const held = { ...st.held }, pressed = { ...st.pressed };
      for (const k of Object.keys(st.pressed) as (keyof typeof pressed)[]) pressed[k] = false;
      let ax = st.axisX, ay = st.axisY;
      for (const pkt of q) {
        const dec = this.decodeBits(pkt);
        for (const k of Object.keys(dec.held) as (keyof typeof held)[]) {
          held[k] = dec.held[k];
          if (dec.pressed[k]) pressed[k] = true;
        }
        ax = dec.ax; ay = dec.ay;
      }
      st.held = held; st.pressed = pressed; st.released = { ...st.released };
      st.axisX = ax; st.axisY = ay;
      q.length = 0;
    } else {
      // no new packets: keep held, clear edges
      for (const k of Object.keys(st.pressed) as (keyof typeof st.pressed)[]) { st.pressed[k] = false; st.released[k] = false; }
    }
    return st;
  }

  private static ACTION_BITS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'grab', 'shield', 'dodge', 'dash'];
  private decodeBits(pkt: { h: number; p: number; ax: number; ay: number }): { held: Record<string, boolean>; pressed: Record<string, boolean>; ax: number; ay: number } {
    const held: Record<string, boolean> = {};
    const pressed: Record<string, boolean> = {};
    for (let b = 0; b < Match.ACTION_BITS.length; b++) {
      held[Match.ACTION_BITS[b]] = !!(pkt.h & (1 << b));
      pressed[Match.ACTION_BITS[b]] = !!(pkt.p & (1 << b));
    }
    return { held, pressed, ax: pkt.ax, ay: pkt.ay };
  }

  /** net transport (host side): queue a client's input packet */
  queueRemoteInput(playerIndex: number, pkt: { h: number; p: number; ax: number; ay: number }) {
    let q = this.remotePackets.get(playerIndex);
    if (!q) { q = []; this.remotePackets.set(playerIndex, q); }
    if (q.length < 8) q.push(pkt);
  }

  // ---------- CLIENT: mirror the host simulation ----------

  applySnapshot(snap: NetSnapshot) {
    if (this.netMode !== 'client') return;
    this.clientSnapA = this.clientSnapB ?? snap;
    this.clientSnapB = snap;
    this.clientBlend = 0;

    // events (particles + sfx + announcements)
    for (const ev of snap.ev) this.applyNetEvent(ev);

    // phase
    const ph = snap.ph === 0 ? 'countdown' : snap.ph === 1 ? 'fight' : 'end';
    if (this.phase !== ph) {
      this.phase = ph;
      if (ph === 'fight') { this.shake(0.3); }
    }
    this.countdown = snap.cd;
    if (snap.ph === 2 && snap.win >= 0) this.winner = snap.win;
  }

  private applyNetEvent(ev: NetEvent) {
    switch (ev.k) {
      case 'hit':
        this.particles.hitBurst(ev.x, ev.y, ev.a, ev.p, ev.c, 1);
        this.particles.damageNumber(ev.x, ev.y - 14, 0, ev.p);
        this.audio.play(ev.s as Parameters<AudioManager['play']>[0], rand(0, 2) | 0);
        this.shake(clamp(0.14 + ev.p * 0.55, 0.14, 0.85));
        break;
      case 'sfx':
        this.audio.play(ev.s as Parameters<AudioManager['play']>[0]);
        break;
      case 'swing':
        this.particles.swingFX({
          kind: ev.mk ?? 'slash', x: ev.x, y: ev.y, ang: ev.c,
          radius: ev.r, scale: ev.w, color: ev.col,
          dir: ev.d as 1 | -1, span: ev.sp ?? 2.25, grounded: false, style: ev.st ?? '',
        });
        break;
      case 'ko':
        this.particles.koBlast(ev.x, ev.y, ev.c, 1, true);
        this.audio.play('ko');
        this.shake(1.15);
        this.flash(0.55, '255,255,255');
        this.punchZoom(1.25);
        this.speedlines = 34;
        break;
      case 'ann':
        this.announcements.push({ text: ev.t, sub: ev.sub, timer: 60, max: 60, size: ev.size, color: ev.color });
        break;
      case 'parry':
        this.particles.emit({ type: 'ring', x: ev.x, y: ev.y, maxLife: 16, size: 8, color: '#ffe08a', vx: 0, vy: 0, drag: 1 });
        this.audio.play('parry');
        break;
      case 'flash':
        if (!this.mods.reduceFlash) this.camera.addFlash(ev.a, ev.c);
        break;
      case 'shake':
        this.camera.addShake(ev.a);
        break;
      case 'zoom':
        this.camera.punchZoom(ev.a);
        break;
    }
  }

  /** client: runs every engine step — interpolates between the last two snapshots */
  private stepClientFrame() {
    if (this.paused) return;
    this.tick++;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.03);
    if (this.speedlines > 0) this.speedlines--;
    for (const a of this.announcements) a.timer--;
    this.announcements = this.announcements.filter(a => a.timer > 0);
    if (this.koFlashTimer > 0) this.koFlashTimer--;

    const A = this.clientSnapA, B = this.clientSnapB;
    if (B) {
      this.clientBlend++;
      const t = clamp(this.clientBlend / 2, 0, 1.2);
      for (const fs of B.fs) {
        const f = this.fighters[fs.i];
        if (!f) continue;
        const a = A?.fs[fs.i];
        if (a && t < 1) {
          f.x = lerp(a.x, fs.x, t); f.y = lerp(a.y, fs.y, t);
        } else {
          f.x = fs.x; f.y = fs.y;
        }
        f.applyNetState({ ...fs, x: f.x, y: f.y });
      }
      // projectiles & traps rebuilt per snapshot (positions are host-owned)
      if (this.clientBlend === 1) {
        this.syncNetEntities(B);
      }
    }

    this.particles.update(1);
    this.updateCamera();
    this.updateHudAnim();

    // end flow mirrors the host timing
    if (this.phase === 'end') {
      this.endTimer++;
      if (this.endTimer === 1 && !this.clientEndFired) {
        this.clientEndFired = true;
        this.audio.setIntensity(0);
        if (this.winner >= 0 && this.fighters[this.winner]) {
          this.audio.play('victory');
        } else {
          this.audio.play('defeat');
        }
      }
      if (this.endTimer === 80 && !this.ended) {
        this.ended = true;
        this.callbacks.onEnd(this.buildResult());
      }
    }
  }

  private syncNetEntities(snap: NetSnapshot) {
    // projectiles
    this.projectiles = snap.ps.map(np => {
      const owner = this.fighters[np.o] ?? this.fighters[0];
      const fake: MoveData = {
        id: 'net', name: 'net', kind: 'special', startup: 0, active: 0, recovery: 0,
        damage: 0, angle: 0, bkb: 0, kbg: 0, sfx: '',
        projectile: { kind: np.k as never, speed: 0, life: 9999, r: np.r, dmg: 0, angle: 0, bkb: 0, kbg: 0, color: np.c, sfx: '' },
      };
      const p = new Projectile(owner, fake, Math.sign(np.vx) || 1);
      p.x = p.px = np.x; p.y = p.py = np.y; p.vx = np.vx; p.vy = np.vy;
      return p;
    });
    // traps
    this.traps = snap.ts.map(nt => {
      const owner = this.fighters[nt.o] ?? this.fighters[0];
      const t = new Trap(owner, nt.x, nt.y);
      t.style = nt.st as typeof t.style;
      t.arm = 0;
      return t;
    });
  }

  private buildSnapshot(): NetSnapshot {
    const fs = this.fighters.map(f => ({
      i: f.playerIndex,
      x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10,
      vx: Math.round(f.vx * 10) / 10, vy: Math.round(f.vy * 10) / 10,
      fc: f.facing,
      st: FIGHTER_STATE_IDS.indexOf(f.state),
      mv: f.move?.id ?? '',
      mf: f.moveFrame,
      ch: f.chargeFrames,
      dm: Math.round(f.damage * 10) / 10,
      sk: f.stocks,
      sh: Math.round(f.shieldHp),
      hf: f.hitFlash,
      gr: f.grounded ? 1 : 0,
      jw: f.jumpsUsed,
      iv: f.invuln,
      po: f.poison,
      arm: f.armorActive ? 1 : 0,
      cw: f.counterWindow ? 1 : 0,
      tc: f.techCount,
    }));
    const ps: NetProjectile[] = this.projectiles.map(p => ({
      k: p.kind, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx * 10) / 10, vy: Math.round(p.vy * 10) / 10,
      r: Math.round(p.r * 10) / 10, c: p.color, o: p.owner.playerIndex,
    }));
    const ts: NetTrap[] = this.traps.map(t => ({ x: Math.round(t.x), y: Math.round(t.y), st: t.style, o: t.owner.playerIndex }));
    return {
      t: this.tick,
      ph: this.phase === 'countdown' ? 0 : this.phase === 'fight' ? 1 : 2,
      cd: this.countdown,
      fs, ps, ts,
      ev: this.netEventBuffer,
      win: this.winner,
    };
  }

  // ---------- countdown / fight / end ----------

  private stepCountdown() {
    this.countdown--;
    const idle: InputState = emptyInput();
    this.stage.update(this.fighters, this.particles, this.mods);
    for (const f of this.fighters) f.update(idle);
    if (this.countdown === 130) { this.announce('2', 110, '#ffffff'); this.audio.play('count'); }
    if (this.countdown === 70) { this.announce('1', 110, '#ffffff'); this.audio.play('count'); }
    if (this.countdown <= 0) {
      this.phase = 'fight';
      this.announce('FIGHT!', 84, '#5cffce', undefined, 50);
      this.audio.play('go');
      this.shake(0.35);
    }
    this.particles.update(1);
    this.updateCamera();
    this.updateHudAnim();
  }

  private stepFight(inputs: InputState[]) {
    // ---- clock ----
    if (this.timeLimitFrames > 0 && !this.suddenDeath) {
      this.timeLeftFrames--;
      const secs = Math.ceil(this.timeLeftFrames / 60);
      if (this.timeLeftFrames % 60 === 0 && secs > 0 && secs <= 5) {
        this.audio.play('count');
        this.announce(String(secs), 80, '#ffd166', undefined, 40);
      }
      if (this.timeLeftFrames === 60 * 30) this.announce('30 SECONDS', 34, '#ffd166', undefined, 60);
      if (this.timeLeftFrames <= 0) { this.onTimeUp(); return; }
    }
    // AI + training dummies
    for (const ai of this.ais) {
      ai.update(inputs[ai.idx]);
    }
    if (this.trainingDummy && this.trainingDummy !== 'cpu' && this.fighters[1]) {
      this.applyDummy(inputs[1]);
    }

    // world
    this.stage.update(this.fighters, this.particles, this.mods);

    // fighters
    for (let i = 0; i < this.fighters.length; i++) {
      this.fighters[i].update(inputs[i]);
    }

    // projectiles & traps
    for (const p of this.projectiles) p.update(this);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    for (const t of this.traps) t.update(this, this.fighters);
    this.traps = this.traps.filter(t => !t.dead);

    // combat!
    this.resolveCombat();

    // hazards that damage (lava)
    this.checkLava();

    // blast zones
    this.checkBlastZones();

    // respawns
    for (const r of this.respawnQueue) r.timer--;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (this.respawnQueue[i].timer <= 0) {
        const f = this.respawnQueue[i].f;
        const sp = this.stage.spawns[f.playerIndex % this.stage.spawns.length];
        const other = this.stage.spawns[(f.playerIndex + 1) % this.stage.spawns.length];
        f.respawn(sp.x, sp.y - 130, sp.x < other.x ? 1 : -1);
        this.respawnQueue.splice(i, 1);
      }
    }

    this.particles.update(1);
    this.updateCamera();
    this.updateHudAnim();

    // music intensity
    let maxDmg = 0;
    let lastStock = false;
    for (const f of this.fighters) {
      maxDmg = Math.max(maxDmg, f.damage);
      if (f.stocks === 1) lastStock = true;
    }
    this.audio.setIntensity(clamp(maxDmg / 160 + (lastStock ? 0.45 : 0), 0, 1));
  }

  private updateHudAnim() {
    for (let i = 0; i < this.fighters.length; i++) {
      const target = this.fighters[i].damage;
      if (target > this.shownDamage[i]) {
        this.shownDamage[i] = Math.min(target, this.shownDamage[i] + Math.max(0.6, (target - this.shownDamage[i]) * 0.25));
        this.damagePop[i] = Math.min(1, this.damagePop[i] + 0.2);
      } else if (target < this.shownDamage[i]) {
        this.shownDamage[i] = Math.max(target, this.shownDamage[i] - 2);
      }
      this.damagePop[i] *= 0.9;
    }
  }

  private stepEnd() {
    this.endTimer++;
    // ease the cinematic slow-mo back to normal speed
    if (this.endTimer > 26) this.slowmo = Math.min(1, 0.3 + (this.endTimer - 26) * 0.045);
    // fighters past blast zones during victory lap are simply gone
    for (const f of this.fighters) {
      if (f.state !== 'ko' && this.stage.outOfBlast(f.x, f.y)) {
        f.state = 'ko';
        f.cancelMove();
      }
    }
    const idle = emptyInput();
    for (const f of this.fighters) f.update(idle);
    this.particles.update(1);
    this.updateCamera();
    this.updateHudAnim();
    if (this.endTimer === 1) {
      this.audio.setIntensity(0);
      const w = this.winner;
      if (w >= 0 && this.fighters[w]) {
        const winF = this.fighters[w];
        if (winF.state !== 'ko' && winF.state !== 'respawn') {
          winF.state = 'victory';
          winF.cancelMove();
        }
        for (let i = 0; i < this.fighters.length; i++) {
          if (i === w) continue;
          const loseF = this.fighters[i];
          if (loseF.state !== 'ko' && loseF.state !== 'respawn') {
            loseF.state = 'dizzy'; loseF.stateTimer = 99999;
            loseF.cancelMove();
          }
        }
        this.audio.play('victory');
      } else {
        this.audio.play('defeat');
      }
    }
    if (this.endTimer === 80 && !this.ended) {
      this.ended = true;
      this.callbacks.onEnd(this.buildResult());
    }
  }

  /**
   * Clock expiry. Ranking is stocks first, then least damage taken — the
   * standard platform-fighter tiebreak. A dead tie goes to sudden death.
   */
  private onTimeUp() {
    this.timedOut = true;
    const score = (f: Fighter) => f.stocks * 10000 - f.damage;
    const ranked = [...this.fighters].sort((a, b) => score(b) - score(a));
    const tied = ranked.filter(f => Math.abs(score(f) - score(ranked[0])) < 0.001);
    if (tied.length > 1) {
      this.suddenDeath = true;
      this.timeLeftFrames = 60 * 60;
      this.announce('SUDDEN DEATH!', 60, '#ffd166', 'tied on time', 110);
      for (const f of this.fighters) {
        if (tied.includes(f)) { f.stocks = 1; f.damage = MATCH.suddenDeathDamage; }
        else { f.stocks = 0; f.state = 'ko'; f.cancelMove(); }
      }
      this.respawnQueue.length = 0;
      for (const f of tied) this.respawnQueue.push({ f, timer: 70 + f.playerIndex * 6 });
      return;
    }
    this.winner = ranked[0].playerIndex;
    this.phase = 'end';
    this.endTimer = 0;
    this.slowmo = 0.45;
    this.announce('TIME!', 88, '#ffd166', `${ranked[0].cfg.info.name} WINS`, 170);
    this.audio.play('ko');
    this.flash(0.4, '255,220,140');
  }

  private buildResult(): MatchResult {
    return {
      winner: this.winner,
      chars: this.fighters.map(f => f.id),
      labels: this.fighters.map(f => f.label),
      stocksLeft: this.fighters.map(f => f.stocks),
      damageDealt: this.fighters.map(f => Math.round(f.damageDealt)),
      kos: this.fighters.map(f => f.kos),
      bestCombo: this.fighters.map(f => f.comboBest),
      techs: this.fighters.map(f => f.techCount),
      durationFrames: this.tick,
      timeout: this.timedOut,
    };
  }

  private applyDummy(input: InputState) {
    // reset all real inputs, then synthesize dummy behavior
    const d = this.trainingDummy!;
    const f = this.fighters[1];
    if (!f) return;
    for (const k of Object.keys(input.held) as (keyof InputState['held'])[]) {
      input.held[k] = false;
    }
    for (const k of Object.keys(input.pressed) as (keyof InputState['pressed'])[]) {
      input.pressed[k] = false; input.released[k] = false;
    }
    switch (d) {
      case 'stand': break;
      case 'jump': if (this.tick % 80 === 0) input.pressed.jump = true; input.held.shield = false; break;
      case 'attack': {
        input.held.shield = false;
        input.held.left = false; input.held.right = false; input.held.up = false; input.held.down = false;
        if (this.tick % 90 === 0) input.pressed.attack = true;
        if (this.tick % 90 >= 30 && this.tick % 90 < 34) {
          input.axisX = f.facing;
          input.held.right = f.facing > 0;
          input.held.left = f.facing < 0;
        }
        break;
      }
      case 'shield': input.held.shield = true; break;
      case 'walkoff': {
        input.held.left = f.x > 0; input.held.right = f.x <= 0;
        input.axisX = f.x > 0 ? -1 : 1;
        break;
      }
      default: break;
    }
  }

  // ================= COMBAT =================

  private resolveCombat() {
    // melee: every ordered pair
    for (let ai = 0; ai < this.fighters.length; ai++) {
      for (let vi = 0; vi < this.fighters.length; vi++) {
        if (ai === vi) continue;
        this.resolvePair(this.fighters[ai], this.fighters[vi], vi);
      }
    }

    // projectiles
    for (const p of this.projectiles) {
      for (let vi = 0; vi < this.fighters.length; vi++) {
        const victim = this.fighters[vi];
        if (victim === p.owner) continue;
        if (victim.state === 'ko' || victim.state === 'respawn' || victim.invuln > 0) continue;
        if (p.hitVictims.has(vi)) continue;
        for (const hb of victim.getHurtboxes()) {
          if (Math.hypot(hb.x - p.x, hb.y - p.y) < hb.r + p.r) {
            // gust pushes through shields without chip — a dedicated gimping/spacing tool
            if (p.kind === 'gust' && victim.state === 'shield' && victim.shielding) {
              if (!p.hitVictims.has(vi)) {
                p.hitVictims.add(vi);
                victim.vx += (p.vx > 0 ? 1 : -1) * 6.2;
                this.particles.emit({ type: 'ring', x: victim.x, y: victim.y, maxLife: 10, size: 6, color: p.color, vx: 0, vy: 0, drag: 1 });
              }
              continue;
            }
            if (victim.state === 'shield' && victim.shielding) {
              this.attemptShieldHit(p.owner, victim, vi, p.dmg, p.vx > 0 ? 1 : -1);
              p.dead = true;
            } else {
              this.applyHit(p.owner, victim, p.dmg, p.angle, p.bkb, p.kbg, p.x, p.y, false, null, false, p.venom);
              if (p.root) {
                // NET: roots the victim — long hitstun, barely any knockback
                victim.vx *= 0.15;
                victim.vy = Math.min(victim.vy, 0.5);
                victim.hitstun = Math.max(victim.hitstun, 46);
                this.particles.emit({ type: 'ring', x: victim.x, y: victim.y + 8, maxLife: 18, size: 9, color: p.color, vx: 0, vy: 0, drag: 1 });
                for (let i = 0; i < 6; i++) {
                  this.particles.emit({ type: 'glow', x: victim.x + rand(-10, 10), y: victim.y + rand(-14, 6), maxLife: 16, size: 3.5, color: p.color, vx: rand(-0.4, 0.4), vy: rand(-0.6, 0.2) });
                }
                p.dead = true;
              } else if (p.kind === 'hookshot') {
                // yank the victim toward Hook
                victim.vx = (p.owner.x > victim.x ? 1 : -1) * 8;
                victim.vy = -3;
                p.dead = true;
              } else {
                p.hitsLeft--;
                p.hitVictims.add(vi);
                if (p.kind === 'boomerang') {
                  if (p.hitsLeft <= 0) p.dead = true;
                } else {
                  p.dead = true;
                }
              }
            }
            break;
          }
        }
      }
      // boomerang re-hit cooldown
      if (p.kind === 'boomerang' && p.tick % 22 === 0) p.hitVictims.clear();
      // gravity well: pulls fighters in and re-hits periodically (NOVA)
      if (p.pull && !p.dead) {
        for (const victim of this.fighters) {
          if (victim === p.owner || victim.state === 'ko' || victim.state === 'respawn') continue;
          const dx = p.x - victim.x, dy = p.y - victim.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 190) {
            const strength = 0.34 * (1 - d / 200);
            victim.vx += (dx / d) * strength;
            victim.vy += (dy / d) * strength * 0.8;
          }
        }
        if (p.tick % 26 === 0) p.hitVictims.clear();
      }
    }
  }

  /** shield contact shared by melee & projectiles — supports the PARRY window */
  private attemptShieldHit(attacker: Fighter, victim: Fighter, victimIdx: number, dmg: number, dirSign: number, strong = false): boolean {
    void victimIdx;
    // ---- PARRY (perfect shield): shield raised within the parry window ----
    if (victim.shieldUpTimer <= SHIELD.parryWindow) {
      victim.parried = 14;
      victim.shieldHp = Math.min(victim.shieldMax, victim.shieldHp + 6);
      victim.onParry(attacker);
      attacker.applyHitstop(SHIELD.parryFreeze);
      attacker.state = 'shieldstun';
      attacker.stateTimer = Math.max(attacker.stateTimer, SHIELD.parryFreeze);
      attacker.cancelMove();
      victim.applyHitstop(4);
      attacker.vx = dirSign * 6.5;
      const px = victim.x + dirSign * 16, py = victim.y;
      this.particles.emit({ type: 'ring', x: px, y: py, maxLife: 16, size: 8, color: '#ffe08a', vx: 0, vy: 0, drag: 1 });
      this.particles.emit({ type: 'ring', x: px, y: py, maxLife: 10, size: 4, color: '#ffffff', vx: 0, vy: 0, drag: 1 });
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2);
        this.particles.emit({ type: 'spark', x: px, y: py, maxLife: 10, size: 4, color: i % 2 ? '#ffe08a' : '#ffffff', vx: Math.cos(a) * rand(1.5, 3.5), vy: Math.sin(a) * rand(1.5, 3.5) });
      }
      this.audio.play('parry');
      this.pushEv({ k: 'parry', x: px, y: py });
      this.flash(0.18, '255,230,150');
      this.shake(0.18);
      this.announce('PARRY!', 38, '#ffe08a', undefined, 36);
      return true;
    }
    victim.takeShieldHit(dmg, shieldstunOf(dmg), dirSign);
    attacker.applyHitstop(strong ? 9 : 6);
    return true;
  }

  private resolvePair(attacker: Fighter, victim: Fighter, victimIdx: number) {
    if (attacker.state === 'ko' || attacker.state === 'respawn') return;
    const hitboxes = attacker.getActiveHitboxes();
    if (hitboxes.length === 0) return;
    if (victim.state === 'ko' || victim.state === 'respawn') return;
    if (victim.grabbedBy) return;
    if (attacker.hitVictims.has(victimIdx)) return;

    for (const hb of hitboxes) {
      const hurt = victim.getHurtboxes();
      let connect = false;
      for (const h of hurt) {
        // SWEPT CAPSULE: segment (prev → curr hitbox center) vs hurtbox circle.
        // Fast arcs/thrusts/spins can no longer slip between frames — the whole swing path is live.
        const d = Math.min(
          Math.hypot(h.x - hb.x, h.y - hb.y),
          segDist(hb.px, hb.py, hb.x, hb.y, h.x, h.y),
        );
        if (d < h.r + hb.r) { connect = true; break; }
      }
      if (!connect) continue;

      // ---- COUNTER ----
      if (victim.counterWindow && !hb.grab && hb.dmg > 0) {
        attacker.hitVictims.add(victimIdx);
        const hs = 12;
        attacker.applyHitstop(hs); victim.applyHitstop(hs);
        this.particles.hitBurst(hb.x, hb.y, 0, 0.5, victim.cfg.info.colors.glow, 1);
        this.emitSfx('counter');
        this.flash(0.2, '180,255,220');
        this.onCounterSuccess(victim);
        return;
      }

      // ---- GRAB ----
      if (hb.grab) {
        if (victim.state === 'dodge' || victim.invuln > 0) continue;
        attacker.hitVictims.add(victimIdx);
        attacker.cancelMove();
        attacker.state = 'grabbing';
        attacker.grabTarget = victim;
        attacker.grabTimer = 60;
        victim.grabbedBy = attacker;
        victim.state = 'grabbed';
        victim.grabTimer = 60;
        victim.cancelMove();
        victim.shielding = false;
        attacker.traitSpec.onGrab?.(attacker, victim, attacker.trait);
        this.emitSfx('grab');
        this.emitSfx('grabbed');
        this.particles.emit({ type: 'ring', x: victim.x, y: victim.y, maxLife: 12, size: 6, color: victim.cfg.info.colors.glow, vx: 0, vy: 0 });
        return;
      }

      if (hb.dmg <= 0) continue;

      // ---- SHIELD / PARRY ----
      if (victim.state === 'shield' && victim.shielding) {
        attacker.hitVictims.add(victimIdx);
        const dir = attacker.x <= victim.x ? 1 : -1;
        this.attemptShieldHit(attacker, victim, victimIdx, hb.dmg, dir, hb.strong);
        return;
      }

      // ---- INVULNERABLE / DODGE ----
      if (victim.invuln > 0 || victim.state === 'dodge') continue;

      // ---- CLEAN HIT ----
      attacker.hitVictims.add(victimIdx);
      this.applyHit(attacker, victim, hb.dmg, hb.angle, hb.bkb, hb.kbg, hb.x, hb.y, hb.strong, hb.move, hb.sweetspot, hb.venom);

      // one-hit KO challenge
      if (this.mods.oneHitKO && victim.damage > 0 && victim.stocks > 0) {
        victim.damage = 300;
        this.koFighter(victim, 'side');
      }
      return;
    }
  }

  private applyHit(attacker: Fighter, victim: Fighter, dmg: number, angle: number, bkb: number, kbg: number, hx: number, hy: number, strong: boolean, move: ActiveHitbox['move'] | null, sweetspot = false, venom = false) {
    if (this.mods.highKnockback) { bkb *= 1.4; kbg *= 1.4; }
    if (this.mods.giant) { dmg *= 1.3; }
    // combo damage scaling: later hits in a combo deal progressively less
    const inCombo = victim.comboable && victim.lastHitBy === attacker ? attacker.comboCount : 0;
    if (inCombo >= 1) dmg *= Math.max(0.55, 1 - inCombo * 0.11);
    const kb = victim.applyKnockback(dmg, angle, bkb, kbg, attacker.facing, attacker, move);
    // combo tier stingers: the crowd hears the streak grow
    if (attacker.comboCount === 3) this.emitSfx('combo1');
    else if (attacker.comboCount === 5) this.emitSfx('combo2');
    else if (attacker.comboCount === 8) this.emitSfx('combo3');
    const hitstunMul = move?.hitstunMul ?? 1;
    victim.hitstun = Math.round(clamp(victim.hitstun * hitstunMul, KB.hitstunMin, KB.hitstunMax));
    // venom: poison stacks bite over time (VIPER)
    if (venom) victim.applyPoison(1, attacker);
    // hitstop
    const hs = attacker.hitstopFor(dmg, strong);
    attacker.applyHitstop(hs);
    victim.applyHitstop(Math.round(hs * 1.08));
    // fx
    const power = clamp(kb / 26, 0.15, 1.2);
    const color = move?.fxColor ?? attacker.cfg.info.colors.glow;
    const q = this.mods.particleQ;
    this.particles.hitBurst(hx, hy, angle, power, color, q);
    this.particles.hitStyle(attacker.cfg.weapon?.fxStyle ?? '', hx, hy, angle, color, power);
    this.particles.damageNumber(hx, hy - 14, dmg, power);
    const sfxName = dmg >= 11 ? 'hit3' : dmg >= 7 ? 'hit2' : 'hit1';
    this.audio.play(sfxName as Parameters<AudioManager['play']>[0], rand(0, 2) | 0);
    this.pushEv({ k: 'hit', x: Math.round(hx), y: Math.round(hy), a: angle, p: Math.round(power * 100) / 100, c: color, s: sfxName });
    this.shake(clamp(0.14 + power * 0.55, 0.14, 0.85));
    if (strong || kb > 15) {
      this.punchZoom(sweetspot ? 0.8 : 0.55);
      this.flash(sweetspot ? 0.24 : 0.15, sweetspot ? '255,240,190' : '255,255,255');
      this.koFlashTimer = 8;
      if (kb > 20) this.speedlines = Math.max(this.speedlines, 22);
    }
    // DI feedback: a small white ring where the victim bent the launch
    if (victim.lastDI > 5) {
      this.particles.emit({ type: 'ring', x: victim.x, y: victim.y, maxLife: 12, size: 4, color: '#bfe9ff', vx: 0, vy: 0, drag: 1 });
    }
    void attacker;
  }

  private checkLava() {
    if (this.stage.hazard.kind !== 'lava') return;
    const hz = this.stage.hazard;
    const danger = hz.phase === 'high' || hz.phase === 'rise';
    if (!danger) { this.hazardWarned = false; return; }
    if (hz.phase === 'rise' && !this.hazardWarned) {
      this.hazardWarned = true;
      this.emitSfx('lava_burst');
      this.shake(0.5);
    }
    for (const f of this.fighters) {
      if (f.state === 'ko' || f.state === 'respawn') continue;
      if (f.portalCooldown > 0) continue;
      if (f.y + f.h / 2 > hz.currentY + 6) {
        f.portalCooldown = 50;
        const kb = f.applyKnockback(16, 85, 15, 26, f.vx > 0 ? 1 : -1, null, null);
        f.hitstun = Math.max(f.hitstun, 30);
        this.emitSfx('hit3');
        this.particles.fire(f.x, hz.currentY, 24, '#ff8a3c');
        this.particles.hitBurst(f.x, hz.currentY, 90, 0.9, '#ff8a3c', 1);
        this.shake(0.6);
        this.flash(0.25, '255,120,40');
        void kb;
      }
    }
  }

  private checkBlastZones() {
    for (const f of this.fighters) {
      if (f.state === 'ko' || f.state === 'respawn') continue;
      if (this.respawnQueue.some(r => r.f === f)) continue;
      const out = this.stage.outOfBlast(f.x, f.y);
      if (out) this.koFighter(f, out);
    }
  }

  private koFighter(f: Fighter, kind: 'side' | 'bottom' | 'top') {
    f.state = 'ko';
    f.cancelMove();
    f.stocks--;
    f.grabbedBy?.releaseGrab(false);
    f.grabbedBy = null;
    // effects at clamped blast point
    const b = this.stage.blast;
    const ex = clamp(f.x, b.left + 60, b.right - 60);
    const ey = clamp(f.y, b.top + 60, b.bottom - 60);
    this.particles.koBlast(ex, ey, f.cfg.info.colors.glow, this.mods.particleQ, true);
    this.pushEv({ k: 'ko', x: Math.round(ex), y: Math.round(ey), c: f.cfg.info.colors.glow });
    this.audio.play('ko');
    this.shake(1.15);
    this.flash(0.55, '255,255,255');
    this.punchZoom(1.25);
    this.speedlines = 34;
    this.announce('KO!', 96, '#ff5c5c', undefined, 70);
    void kind;
    // credit (within 6s of last hit)
    if (f.lastHitBy && f.lastHitBy !== f && this.tick - f.lastHitTime < 360) {
      f.lastHitBy.kos++;
      f.lastHitBy.traitSpec.onKO?.(f.lastHitBy, f.lastHitBy.trait);
    }
    // end checks (N players)
    const alive = this.fighters.filter(x => x.stocks > 0);
    if (alive.length === 1) {
      this.winner = alive[0].playerIndex;
      this.phase = 'end';
      this.endTimer = 0;
      // cinematic final-KO slow-mo
      this.slowmo = 0.3;
      const winnerF = alive[0];
      this.announce(`${winnerF.cfg.info.name} WINS!`, 64, winnerF.cfg.info.colors.glow, undefined, 200);
    } else if (alive.length === 0) {
      // simultaneous final KOs
      if (this.fighters.length === 2) {
        this.suddenDeath = true;
        this.announce('SUDDEN DEATH!', 60, '#ffd166', 'next KO loses', 100);
        for (const ff of this.fighters) {
          ff.stocks = 1;
          ff.damage = 250;
        }
        this.respawnQueue.push({ f: this.fighters[0], timer: 70 }, { f: this.fighters[1], timer: 80 });
      } else {
        this.suddenDeath = true;
        this.announce('SUDDEN DEATH!', 60, '#ffd166', 'last one standing wins', 100);
        for (const ff of this.fighters) {
          ff.stocks = 1;
          ff.damage = 200;
          this.respawnQueue.push({ f: ff, timer: 70 + ff.playerIndex * 6 });
        }
      }
    } else if (f.stocks <= 0) {
      // eliminated for good
      this.announce(`${f.cfg.info.name} OUT!`, 44, '#ff8a5c', undefined, 70);
    } else {
      this.respawnQueue.push({ f, timer: 60 });
      f.lastHitBy = null;
    }
  }

  private updateCamera() {
    const pts: { x: number; y: number }[] = [];
    for (const f of this.fighters) {
      if (f.state === 'ko') continue;
      pts.push({ x: f.x, y: f.y });
    }
    if (pts.length === 0) {
      // everyone KO'd: frame the stage
      pts.push({ x: 0, y: 0 });
    }
    // slight upward bias so falling below stage stays visible
    this.camera.update(STEP, pts, -20);
  }

  // ================= RENDER =================

  render(ctx: CanvasRenderingContext2D, alpha: number) {
    const cam = this.camera;
    // background (world space w/ parallax handled inside)
    cam.apply(ctx, alpha);
    this.stage.hooks.drawBg?.(ctx, this.stage, this.tick, cam.x, cam.y, this.mods.quality);

    // platforms
    for (const p of this.stage.platforms) {
      ctx.save();
      this.stage.hooks.drawPlatform?.(ctx, this.stage, p, this.tick);
      ctx.restore();
    }

    // foreground stage elements (portals etc.)
    this.stage.hooks.drawFg?.(ctx, this.stage, this.tick, cam.x, cam.y);

    // respawn platforms
    for (const f of this.fighters) {
      if (f.state === 'respawn') {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = f.cfg.info.colors.glow;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + f.h / 2 + 6, 30, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + f.h / 2 + 6, 44, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // shadows
    for (const f of this.fighters) {
      drawFighterShadow(ctx, f, this.groundBelow(f.x, f.y), 0.5);
    }

    // grab link
    for (const f of this.fighters) drawGrabLink(ctx, f);

    // traps & projectiles under fighters
    for (const t of this.traps) t.render(ctx, alpha);
    for (const p of this.projectiles) p.render(ctx, alpha);

    // fighters (attackers drawn on top)
    const drawOrder = [...this.fighters].sort((a, b) => (a.state === 'attack' ? 1 : 0) - (b.state === 'attack' ? 1 : 0));
    for (const f of drawOrder) {
      drawFighter(ctx, f, this.tick, alpha);
    }
    // shields on top
    for (const f of this.fighters) drawShield(ctx, f, this.tick);

    // attack trails
    for (const f of this.fighters) {
      if (f.state === 'attack' && f.move && f.moveFrame > f.move.startup && f.moveFrame <= f.move.startup + moveActive(f.move)) {
        const hb = f.getActiveHitboxes()[0];
        if (hb && (f.move?.strong || f.move?.kind === 'special')) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          const g = ctx.createRadialGradient(hb.x, hb.y, 1, hb.x, hb.y, hb.r * 1.3);
          g.addColorStop(0, f.cfg.info.colors.glow);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r * 1.3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }

    // particles (world space)
    this.particles.render(ctx, 1);

    // debug overlays
    if (this.debugHitboxes) this.renderDebug(ctx);

    // ---- screen space ----
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    if (cam.flash > 0 && !this.mods.reduceFlash) {
      ctx.fillStyle = `rgba(${cam.flashColor},${(cam.flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.speedlines > 0 && !this.mods.reduceFlash) this.renderSpeedlines(ctx);

    // ---- post processing: bloom + impact aberration ----
    // Runs on the world layer only, BEFORE the HUD, so the UI stays crisp.
    if (this.mods.quality !== 'low') {
      const impact = clamp(this.koFlashTimer / 8, 0, 1);
      applyPostFX(ctx, this.viewW, this.viewH, {
        bloom: this.mods.quality === 'high' ? 0.5 : 0.3,
        aberration: this.mods.reduceFlash ? 0 : impact * 0.9,
        dpr: cam.dpr,
      });
      ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    }

    this.renderVignette(ctx);
    this.renderHUD(ctx);
  }

  /** Cinematic vignette + top gradient — unifies the whole frame */
  private renderVignette(ctx: CanvasRenderingContext2D) {
    const W = this.viewW, H = this.viewH;
    if (this.mods.quality === 'low') return;
    ctx.save();
    ctx.fillStyle = cachedRadial(ctx, W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(2,2,10,0.42)']]);
    ctx.fillRect(0, 0, W, H);
    // soft top darkening for HUD readability
    ctx.fillStyle = cachedLinear(ctx, 0, 0, 0, H * 0.2,
      [[0, 'rgba(2,2,12,0.3)'], [1, 'rgba(2,2,12,0)']]);
    ctx.fillRect(0, 0, W, H * 0.2);
    ctx.restore();
  }

  private groundBelow(x: number, y: number): number | null {
    let best: number | null = null;
    for (const p of this.stage.platforms) {
      if (p.broken > 0) continue;
      if (x >= p.cx - 4 && x <= p.cx + p.w + 4 && p.cy >= y - 10) {
        if (best === null || p.cy < best) best = p.cy;
      }
    }
    return best;
  }

  private renderDebug(ctx: CanvasRenderingContext2D) {
    this.camera.apply(ctx, 1);
    for (const f of this.fighters) {
      // hurtboxes
      ctx.strokeStyle = 'rgba(80,160,255,0.9)';
      ctx.lineWidth = 1.5;
      for (const h of f.getHurtboxes()) {
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
      }
      // hitboxes
      ctx.strokeStyle = 'rgba(255,70,70,0.95)';
      ctx.fillStyle = 'rgba(255,70,70,0.18)';
      for (const hb of f.getActiveHitboxes()) {
        ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      // center + velocity
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
      ctx.strokeStyle = '#7cff7c';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + f.vx * 4, f.y + f.vy * 4);
      ctx.stroke();
      // state label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText(`${f.cfg.info.name} ${f.state}${f.move ? ':' + f.move.id + ':' + f.moveFrame : ''} v:${f.vx.toFixed(1)},${f.vy.toFixed(1)} j:${f.jumpsUsed}`, f.x - 40, f.y - f.h * 0.75);
    }
    // blast zones
    const b = this.stage.blast;
    ctx.strokeStyle = 'rgba(255,90,90,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.setTransform(this.camera.dpr, 0, 0, this.camera.dpr, 0, 0);
  }

  /** Radial anime-style speed lines burst (screen space) */
  private renderSpeedlines(ctx: CanvasRenderingContext2D) {
    const W = this.viewW, H = this.viewH;
    const cx = W / 2, cy = H / 2;
    const t = this.speedlines / 34;
    const n = 22;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${(t * 0.34).toFixed(3)})`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.05;
      const r0 = Math.max(W, H) * (0.34 + (1 - t) * 0.1) + (i % 4) * 26;
      const r1 = r0 + Math.max(W, H) * (0.16 + t * 0.3);
      ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderHUD(ctx: CanvasRenderingContext2D) {
    const W = this.viewW, H = this.viewH;
    const pad = Math.max(18, W * 0.02);
    const n = this.fighters.length;

    // player cards: 1v1 keeps the big corner plates; 3-4P spread across the bottom
    if (n <= 2) {
      this.drawPlayerCard(ctx, this.fighters[0], pad, H - 108, this.portraits[0], false, 1);
      this.drawPlayerCard(ctx, this.fighters[1], W - pad, H - 108, this.portraits[1], true, 1);
    } else {
      const scale = n === 3 ? 0.82 : 0.72;
      const cardW = 262 * scale;
      const gap = 10;
      const totalW = n * cardW + (n - 1) * gap;
      let x0 = (W - totalW) / 2;
      for (let i = 0; i < n; i++) {
        this.drawPlayerCard(ctx, this.fighters[i], x0, H - 96, this.portraits[i], false, scale);
        x0 += cardW + gap;
      }
    }

    // ---- match clock ----
    if (this.timeLimitFrames > 0) {
      const total = Math.max(0, this.timeLeftFrames);
      const mm = Math.floor(total / 3600);
      const ss = Math.floor((total % 3600) / 60);
      const cs = Math.floor((total % 60) / 0.6);
      const low = total < 60 * 10;
      const urgent = low ? 0.55 + Math.sin(this.tick * 0.35) * 0.45 : 1;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cw = 138, ch = 44;
      ctx.fillStyle = 'rgba(8,8,20,0.78)';
      roundRect(ctx, W / 2 - cw / 2, 8, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = low ? `rgba(255,90,90,${urgent.toFixed(2)})` : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = low ? 2 : 1;
      roundRect(ctx, W / 2 - cw / 2, 8, cw, ch, 10); ctx.stroke();
      ctx.font = '900 26px "Arial Black", sans-serif';
      ctx.fillStyle = low ? '#ff6b6b' : '#ffffff';
      if (low) { ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 14 * urgent; }
      ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, W / 2 - 12, 31);
      ctx.shadowBlur = 0;
      ctx.font = '800 14px "Segoe UI", sans-serif';
      ctx.fillStyle = low ? 'rgba(255,140,140,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.fillText(`.${String(cs).padStart(2, '0')}`, W / 2 + 40, 33);
      ctx.restore();
    }

    // netplay status chip
    if (this.netMode !== 'off') {
      ctx.save();
      ctx.font = '600 12px monospace';
      ctx.fillStyle = 'rgba(140,255,220,0.75)';
      ctx.textAlign = 'center';
      ctx.textAlign = 'left';
      ctx.fillText(this.netMode === 'host' ? 'ONLINE · HOST' : 'ONLINE · CLIENT', 18, 26);
      ctx.restore();
    }

    // hazard warning banner
    const hz = this.stage.hazard;
    const wind = this.stage.wind;
    let warnText: string | null = null;
    if (hz.kind === 'lava' && (hz.phase === 'warn' || hz.phase === 'rise')) warnText = '⚠ LAVA SURGE';
    if (wind.phase === 'warn') warnText = '⚠ WIND INCOMING';
    if (wind.phase === 'active') warnText = '~~ WIND ~~';
    if (warnText) {
      const pulse = 0.6 + Math.sin(this.tick * 0.25) * 0.4;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = '700 22px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeText(warnText, W / 2, 64);
      ctx.fillText(warnText, W / 2, 64);
      ctx.restore();
    }

    // announcements — chromatic punch-in with glow
    const ann = this.announcements[0];
    if (ann) {
      const t = 1 - ann.timer / ann.max;
      const inScale = t < 0.18 ? 1.9 - (t / 0.18) * 0.9 : 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.05;
      const outAlpha = ann.timer < 12 ? ann.timer / 12 : 1;
      ctx.save();
      ctx.translate(W / 2, H * 0.36);
      ctx.scale(inScale, inScale);
      ctx.globalAlpha = outAlpha;
      ctx.font = `900 ${ann.size}px "Arial Black", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(10,8,20,0.85)';
      ctx.strokeText(ann.text, 0, 0);
      // chromatic ghost copies (only during the punch-in — flashy but brief)
      if (t < 0.3 && !this.mods.reduceFlash) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = outAlpha * (1 - t / 0.3) * 0.5;
        ctx.fillStyle = '#4dfcd0';
        ctx.fillText(ann.text, -ann.size * 0.022, 0);
        ctx.fillStyle = '#ff5c8a';
        ctx.fillText(ann.text, ann.size * 0.022, 1);
        ctx.restore();
      }
      const grad = ctx.createLinearGradient(0, -ann.size / 2, 0, ann.size / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, ann.color);
      ctx.fillStyle = grad;
      ctx.fillText(ann.text, 0, 0);
      if (ann.sub) {
        ctx.font = '600 18px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(ann.sub, 0, ann.size * 0.62);
      }
      ctx.restore();
    }

    // combo counters
    for (let i = 0; i < this.fighters.length; i++) {
      const atk = this.fighters[i];
      if (atk.comboCount >= 2) {
        // draw over the fighter currently being comboed (the last one hit by atk)
        const vic = this.fighters.find(f => f.lastHitBy === atk && f.comboable) ?? this.fighters[1 - i] ?? atk;
        ctx.save();
        ctx.font = '900 26px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        const text = `${atk.comboCount - 1} HIT COMBO!`;
        ctx.strokeText(text, vic.x, vic.y - vic.h - 18);
        ctx.fillStyle = atk.cfg.info.colors.glow;
        ctx.fillText(text, vic.x, vic.y - vic.h - 18);
        ctx.restore();
      }
    }

    // tech popups (small cyan chip above the fighter that just teched)
    for (const f of this.fighters) {
      if (f.techFlash > 0) {
        const t = f.techFlash / 26;
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.font = '900 17px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const ty = f.y - f.h - 10 - (1 - t) * 14;
        ctx.strokeText('TECH!', f.x, ty);
        ctx.fillStyle = '#bfe9ff';
        ctx.fillText('TECH!', f.x, ty);
        ctx.restore();
      }
    }

    // training HUD extras
    if (this.config.training) {
      ctx.save();
      ctx.font = '600 14px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'left';
      const lines = [
        `FRAME ${this.tick}  SPEED x${this.slowmo}`,
        `DUMMY: ${(this.trainingDummy ?? 'cpu').toUpperCase()}`,
        `[R] RESET  [T] DAMAGE  [H] HITBOXES  [G] SPEED  [Y] DUMMY`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, pad, 30 + i * 20));
      ctx.restore();
    }

    // debug info
    if (this.mods.showFps || this.debugHitboxes) {
      ctx.save();
      ctx.font = '600 13px monospace';
      ctx.fillStyle = this.fps < 50 ? '#ff8a5c' : 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(this.fps)} FPS`, W - pad, 26);
      ctx.restore();
    }

    // fade-in
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(5,4,12,${this.fade.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawPlayerCard(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, portrait: HTMLCanvasElement, alignRight: boolean, uiScale: number) {
    const scale = clamp((this.viewW / 1280) * uiScale, 0.55, 1.2);
    const cardW = 262 * scale, cardH = 102 * scale;
    const x0 = alignRight ? x - cardW : x;
    const c = f.cfg.info.colors;
    const dmg = Math.floor(this.shownDamage[f.playerIndex]);
    const pop = this.damagePop[f.playerIndex];
    ctx.save();
    // ---- angled plate (Smash-style skew) ----
    const skew = (alignRight ? -1 : 1) * 0.09;
    ctx.translate(x0 + cardW / 2, y + cardH / 2);
    ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.translate(-cardW / 2, -cardH / 2);
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 4, 6, cardW, cardH, 8);
    ctx.fill();
    // body gradient
    ctx.fillStyle = cachedLinear(ctx, 0, 0, 0, cardH,
      [[0, 'rgba(16,15,34,0.92)'], [1, 'rgba(8,8,20,0.94)']]);
    roundRect(ctx, 0, 0, cardW, cardH, 8);
    ctx.fill();
    // team color spine
    ctx.fillStyle = c.primary;
    ctx.fillRect(alignRight ? cardW - 5 : 0, 0, 5, cardH);
    // top shine line
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, cardW - 1, cardH - 1, 8);
    ctx.stroke();
    // poison tint while venom is ticking
    if (f.poison > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14 + Math.sin(this.tick * 0.2) * 0.05;
      ctx.fillStyle = '#aef65c';
      roundRect(ctx, 0, 0, cardW, cardH, 8);
      ctx.fill();
      ctx.restore();
    }
    // hit flash of the whole plate
    if (pop > 0.05) {
      ctx.globalAlpha = pop * 0.5;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 0, 0, cardW, cardH, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // ---- portrait ----
    const pw = 72 * scale, ph = 78 * scale;
    const pxp = alignRight ? cardW - pw - 10 : 10;
    ctx.save();
    roundRect(ctx, pxp, 7, pw, ph, 6);
    ctx.clip();
    ctx.fillStyle = c.secondary;
    ctx.fillRect(pxp, 7, pw, ph);
    ctx.drawImage(portrait, pxp, 7, pw, ph);
    // portrait color wash
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = c.primary;
    ctx.fillRect(pxp, 7, pw, ph);
    ctx.restore();
    // portrait frame
    ctx.strokeStyle = c.primary + 'cc';
    ctx.lineWidth = 2;
    roundRect(ctx, pxp, 7, pw, ph, 6);
    ctx.stroke();
    // ---- name tag ----
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${13 * scale}px "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = alignRight ? 'right' : 'left';
    const nameX = alignRight ? cardW - pw - 22 : pw + 22;
    ctx.fillText(`${f.label} · ${f.cfg.info.name}`, nameX, 24 * scale);
    // underline
    ctx.fillStyle = c.glow;
    ctx.fillRect(alignRight ? cardW - pw - 22 - 120 * scale : pw + 22, 27 * scale, 120 * scale, 1.5);
    // ---- status strip (poison / burn / chill / shock) ----
    const statuses: [string, string][] = [];
    if (f.poison > 0) statuses.push([`☠${f.poison}`, '#aef65c']);
    if (f.burn > 0) statuses.push(['🔥', '#ff8a3c']);
    if (f.chill > 0) statuses.push([`❄${f.chill}`, '#9fe8ff']);
    if (f.shock > 0) statuses.push(['⚡', '#7cf3ff']);
    if (statuses.length) {
      ctx.font = `800 ${11 * scale}px "Segoe UI", sans-serif`;
      ctx.textAlign = alignRight ? 'right' : 'left';
      let sx = alignRight ? cardW - pw - 22 : pw + 22;
      for (const [glyph, colr] of statuses) {
        ctx.fillStyle = colr;
        ctx.fillText(glyph, sx, 40 * scale);
        sx += (alignRight ? -1 : 1) * 26 * scale;
      }
    }
    // ---- big italic damage % ----
    const col = dmg < 50 ? '#ffffff' : dmg < 90 ? '#ffd166' : dmg < 140 ? '#ff8a5c' : '#ff4d4d';
    const popScale = 1 + pop * 0.4;
    ctx.save();
    ctx.translate(nameX + (alignRight ? -46 * scale : 46 * scale), 62 * scale);
    ctx.transform(1, 0, -0.12, 1, 0, 0); // italic lean
    ctx.scale(popScale, popScale);
    ctx.font = `900 ${34 * scale}px "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(`${dmg}%`, 0, 0);
    // glow underlay at high damage
    if (dmg >= 90) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp((dmg - 90) / 90, 0, 1) * 0.5;
      ctx.fillStyle = col;
      ctx.fillText(`${dmg}%`, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = col;
    ctx.fillText(`${dmg}%`, 0, 0);
    ctx.restore();
    // ---- SIGNATURE RESOURCE METER ----
    // Every fighter has one and it is never the same bar twice: pips for
    // ammo-style kits, a smooth bar for charge-style kits.
    {
      const spec = f.traitSpec, t = f.trait;
      const mw = 108 * scale, mh = 7 * scale;
      const mx = alignRight ? cardW - pw - 22 - mw : pw + 22;
      const my = 66 * scale;
      const pulse = t.flash > 0 ? 0.45 + Math.sin(this.tick * 0.7) * 0.35 : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, mx, my, mw, mh, mh / 2); ctx.fill();
      if (spec.segments > 0) {
        const seg = spec.segments;
        const gap = 3 * scale;
        const sw = (mw - gap * (seg - 1)) / seg;
        for (let i = 0; i < seg; i++) {
          const filled = i < t.charges;
          ctx.fillStyle = filled ? spec.color : 'rgba(255,255,255,0.07)';
          if (filled) { ctx.shadowColor = spec.color; ctx.shadowBlur = 6 * scale; }
          roundRect(ctx, mx + i * (sw + gap), my, sw, mh, 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        // partial refill on the next empty pip
        if (t.charges < seg && t.meter > 0) {
          const frac = clamp(t.meter * seg - t.charges, 0, 1);
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = spec.color;
          roundRect(ctx, mx + t.charges * (sw + gap), my, sw * frac, mh, 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = spec.color;
        ctx.shadowColor = spec.color;
        ctx.shadowBlur = t.meter >= 1 ? 10 * scale : 4 * scale;
        roundRect(ctx, mx, my, Math.max(2, mw * clamp(t.meter, 0, 1)), mh, mh / 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (pulse > 0) {
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, mx, my, mw, mh, mh / 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = `800 ${9 * scale}px "Segoe UI", sans-serif`;
      ctx.textAlign = alignRight ? 'right' : 'left';
      ctx.fillStyle = t.active || t.meter >= 1 ? spec.color : 'rgba(255,255,255,0.5)';
      const caption = spec.hudText?.(f, t) ?? spec.label;
      ctx.fillText(`${spec.label} ${caption}`, alignRight ? mx + mw : mx, my - 3 * scale);
      ctx.restore();
    }

    // ---- stock pips (glowing hexes) ----
    const stockY = 84 * scale;
    const maxPips = 5;
    if (this.stockIcons <= maxPips) {
      for (let i = 0; i < this.stockIcons; i++) {
        const sx = nameX + (alignRight ? -8 - i * 19 * scale : 8 + i * 19 * scale);
        const alive = i < f.stocks;
        ctx.save();
        ctx.translate(sx, stockY);
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * 6.4 * scale, Math.sin(a) * 6.4 * scale);
        }
        ctx.closePath();
        if (alive) {
          ctx.fillStyle = c.glow;
          ctx.shadowColor = c.glow;
          ctx.shadowBlur = 6;
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fill();
        }
        ctx.restore();
      }
    } else {
      ctx.font = `800 ${13 * scale}px "Segoe UI", sans-serif`;
      ctx.fillStyle = c.glow;
      ctx.textAlign = alignRight ? 'right' : 'left';
      ctx.fillText(`\u221E (${f.stocks})`, nameX + (alignRight ? 0 : 8 * scale), stockY + 5 * scale);
    }
    ctx.restore();
  }

  onKeyDown(code: string) {
    if (!this.config.training) return;
    switch (code) {
      case 'KeyR': {
        for (const [i, f] of this.fighters.entries()) {
          const sp = this.stage.spawns[i % this.stage.spawns.length];
          f.spawnAt(sp.x, sp.y - 60, i === 0 ? 1 : -1);
          f.damage = 0;
          f.poison = 0; f.poisonTimer = 0;
        }
        this.shownDamage = this.fighters.map(() => 0);
        this.projectiles = []; this.traps = [];
        this.audio.play('ui_select');
        break;
      }
      case 'KeyT':
        for (const f of this.fighters) { f.damage = 0; f.poison = 0; f.poisonTimer = 0; }
        this.shownDamage = this.fighters.map(() => 0);
        this.audio.play('ui_move');
        break;
      case 'KeyH':
        this.debugHitboxes = !this.debugHitboxes;
        break;
      case 'KeyG':
        this.slowmo = this.slowmo === 1 ? 0.5 : this.slowmo === 0.5 ? 0.25 : 1;
        this.audio.play('ui_move');
        break;
      case 'KeyY': {
        const order: TrainingDummy[] = ['stand', 'jump', 'attack', 'shield', 'cpu'];
        const cur = order.indexOf(this.trainingDummy ?? 'cpu');
        const next = order[(cur + 1) % order.length];
        this.trainingDummy = next;
        // rebuild the slot-1 AI (or drop it for scripted dummies)
        this.ais = this.ais.filter(a => a.idx !== 1);
        if (next === 'cpu') {
          this.ais.push(new AIController(this, 1, this.config.players[1]?.personality ?? 'balanced', this.config.players[1]?.difficulty ?? 'normal'));
        }
        this.audio.play('ui_move');
        break;
      }
    }
  }

  destroy() {
    this.ended = true;
    this.particles.clear();
  }
}

// state index order shared with Fighter.applyNetState (must match FIGHTER_STATES there)
const FIGHTER_STATE_IDS = ['idle', 'walk', 'crouch', 'dash', 'jumpsquat', 'air', 'land', 'attack', 'hitstun', 'launch', 'shield', 'shieldstun', 'shieldbreak', 'dodge', 'grabbing', 'grabbed', 'thrown', 'respawn', 'ko', 'dizzy', 'taunt', 'victory', 'ledge'];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.closePath();
}

/** Pre-render a fighter portrait (idle pose) */
function renderPortrait(f: Fighter): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 136; c.height = 144;
  const ctx = c.getContext('2d')!;
  ctx.save();
  // backdrop gradient
  const g = ctx.createLinearGradient(0, 0, 0, 144);
  g.addColorStop(0, f.cfg.info.colors.secondary);
  g.addColorStop(1, '#0a0a18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 136, 144);
  ctx.translate(68, 132);
  ctx.scale(1.65, 1.65);
  // draw at origin — the fighter's world position must not bleed into the portrait
  const keepX = f.x, keepY = f.y, keepPx = f.px, keepPy = f.py;
  f.x = f.y = f.px = f.py = 0;
  drawFighter(ctx, f, 30, 1);
  f.x = keepX; f.y = keepY; f.px = keepPx; f.py = keepPy;
  ctx.restore();
  return c;
}
