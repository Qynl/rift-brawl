// ============ RIFT BRAWL — cached radial-glow sprites ============
//
// Canvas radial gradients are re-rasterised on every fill, and the renderer was
// allocating ~60 of them per frame (measured across stages, fighters, combat
// FX, HUD and particles). Each soft glow is instead baked ONCE into a small
// offscreen canvas and blitted, which turns a per-frame gradient build into a
// plain textured quad.
//
// Radii are bucketed so a continuously animating size still reuses one sprite.

const cache = new Map<string, HTMLCanvasElement>();
let budget = 96; // hard cap on distinct sprites; prevents unbounded growth

/**
 * `falloff` is where the half-bright stop sits, 0..1: small = tight hot core,
 * large = broad soft haze. It is clamped because addColorStop throws an
 * IndexSizeError outside that range, and a caller reaching for "softer" by
 * passing 2 would take the whole renderer down in a real browser.
 */
function makeSprite(color: string, r: number, falloffRaw: number): HTMLCanvasElement {
  const falloff = Math.min(0.98, Math.max(0.02, falloffRaw));
  const size = Math.max(4, Math.ceil(r * 2));
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, color);
    g.addColorStop(falloff, tint(color, 0.35));
    g.addColorStop(1, tint(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  return cv;
}

/** Multiply the alpha of an rgb/rgba/#hex colour string. */
function tint(color: string, mul: number): string {
  if (color.startsWith('rgba')) {
    const p = color.slice(5, -1).split(',');
    return `rgba(${p[0]},${p[1]},${p[2]},${(parseFloat(p[3]) * mul).toFixed(3)})`;
  }
  if (color.startsWith('rgb')) {
    const p = color.slice(4, -1).split(',');
    return `rgba(${p[0]},${p[1]},${p[2]},${mul.toFixed(3)})`;
  }
  const h = color.replace('#', '');
  const v = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${mul.toFixed(3)})`;
}

/**
 * Draw a soft additive glow centred on (x, y).
 * `alpha` is applied at blit time so one sprite serves every intensity.
 */
export function blitGlow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  color: string, alpha: number, falloffRaw = 0.55,
) {
  if (alpha <= 0.004 || r <= 0.5) return;
  const falloff = Math.min(0.98, Math.max(0.02, falloffRaw));
  // bucket the radius: 1px steps below 24, then 8% geometric steps
  const br = r < 24 ? Math.round(r) : Math.round(Math.pow(1.08, Math.round(Math.log(r) / Math.log(1.08))));
  const key = `${color}|${br}|${falloff}`;
  let sprite = cache.get(key);
  if (!sprite) {
    if (budget <= 0) {
      // cache saturated: fall back to a direct gradient rather than thrash
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, tint(color, alpha));
      g.addColorStop(1, tint(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    sprite = makeSprite(color, br, falloff);
    cache.set(key, sprite);
    budget--;
  }
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(sprite, x - br, y - br, br * 2, br * 2);
  ctx.globalAlpha = prev;
}

/** Drop every cached sprite (used when the canvas/DPR changes). */
export function clearGlowCache() {
  cache.clear();
  budget = 96;
}

export function glowCacheSize() {
  return cache.size;
}
