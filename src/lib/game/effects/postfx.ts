// ============ RIFT BRAWL — screen-space post processing ============
//
// A cheap, allocation-free bloom + chromatic-aberration pass that runs on the
// composited frame. No pixel readback, no WebGL: the whole thing is three
// `drawImage` calls onto a pair of persistent offscreen buffers.
//
// Bloom works by downsampling the frame hard and adding it back with `lighter`.
// Dark pixels contribute ~0 under additive blending, so bright FX (hit sparks,
// auras, KO flashes, neon stage lighting) bleed light into their surroundings
// while the art stays readable. That single pass is what makes the procedural
// vector characters look lit rather than drawn.

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
      // downsample twice — the second pass is the actual blur
      small.ctx.globalCompositeOperation = 'copy';
      small.ctx.globalAlpha = 1;
      small.ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, w1, h1);
      tiny.ctx.globalCompositeOperation = 'copy';
      tiny.ctx.globalAlpha = 1;
      tiny.ctx.drawImage(small.canvas, 0, 0, w1, h1, 0, 0, w2, h2);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      // two offset taps widen the halo without another downsample
      ctx.globalAlpha = opt.bloom * 0.55;
      ctx.drawImage(tiny.canvas, 0, 0, w2, h2, 0, 0, src.width, src.height);
      ctx.globalAlpha = opt.bloom * 0.3;
      ctx.drawImage(small.canvas, 0, 0, w1, h1, -2, -2, src.width + 4, src.height + 4);
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
