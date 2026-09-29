// ============ RIFT BRAWL — stage lighting profiles ============
//
// The twelve fighters are drawn identically no matter where they are standing,
// which is exactly why they used to look pasted on top of the backgrounds: a
// character lit for a neon alley looked the same in a snowfield.
//
// This module gives every stage a small lighting description and three cheap
// passes that use it:
//
//   bounce      an additive glow thrown up onto a fighter from the floor —
//               lava turns Vanguard's greaves orange, ice turns them blue
//   reflection  a mirrored, clipped, faded copy of the fighter inside glossy
//               platforms (ice, wet neon asphalt, rift crystal)
//   grade       a two-fillRect screen-space colour grade that pushes the
//               frame's shadows and highlights toward the stage's palette
//
// All three are fixed-cost: at most one extra fighter draw per fighter, one
// glow blit per fighter, and two full-screen rectangles per frame.

import type { Fighter } from '../fighters/Fighter';
import type { Platform } from './Stage';
import { blitGlow } from '../effects/glowSprite';
import { cachedLinear } from '../effects/gradientCache';

export interface StageLighting {
  /** multiplied over the finished frame — drags shadows toward the palette */
  shade: string;
  /** additive key light poured in from the top of the screen */
  key: string;
  /** how far down the screen the key light reaches, 0..1 */
  keyDrop: number;
  /** colour the floor throws back up onto fighters, null for matte stages */
  bounce: string | null;
  /** strength of that bounce, 0..1 */
  bounceAmt: number;
  /** platform glossiness, 0 = matte, 1 = mirror */
  reflect: number;
}

const MATTE: StageLighting = {
  shade: 'rgba(16,18,34,0.10)',
  key: 'rgba(255,255,255,0.03)',
  keyDrop: 0.42,
  bounce: null,
  bounceAmt: 0,
  reflect: 0,
};

const PROFILES: Record<string, StageLighting> = {
  // Dusk woodland: cool green shadow, warm low sun raking in from above.
  forest: {
    shade: 'rgba(22,52,44,0.16)', key: 'rgba(255,214,150,0.055)', keyDrop: 0.5,
    bounce: '#3f7d4e', bounceAmt: 0.12, reflect: 0,
  },
  // Magma sea: everything is underlit. The floor is the brightest thing here.
  volcano: {
    shade: 'rgba(58,18,10,0.11)', key: 'rgba(255,128,56,0.07)', keyDrop: 0.35,
    bounce: '#ff5a1e', bounceAmt: 0.34, reflect: 0,
  },
  // Rain-slick neon: violet ambience and a genuinely reflective street.
  neon: {
    shade: 'rgba(22,10,46,0.20)', key: 'rgba(134,94,255,0.07)', keyDrop: 0.45,
    bounce: '#7a4cff', bounceAmt: 0.22, reflect: 0.30,
  },
  // Frozen lake: cold shadows, bright sky, a mirror underfoot.
  frozen: {
    shade: 'rgba(20,46,78,0.18)', key: 'rgba(186,232,255,0.075)', keyDrop: 0.55,
    bounce: '#9fd8ff', bounceAmt: 0.20, reflect: 0.34,
  },
  // High altitude: thin, clean, almost no colour cast.
  sky: {
    shade: 'rgba(30,50,84,0.10)', key: 'rgba(255,250,224,0.085)', keyDrop: 0.6,
    bounce: '#bcd8ff', bounceAmt: 0.12, reflect: 0.06,
  },
  // The Rift: heavy violet grade, faint crystal sheen.
  rift: {
    shade: 'rgba(28,10,52,0.24)', key: 'rgba(186,126,255,0.06)', keyDrop: 0.4,
    bounce: '#9a6cff', bounceAmt: 0.18, reflect: 0.22,
  },
};

export function lightingFor(stageId: string): StageLighting {
  return PROFILES[stageId] ?? MATTE;
}

/**
 * Additive bounce from the floor. Strongest with the feet on the ground and
 * gone by the time a fighter is a body-height above it, which is what sells
 * the difference between "standing in the lava glow" and "launched out of it".
 */
export function drawBounceLight(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  groundY: number | null,
  L: StageLighting,
) {
  if (!L.bounce || L.bounceAmt <= 0) return;
  const feet = f.y + f.h / 2;
  // With no platform underneath, fall back to the stage floor glow only when
  // the fighter is low on screen; otherwise mid-air characters would glow.
  const gy = groundY ?? feet + 40;
  const gap = gy - feet;
  if (gap < -8 || gap > f.h * 1.6) return;
  const fade = 1 - Math.max(0, gap) / (f.h * 1.6);
  const a = L.bounceAmt * fade * fade;
  if (a < 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // a wide, flat pool at the feet plus a tighter core on the legs
  ctx.save();
  ctx.translate(f.x, feet - 2);
  ctx.scale(1, 0.42);
  blitGlow(ctx, 0, 0, f.w * 1.5, L.bounce, a * 0.9, 0.45);
  ctx.restore();
  blitGlow(ctx, f.x, feet - f.h * 0.28, f.w * 0.95, L.bounce, a * 0.55, 0.3);
  ctx.restore();
}

/**
 * Mirrored fighter inside a glossy platform.
 *
 * Only the platform actually under the fighter is considered, so the cost is
 * capped at one extra fighter draw each however many platforms a stage has.
 */
export function drawReflection(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  platform: Platform | null,
  L: StageLighting,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  if (!platform || L.reflect <= 0 || platform.broken > 0) return;
  const feet = f.y + f.h / 2;
  const drop = platform.cy - feet;
  if (drop < -6 || drop > f.h * 1.3) return;      // too high up to reflect

  const depth = Math.min(platform.h, 70);
  const fade = (1 - Math.max(0, drop) / (f.h * 1.3)) * L.reflect;
  if (fade < 0.02) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(platform.cx, platform.cy, platform.w, depth);
  ctx.clip();
  // mirror about the platform surface
  ctx.translate(0, platform.cy * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = fade;
  ctx.globalCompositeOperation = 'lighter';
  draw(ctx);
  ctx.restore();
}

/**
 * Screen-space colour grade. Two rectangles: a multiply pass that tints the
 * darks and an additive top-down key. Subtle on its own, but it is what makes
 * the characters and the background feel like they are in the same room.
 */
export function drawGrade(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  L: StageLighting,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = L.shade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const drop = H * L.keyDrop;
  ctx.fillStyle = cachedLinear(ctx, 0, 0, 0, Math.round(drop), [
    [0, L.key],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(0, 0, W, drop);
  ctx.restore();
}
