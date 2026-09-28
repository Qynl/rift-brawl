// ============ RIFT BRAWL — Fighting Game Camera ============

import { CAM_MIN_ZOOM, CAM_MAX_ZOOM, CAM_BASE_VIEW_W, clamp, lerp } from './constants';

export class Camera {
  x = 0; y = 0;           // world center
  zoom = 1;
  targetX = 0; targetY = 0; targetZoom = 1;
  shakeTrauma = 0;        // 0..1
  private shakeX = 0; private shakeY = 0; private shakeRot = 0;
  private t = 0;
  zoomPunch = 0;
  flash = 0;              // white flash 0..1
  flashColor = '255,255,255';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  viewW: number; viewH: number; // viewport in css px
  reduceShake = 1;

  constructor(viewW: number, viewH: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
    this.viewW = viewW; this.viewH = viewH;
    this.bounds = bounds;
    this.x = this.targetX = (bounds.minX + bounds.maxX) / 2;
    this.y = this.targetY = (bounds.minY + bounds.maxY) / 2;
  }

  resize(viewW: number, viewH: number) { this.viewW = viewW; this.viewH = viewH; }

  addShake(amount: number) {
    this.shakeTrauma = Math.min(1, this.shakeTrauma + amount * this.reduceShake);
  }

  addFlash(amount: number, color = '255,255,255') {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  punchZoom(amount: number) { this.zoomPunch = Math.max(this.zoomPunch, amount); }

  update(dt: number, pts: { x: number; y: number }[], focusBiasY = 0) {
    this.t += dt;
    // fit all points
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    if (pts.length === 0) { minX = maxX = this.bounds.minX; minY = maxY = 0; }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2 + focusBiasY;

    const spreadX = maxX - minX + 260;
    const spreadY = maxY - minY + 220;
    const vw = Math.max(this.viewW, 100), vh = Math.max(this.viewH, 100);
    let zoom = Math.min(vw / spreadX, vh / spreadY);
    zoom = clamp(zoom, CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    // smooth
    const rate = 7;
    this.targetX = cx; this.targetY = cy; this.targetZoom = zoom;
    this.x = lerp(this.x, this.targetX, 1 - Math.exp(-rate * dt));
    this.y = lerp(this.y, this.targetY, 1 - Math.exp(-rate * dt));
    this.zoom = lerp(this.zoom, this.targetZoom, 1 - Math.exp(-5 * dt));

    // clamp so we don't show too much beyond stage bounds
    const halfW = vw / 2 / this.zoom, halfH = vh / 2 / this.zoom;
    const bx = this.bounds.minX - 40, bxx = this.bounds.maxX + 40;
    const by = this.bounds.minY - 60, byy = this.bounds.maxY + 40;
    if (bxx - bx < halfW * 2) this.x = (bx + bxx) / 2;
    else this.x = clamp(this.x, bx + halfW, bxx - halfW);
    if (byy - by < halfH * 2) this.y = (by + byy) / 2 - 40;
    else this.y = clamp(this.y, by + halfH, byy - halfH);

    // shake decay
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.7);
    const s = this.shakeTrauma * this.shakeTrauma * 22 * this.reduceShake;
    this.shakeX = (Math.sin(this.t * 47.3) * 0.6 + Math.sin(this.t * 91.7) * 0.4) * s;
    this.shakeY = (Math.cos(this.t * 53.1) * 0.6 + Math.sin(this.t * 79.3) * 0.4) * s;
    this.shakeRot = (Math.sin(this.t * 61.7) * 0.7 + Math.sin(this.t * 43.3) * 0.3) * this.shakeTrauma * this.shakeTrauma * 0.014 * this.reduceShake;
    this.zoomPunch = Math.max(0, this.zoomPunch - dt * 3.5);
    this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  dpr = 1;

  apply(ctx: CanvasRenderingContext2D, alpha: number, px?: number, py?: number, pzoom?: number) {
    const cx = px !== undefined ? lerp(px, this.x, alpha) : this.x;
    const cy = py !== undefined ? lerp(py, this.y, alpha) : this.y;
    let z = pzoom !== undefined ? lerp(pzoom, this.zoom, alpha) : this.zoom;
    z *= 1 + this.zoomPunch * 0.04;
    const vw = this.viewW, vh = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(vw / 2 + this.shakeX, vh / 2 + this.shakeY);
    if (this.shakeRot !== 0) ctx.rotate(this.shakeRot);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  }

  designScale(): number {
    // scale factor so gameplay objects keep sensible size across viewport widths
    return this.viewW / CAM_BASE_VIEW_W;
  }
}
