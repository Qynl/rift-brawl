// ============ RIFT BRAWL — linear/radial gradient cache ============
//
// `createLinearGradient` builds and rasterises a new ramp object every call.
// The renderer was rebuilding the same handful of ramps 60 times a second for
// skies, vignettes, HUD plates and weapon FX. Gradients are immutable once
// built, so as long as the geometry and stops are unchanged we can hand back
// the same object.
//
// The key includes the coordinates, so a gradient that genuinely animates still
// gets a fresh object — it just no longer costs anything when it does not.

type Stops = readonly (readonly [number, string])[];

const linear = new Map<string, CanvasGradient>();
const radial = new Map<string, CanvasGradient>();
const MAX = 256;

function stopKey(stops: Stops): string {
  let k = '';
  for (const [o, c] of stops) k += o.toFixed(3) + c;
  return k;
}

export function cachedLinear(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  stops: Stops,
): CanvasGradient {
  const key = `${x0.toFixed(1)},${y0.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)}|${stopKey(stops)}`;
  let g = linear.get(key);
  if (!g) {
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    if (linear.size >= MAX) linear.clear();
    linear.set(key, g);
  }
  return g;
}

export function cachedRadial(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
  stops: Stops,
): CanvasGradient {
  const key = `${x0.toFixed(1)},${y0.toFixed(1)},${r0.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)},${r1.toFixed(1)}|${stopKey(stops)}`;
  let g = radial.get(key);
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    if (radial.size >= MAX) radial.clear();
    radial.set(key, g);
  }
  return g;
}

/**
 * Like `cachedLinear`, but snaps the endpoints to a `q`-pixel grid first.
 *
 * Some ramps follow an animating object (a swinging blade, a swept weapon).
 * Their endpoints are continuous, so an exact cache would miss every frame.
 * A colour ramp shifted by a couple of pixels along a 40px weapon is not
 * perceivable, but it turns thousands of distinct keys into a handful.
 */
export function cachedLinearSnap(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  q: number,
  stops: Stops,
): CanvasGradient {
  const s = (v: number) => Math.round(v / q) * q;
  return cachedLinear(ctx, s(x0), s(y0), s(x1), s(y1), stops);
}

/** Gradients belong to a specific context; drop them when the canvas changes. */
export function clearGradientCache() {
  linear.clear();
  radial.clear();
}

export function gradientCacheSize() {
  return linear.size + radial.size;
}
