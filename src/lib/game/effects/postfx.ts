// ============ RIFT BRAWL — screen-space post processing ============
//
// A cheap, allocation-free bloom + chromatic-aberration pass that runs on the
// composited frame. No pixel readback, no WebGL: the whole thing is three
// `drawImage` calls onto a pair of persistent offscreen buffers.
//
// Bloom is a bright-pass, a blur and an additive composite.
//
// The bright-pass matters. Adding a plain downsample back over the frame lifts
// EVERY pixel, not just the highlights, and the result is a washed-out image
// with no blacks — which is exactly what this used to do: a dark volcanic
// cavern came out as flat salmon. Squaring the buffer first (multiply it by a
// copy of itself) crushes the midtones quadratically while leaving highlights
// alone: 20% grey becomes 4%, a white hit spark stays white. Then bright FX
// (sparks, auras, KO flashes, neon signs) bleed light into their surroundings
// and the darks stay dark.

type Buf = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

let small: Buf | null = null;
let tiny: Buf | null = null;
let aberr: Buf | null = null;

function buffer(prev: Buf | null, w: number, h: number): Buf | null {
  const W = Math.max(1, Math.floor(w));
  const H = Math.max(1, Math.floor(h));
  if (prev && prev.canvas.width === W && prev.canvas.height === H) return prev;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  return { canvas, ctx };
}

export interface PostFXOptions {
  /** 0 disables the bloom pass entirely */
  bloom: number;
  /** 0..1 — RGB split strength, driven by hit/KO impact */
  aberration: number;
  /** device pixel ratio the main canvas is scaled by */
  dpr: number;
}

/**
 * Apply post processing to the already-composited frame.
 * Must be called with the transform reset to device pixels.
 */
export function applyPostFX(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, opt: PostFXOptions) {
  const src = ctx.canvas;
  if (!src.width || !src.height) return;

  // ---- 1. bloom -----------------------------------------------------------
  if (opt.bloom > 0.001) {
    const w1 = viewW / 4, h1 = viewH / 4;
    const w2 = viewW / 12, h2 = viewH / 12;
    small = buffer(small, w1, h1);
    tiny = buffer(tiny, w2, h2);
    if (small && tiny) {
      // 1a. downsample to quarter res
      small.ctx.globalCompositeOperation = 'copy';
      small.ctx.globalAlpha = 1;
      small.ctx.imageSmoothingEnabled = true;
      small.ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, w1, h1);

      // 1b. bright-pass: multiplying the buffer by a copy of itself squares
      //     every channel, so only genuinely bright pixels survive. Two
      //     multiplies (cube) is a tighter threshold and still two blits.
      tiny.ctx.globalCompositeOperation = 'copy';
      tiny.ctx.globalAlpha = 1;
      tiny.ctx.imageSmoothingEnabled = true;
      tiny.ctx.drawImage(small.canvas, 0, 0, w1, h1, 0, 0, w2, h2);
      tiny.ctx.globalCompositeOperation = 'multiply';
      tiny.ctx.drawImage(small.canvas, 0, 0, w1, h1, 0, 0, w2, h2);
      tiny.ctx.drawImage(small.canvas, 0, 0, w1, h1, 0, 0, w2, h2);
      tiny.ctx.globalCompositeOperation = 'copy';

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      // three offset taps off the same thresholded buffer widen the halo
      // without paying for another downsample
      ctx.globalAlpha = opt.bloom * 1.15;
      ctx.drawImage(tiny.canvas, 0, 0, w2, h2, 0, 0, src.width, src.height);
      ctx.globalAlpha = opt.bloom * 0.5;
      const spread = 6 * opt.dpr;
      ctx.drawImage(tiny.canvas, 0, 0, w2, h2, -spread, -spread, src.width + spread * 2, src.height + spread * 2);
      ctx.restore();
    }
  }

  // ---- 2. chromatic aberration (impact only) ------------------------------
  if (opt.aberration > 0.01) {
    aberr = buffer(aberr, src.width, src.height);
    if (aberr) {
      aberr.ctx.globalCompositeOperation = 'copy';
      aberr.ctx.globalAlpha = 1;
      aberr.ctx.drawImage(src, 0, 0);
      const push = opt.aberration * 6 * opt.dpr;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opt.aberration * 0.32;
      ctx.drawImage(aberr.canvas, -push, 0);
      ctx.drawImage(aberr.canvas, push, 0);
      ctx.restore();
    }
  }
}

export function disposePostFX() {
  small = null;
  tiny = null;
  aberr = null;
}
