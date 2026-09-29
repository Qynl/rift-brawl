// ============ RIFT BRAWL — KO cinematic ============
//
// A KO used to be a particle burst, a flash and a shake. That reads as "a
// thing happened" rather than "you just sent someone into orbit". This module
// turns it into a short, directed shot:
//
//   frames 0-6    hard freeze, hot white core, chromatic punch
//   frames 0-26   camera snaps to the blast point and punches in
//   frames 2-40   shockwave rings fire along the launch vector
//   frames 0-55   screen-edge flare on the side they left through
//   frames 8-70   STAR KO twinkle when they exit through the ceiling
//   final KO      letterbox bars ease in and hold through the victory pose
//
// Everything is drawn with cached gradients/sprites and plain shapes, so the
// whole sequence costs no per-frame allocations.

import { blitGlow } from './glowSprite';
import { cachedLinear } from './gradientCache';

export type KOKind = 'side' | 'top' | 'bottom';

export interface KOShot {
  /** blast point, clamped into the blast zone rectangle */
  x: number;
  y: number;
  /** launch velocity at the moment of the KO, for orienting the effects */
  vx: number;
  vy: number;
  color: string;
  kind: KOKind;
  /** true when this KO ends the match */
  final: boolean;
}

const DURATION = 78;

function rgba(hex: string, a: number): string {
  const n = hex.replace('#', '');
  if (n.length < 6) return `rgba(255,255,255,${a})`;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export class KOCinematic {
  /** frames elapsed since the shot started; -1 when idle */
  t = -1;
  shot: KOShot | null = null;
  /** set true by the owner when the player asked for reduced flashing */
  reduceFlash = false;
  /** set true by the owner when the player asked for reduced motion — the
   *  freeze and the camera snap are skipped, the effects still draw */
  reduceMotion = false;

  get active(): boolean { return this.t >= 0 && this.t < DURATION; }

  trigger(shot: KOShot) {
    this.shot = shot;
    this.t = 0;
  }

  reset() { this.t = -1; this.shot = null; }

  update() {
    if (this.t >= 0) {
      this.t++;
      if (this.t >= DURATION) this.t = -1;
    }
  }

  /**
   * Simulation speed multiplier for this frame. The freeze is what sells the
   * hit: six frames of near-stop, then a fast ramp back so the match never
   * feels sluggish.
   */
  timeScale(): number {
    if (!this.active || this.reduceMotion) return 1;
    const t = this.t;
    if (t < 6) return 0.06;
    if (t < 22) return 0.06 + ((t - 6) / 16) * 0.74;
    if (t < 34) return 0.8 + ((t - 22) / 12) * 0.2;
    return 1;
  }

  /**
   * Camera target override. Returning a point makes the fit-all camera frame
   * the blast instead of the survivors, which is what turns a KO into a shot.
   */
  focus(): { x: number; y: number; strength: number } | null {
    if (!this.active || !this.shot || this.reduceMotion) return null;
    const t = this.t;
    if (t > 30) return null;
    // ease out: full authority at impact, released over half a second
    const strength = t < 12 ? 1 : 1 - (t - 12) / 18;
    return { x: this.shot.x, y: this.shot.y, strength: Math.max(0, strength) };
  }

  // -------------------------------------------------------------------------
  //  world space — drawn with the camera transform applied
  // -------------------------------------------------------------------------

  renderWorld(ctx: CanvasRenderingContext2D) {
    if (!this.active || !this.shot) return;
    const { x, y, vx, vy, color } = this.shot;
    const t = this.t;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // --- hot core: a brief, very bright ball at the blast point -------------
    if (t < 14) {
      const k = 1 - t / 14;
      const r = 26 + t * 9;
      ctx.globalAlpha = 1;
      blitGlow(ctx, x, y, r, '#ffffff', k * (this.reduceFlash ? 0.35 : 0.9));
      blitGlow(ctx, x, y, r * 1.6, color, k * 0.55);
    }

    // --- shockwave rings ----------------------------------------------------
    // Three rings staggered a few frames apart, squashed along the launch
    // vector so the blast visibly points the way they went.
    const ang = Math.atan2(vy, vx);
    for (let i = 0; i < 3; i++) {
      const rt = t - i * 5;
      if (rt < 0 || rt > 30) continue;
      const k = rt / 30;
      const r = 20 + k * (200 + i * 40);
      ctx.globalAlpha = (1 - k) * (1 - k) * (0.55 - i * 0.12);
      ctx.strokeStyle = i === 0 ? '#ffffff' : color;
      ctx.lineWidth = Math.max(1, 7 * (1 - k));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- launch beam: a tapering streak along the exit vector ---------------
    if (t < 24) {
      const k = 1 - t / 24;
      const len = 260 + t * 26;
      const w = 34 * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = rgba(color, 0.9);
      ctx.beginPath();
      ctx.moveTo(0, -w);
      ctx.lineTo(len, -w * 0.12);
      ctx.lineTo(len, w * 0.12);
      ctx.lineTo(0, w);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- radial shards ------------------------------------------------------
    if (t < 30) {
      const k = 1 - t / 30;
      ctx.globalAlpha = k * 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2 * k;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = ang + (i / 12) * Math.PI * 2;
        const inner = 24 + t * 6;
        const outer = inner + 40 * k + (i % 3) * 14;
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  //  screen space — drawn after the world, before the HUD
  // -------------------------------------------------------------------------

  renderScreen(ctx: CanvasRenderingContext2D, viewW: number, viewH: number) {
    if (!this.active || !this.shot) return;
    const { kind, color, final } = this.shot;
    const t = this.t;

    ctx.save();

    // --- edge flare: light pours in from the side they left through ---------
    if (t < 46 && !this.reduceFlash) {
      const k = t < 6 ? t / 6 : 1 - (t - 6) / 40;
      const a = Math.max(0, k) * 0.7;
      if (a > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        const depth = Math.min(viewW, viewH) * 0.38;
        const stops = [[0, rgba(color, 0.85)], [0.45, rgba(color, 0.22)], [1, rgba(color, 0)]] as const;
        if (kind === 'top') {
          ctx.fillStyle = cachedLinear(ctx, 0, 0, 0, depth, stops);
          ctx.fillRect(0, 0, viewW, depth);
        } else if (kind === 'bottom') {
          ctx.fillStyle = cachedLinear(ctx, 0, viewH, 0, viewH - depth, stops);
          ctx.fillRect(0, viewH - depth, viewW, depth);
        } else {
          const right = this.shot.vx > 0;
          ctx.fillStyle = right
            ? cachedLinear(ctx, viewW, 0, viewW - depth, 0, stops)
            : cachedLinear(ctx, 0, 0, depth, 0, stops);
          ctx.fillRect(right ? viewW - depth : 0, 0, depth, viewH);
        }
      }
    }

    // --- STAR KO: they left through the ceiling, so send them to the sky ----
    if (kind === 'top' && t >= 6) {
      const k = Math.min(1, (t - 6) / 52);
      const sx = viewW * 0.5 + Math.sin(k * 2.4) * viewW * 0.14;
      const sy = viewH * (0.62 - k * 0.58);
      const size = 26 * (1 - k * 0.86);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k * 0.55;
      blitGlow(ctx, sx, sy, size * 2.4, color, 1 - k * 0.55);
      // four-point twinkle
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.8, 2.4 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(sx - size, sy); ctx.lineTo(sx + size, sy);
      ctx.moveTo(sx, sy - size); ctx.lineTo(sx, sy + size);
      const d = size * 0.45;
      ctx.moveTo(sx - d, sy - d); ctx.lineTo(sx + d, sy + d);
      ctx.moveTo(sx + d, sy - d); ctx.lineTo(sx - d, sy + d);
      ctx.stroke();
    }

    // --- letterbox on the match-winning KO ----------------------------------
    if (final) {
      const bar = viewH * 0.085 * Math.min(1, t / 8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, viewW, bar);
      ctx.fillRect(0, viewH - bar, viewW, bar);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = rgba(color, 0.8);
      ctx.fillRect(0, bar - 1.5, viewW, 1.5);
      ctx.fillRect(0, viewH - bar, viewW, 1.5);
    }

    ctx.restore();
  }
}
