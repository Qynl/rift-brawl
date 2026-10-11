// ============ RIFT BRAWL — KO fly-out choreography ============
//
// A KO used to end the body the instant it crossed the blast zone: state flips
// to 'ko', drawFighter early-returns, and the victim just *vanishes*. The
// particles and the camera hug the blast point, but the star of the show is
// missing. This keeps the corpse on stage for one more beat:
//
//   BLAST KO   body streaks along the launch vector, stretched like a comic
//              streak, velocity-lined and shrinking into the dark (side/bottom)
//   STAR KO    body tumbles upward, spinning and shrinking into the deep
//              background until it IS the twinkle (ceiling exits)
//   SCREEN KO  every fifth non-star exit the body slams into the camera glass:
//              grows toward the viewer, cracks the lens, then flares out
//
// Render-side only. Flights are fed FROM the simulation — a watcher notices a
// fighter entering 'ko' — and never write back into it, so determinism,
// replays and netplay are all untouched. The "random" screen-KO pick is a
// deterministic counter inside the owning Match, so the same input track
// always chooses the same KOs for the camera slam.

import { Fighter } from '../fighters/Fighter';
import { drawFighter } from '../fighters/render';
import { clamp, lerp } from '../core/constants';
import { blitGlow } from './glowSprite';

type FlyKind = 'blast' | 'star' | 'screen';

interface BlastRect { left: number; right: number; top: number; bottom: number }

interface Flight {
  f: Fighter;
  kind: FlyKind;
  x: number; y: number;
  vx: number; vy: number;
  t: number;
  rot: number;
  vrot: number;
  scale: number;
  facing: 1 | -1;
  color: string;
  /** screen-KO: world origin projected to screen at begin time */
  sx0: number; sy0: number;
  /** screen-KO: impact point on the glass */
  sx1: number; sy1: number;
  done: boolean;
}

const GRAV_STAR = 0.16;
const FLIGHT_MAX = 140;      // hard cap; a flight can never leak forever
const SCREEN_FLY_T = 26;     // frames the screen-KO body takes to reach the glass
const SCREEN_CRACK_T = 16;

export class KOFlyout {
  private flights = new Map<Fighter, Flight>();
  private screenCounter = 0;
  private tick = 0;

  /** Advance flights one sim step. Watches for fighters entering 'ko'. */
  update(fighters: Fighter[], blast: BlastRect, tick: number) {
    this.tick = tick;
    for (const f of fighters) {
      if (f.state === 'ko' && !this.flights.has(f)) this.begin(f, blast);
    }
    for (const [f, fl] of this.flights) {
      if (f.state !== 'ko' || fl.done) { this.flights.delete(f); continue; }
      fl.t++;
      if (fl.kind === 'star') {
        fl.vx *= 0.985;
        fl.vy = fl.vy * 0.985 - GRAV_STAR; // keeps climbing, spinning slower
        fl.x += fl.vx;
        fl.y += fl.vy;
        fl.rot += fl.vrot;
        fl.vrot *= 0.995;
        fl.scale = Math.max(0.12, 1 - fl.t * 0.011);
        if (fl.t > 100) fl.done = true;
      } else if (fl.kind === 'blast') {
        // accelerates slightly past the blast — the exit should feel launched
        fl.x += fl.vx * 1.06;
        fl.y += fl.vy * 1.06;
        fl.rot += fl.vrot;
        fl.scale = Math.max(0.35, 1 - fl.t * 0.02);
        if (fl.t > 32) fl.done = true;
      } else {
        // screen KO: world drift is minor; the flight is choreographed in
        // screen space in renderScreen()
        fl.x += fl.vx * 0.3;
        fl.y += fl.vy * 0.3;
        fl.rot += fl.vrot * 1.7;
        if (fl.t > SCREEN_FLY_T + SCREEN_CRACK_T + 6) fl.done = true;
      }
      if (fl.t > FLIGHT_MAX) fl.done = true;
    }
  }

  reset() { this.flights.clear(); this.screenCounter = 0; }

  private begin(f: Fighter, blast: BlastRect) {
    const exitKind: 'side' | 'top' | 'bottom' =
      f.y < blast.top ? 'top' : f.y > blast.bottom ? 'bottom' : 'side';
    let kind: FlyKind;
    if (exitKind === 'top') kind = 'star';
    else {
      // every 5th non-star exit gets the camera slam
      this.screenCounter = (this.screenCounter + 1) % 5;
      kind = this.screenCounter === 2 ? 'screen' : 'blast';
    }
    const speed = Math.hypot(f.vx, f.vy);
    this.flights.set(f, {
      f, kind,
      x: f.x, y: f.y,
      vx: f.vx, vy: f.vy,
      t: 0,
      rot: 0,
      vrot: (0.16 + Math.min(0.14, speed * 0.006)) * (speed > 8 && f.vx < 0 ? -1 : 1),
      scale: 1,
      facing: f.facing,
      color: f.cfg.info.colors.glow,
      sx0: 0, sy0: 0, sx1: 0, sy1: 0,
      done: false,
    });
  }

  /** Visual clone of the fighter mid-launch; only flight transforms differ. */
  private emitPuppet(ctx: CanvasRenderingContext2D, fl: Flight, x: number, y: number, scale: number) {
    const f = fl.f;
    const puppet = Object.assign(Object.create(Object.getPrototypeOf(f)), f, {
      state: 'launch' as const,
      x, y, px: x, py: y,
      facing: fl.facing,
      hitstop: 0, hitFlash: 0,
      invuln: 0, parried: 0,
      move: null, chargeFrames: 0,
      grounded: false, fastFalling: false,
      stateTimer: Math.max(1, Math.floor(fl.t)),
    }) as Fighter;
    // `scale` is an accessor-only member on Fighter — Object.assign writing it
    // trips the class getter ("only a getter" TypeError). Define it as an own
    // data property on the puppet instead. (Caught by tools/sim/unit.test.mjs.)
    Object.defineProperty(puppet, 'scale', {
      value: f.scale * scale,
      writable: true, enumerable: true, configurable: true,
    });
    drawFighter(ctx, puppet, this.tick, 1);
  }

  // ------------------------------------------------------------------
  //  world pass — call with the camera transform applied
  // ------------------------------------------------------------------
  renderWorld(ctx: CanvasRenderingContext2D, cam: { x: number; y: number; zoom: number }, viewW: number, viewH: number) {
    for (const fl of this.flights.values()) {
      if (fl.f.state !== 'ko') continue;
      if (fl.kind === 'screen') {
        // Remember where the body was at begin in *screen* px, so the glass
        // slam flies from there no matter what the KO camera does next.
        if (fl.t <= 2) {
          fl.sx0 = (fl.x - cam.x) * cam.zoom + viewW / 2;
          fl.sy0 = (fl.y - cam.y) * cam.zoom + viewH / 2;
          fl.sx1 = viewW * (fl.sx0 < viewW / 2 ? 0.3 : 0.7);
          fl.sy1 = viewH * (fl.sy0 < viewH / 2 ? 0.42 : 0.48);
        }
        continue;
      }

      // velocity streak behind a blast exit
      if (fl.kind === 'blast' && fl.t < 26) {
        const sp = Math.hypot(fl.vx, fl.vy);
        if (sp > 4) {
          const ux = fl.vx / sp, uy = fl.vy / sp;
          const len = sp * 7;
          const fade = 1 - fl.t / 26;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.5 * fade;
          ctx.strokeStyle = fl.color;
          ctx.lineWidth = 10 * fl.scale * fade + 2;
          ctx.beginPath();
          ctx.moveTo(fl.x - ux * 12, fl.y - uy * 12);
          ctx.lineTo(fl.x - ux * len, fl.y - uy * len);
          ctx.stroke();
          ctx.globalAlpha = 0.28 * fade;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3.5 * fl.scale;
          ctx.beginPath();
          ctx.moveTo(fl.x - ux * 8, fl.y - uy * 8);
          ctx.lineTo(fl.x - ux * len * 0.7, fl.y - uy * len * 0.7);
          ctx.stroke();
          ctx.restore();
        }
      }

      // squash along the launch vector so the body deforms like a streak
      const stretch = fl.kind === 'blast' ? clamp(Math.hypot(fl.vx, fl.vy) * 0.012, 0, 0.3) : 0;
      ctx.save();
      ctx.translate(fl.x, fl.y);
      if (stretch > 0.02) {
        ctx.rotate(Math.atan2(fl.vy, fl.vx));
        ctx.scale(1 + stretch, 1 - stretch * 0.55);
        ctx.rotate(-Math.atan2(fl.vy, fl.vx));
      }
      ctx.translate(-fl.x, -fl.y);
      this.emitPuppet(ctx, fl, fl.x, fl.y, fl.scale);
      ctx.restore();

      // STAR KO: a bright receding halo so the shrinking body reads as distant
      if (fl.kind === 'star' && fl.t > 16) {
        const k = clamp((fl.t - 16) / 70, 0, 1);
        blitGlow(ctx, fl.x, fl.y, 26 * (1 - k * 0.5), fl.color, 0.5 * (1 - k * 0.4));
      }
    }
  }

  // ------------------------------------------------------------------
  //  screen pass — device space, for the camera slam
  // ------------------------------------------------------------------
  renderScreen(ctx: CanvasRenderingContext2D, reduceMotion: boolean) {
    if (reduceMotion) return;
    for (const fl of this.flights.values()) {
      if (fl.kind !== 'screen' || fl.f.state !== 'ko') continue;
      if (fl.t <= SCREEN_FLY_T) {
        // from the remembered screen origin into the glass, growing fast
        const k = fl.t / SCREEN_FLY_T;
        const e = k * k * (3 - 2 * k); // smoothstep
        const px = lerp(fl.sx0, fl.sx1, e);
        const py = lerp(fl.sy0, fl.sy1, e);
        const sc = lerp(1, 3.4, k * k);
        ctx.save();
        this.emitPuppet(ctx, fl, px, py, Math.max(0.1, sc));
        ctx.restore();
        // speed rings blown back past the viewer
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.32 * k;
        ctx.strokeStyle = fl.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + fl.rot;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * 30 * sc, py + Math.sin(a) * 30 * sc);
          ctx.lineTo(px + Math.cos(a) * (54 * sc), py + Math.sin(a) * (54 * sc));
          ctx.stroke();
        }
        ctx.restore();
      } else if (fl.t <= SCREEN_FLY_T + SCREEN_CRACK_T) {
        // impact: radial crack + hot flare at the slam point
        const ct = fl.t - SCREEN_FLY_T;
        const k = ct / SCREEN_CRACK_T;
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - k)).toFixed(3)})`;
        ctx.lineWidth = 2.4 * (1 - k) + 0.8;
        const shards = 7;
        for (let i = 0; i < shards; i++) {
          const a = (i / shards) * Math.PI * 2 + 0.4;
          const r1 = 14 + k * 10;
          const r2 = 44 + k * 26 + (i % 3) * 15;
          ctx.beginPath();
          ctx.moveTo(fl.sx1 + Math.cos(a) * r1, fl.sy1 + Math.sin(a) * r1);
          const midA = a + (i % 2 ? 0.22 : -0.2);
          const rm = (r1 + r2) / 2;
          ctx.lineTo(fl.sx1 + Math.cos(midA) * rm, fl.sy1 + Math.sin(midA) * rm);
          ctx.lineTo(fl.sx1 + Math.cos(a) * r2, fl.sy1 + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        blitGlow(ctx, fl.sx1, fl.sy1, 60 * (1 - k * 0.5), '#ffffff', 0.65 * (1 - k));
        blitGlow(ctx, fl.sx1, fl.sy1, 110 * (1 - k * 0.4), fl.color, 0.4 * (1 - k));
        ctx.restore();
      }
    }
  }
}
