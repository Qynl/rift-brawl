// ============ RIFT BRAWL — Signature aura & status rendering ============
//
// The twelve brawlers used to be distinguishable only by palette. Their
// resources now exist in the simulation (see traits.ts), so they need to be
// LEGIBLE AT A GLANCE during a fight — you should be able to tell that Ember is
// superheated, that Nova is out of stars, or that Volt is overclocked from a
// silhouette at the far side of the stage.
//
// Everything here is purely presentational and reads only from simulation
// state, so it can never desync a netplay client or the headless harness.

import type { Fighter } from './Fighter';
import { blitGlow } from '../effects/glowSprite';

const TAU = Math.PI * 2;

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Soft additive blob — the workhorse for every glow below (sprite-cached). */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  blitGlow(ctx, x, y, r, color, a);
}

/** Jagged lightning polyline between two points. Deterministic per seed. */
function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, jitter = 8) {
  const segs = 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const nx = x0 + (x1 - x0) * t;
    const ny = y0 + (y1 - y0) * t;
    const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const off = ((s - Math.floor(s)) - 0.5) * jitter;
    ctx.lineTo(nx - (y1 - y0) * 0.01 * off, ny + (x1 - x0) * 0.01 * off);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// ===========================================================================
//  UNDER-LAYER — drawn behind the character
// ===========================================================================

export function drawTraitAuraUnder(ctx: CanvasRenderingContext2D, f: Fighter, rx: number, ry: number, tick: number) {
  const t = f.trait;
  const spec = f.traitSpec;
  const c = spec.color;
  const H = f.h;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  switch (spec.id) {
    // ---- VANGUARD: a hexagonal bulwark that snaps together as the bar fills
    case 'aegis': {
      if (t.meter <= 0.02) break;
      const full = t.meter >= 1;
      const r = H * 0.62;
      ctx.globalAlpha = 0.12 + t.meter * 0.3;
      ctx.strokeStyle = c;
      ctx.lineWidth = full ? 2.6 : 1.4;
      const plates = 6;
      const lit = Math.floor(t.meter * plates + 0.001);
      for (let i = 0; i < plates; i++) {
        if (i >= lit && !full) continue;
        const a0 = (i / plates) * TAU + tick * 0.006;
        const a1 = ((i + 0.82) / plates) * TAU + tick * 0.006;
        ctx.beginPath();
        ctx.arc(rx, ry, r, a0, a1);
        ctx.stroke();
      }
      if (full) glow(ctx, rx, ry, H * 0.85, c, 0.22 + Math.sin(tick * 0.14) * 0.06);
      break;
    }

    // ---- EMBER: a heat-haze furnace that ignites at SUPERHEATED
    case 'overheat': {
      if (t.meter <= 0.05) break;
      glow(ctx, rx, ry + H * 0.1, H * (0.6 + t.meter * 0.45), t.active ? '#ff5c1a' : '#ff8a3c', 0.1 + t.meter * 0.3);
      if (t.active) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const ph = tick * 0.07 + i * 2.1;
          const yy = ry + H * 0.45 - ((tick * 1.6 + i * 26) % (H * 1.1));
          ctx.beginPath();
          for (let k = -3; k <= 3; k++) {
            const xx = rx + k * 5;
            ctx.lineTo(xx, yy + Math.sin(ph + k * 0.9) * 3);
          }
          ctx.stroke();
        }
      }
      break;
    }

    // ---- HOOK: the chain physically tightens and sparks when taut
    case 'tension': {
      if (t.meter <= 0.04) break;
      ctx.globalAlpha = 0.18 + t.meter * 0.4;
      ctx.strokeStyle = t.active ? '#e9d4ff' : c;
      ctx.lineWidth = 1.6;
      const links = 14;
      const slack = (1 - t.meter) * 16;
      ctx.beginPath();
      for (let i = 0; i <= links; i++) {
        const p = i / links;
        const a = p * TAU + tick * 0.02;
        const rr = H * 0.5 + Math.sin(a * 3 + tick * 0.05) * slack;
        ctx.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.72);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    // ---- TITAN: literal armour plating that cracks away as it is chipped
    case 'bulwark': {
      if (t.meter <= 0.02) break;
      const w = f.w * 0.9, h = H * 0.62;
      ctx.globalAlpha = 0.14 + t.meter * 0.34;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.2;
      const rows = 4;
      const lit = Math.ceil(t.meter * rows);
      for (let i = 0; i < lit; i++) {
        const yy = ry - h * 0.5 + (i + 0.5) * (h / rows);
        const ww = w * (1 - Math.abs(i - rows / 2 + 0.5) * 0.12);
        ctx.beginPath();
        ctx.moveTo(rx - ww / 2, yy);
        ctx.lineTo(rx + ww / 2, yy);
        ctx.stroke();
      }
      if (t.flash > 0) glow(ctx, rx, ry, H * 0.8, c, (t.flash / 12) * 0.5);
      break;
    }

    // ---- NOVA: her remaining stars physically orbit her
    case 'starfall': {
      for (let i = 0; i < t.charges; i++) {
        const a = tick * 0.035 + (i / Math.max(1, t.charges)) * TAU;
        const ox = rx + Math.cos(a) * H * 0.56;
        const oy = ry + Math.sin(a) * H * 0.3 - H * 0.1;
        glow(ctx, ox, oy, 11, c, 0.6);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const sa = (k / 8) * TAU;
          const sr = k % 2 === 0 ? 4.6 : 1.8;
          ctx.lineTo(ox + Math.cos(sa) * sr, oy + Math.sin(sa) * sr);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    // ---- VOLT: static arcs that arc between feet and head, wild at overclock
    case 'static': {
      if (t.meter <= 0.1 && !t.active) break;
      const intensity = t.active ? 1 : t.meter;
      ctx.globalAlpha = 0.25 + intensity * 0.55;
      ctx.strokeStyle = t.active ? '#ffffff' : c;
      ctx.lineWidth = t.active ? 2 : 1.2;
      const arcs = t.active ? 4 : 2;
      for (let i = 0; i < arcs; i++) {
        const a0 = tick * 0.12 + i * 1.7;
        const r0 = H * 0.5;
        bolt(ctx,
          rx + Math.cos(a0) * r0, ry + Math.sin(a0) * r0 * 0.8,
          rx + Math.cos(a0 + 2.4) * r0, ry + Math.sin(a0 + 2.4) * r0 * 0.8,
          Math.floor(tick / 3) + i, 10 * intensity);
      }
      if (t.active) glow(ctx, rx, ry, H * 0.9, c, 0.3);
      break;
    }

    // ---- FROST: a creeping frost ring that thickens per chill stack applied
    case 'permafrost': {
      const s = t.meter;
      if (s <= 0.02) break;
      ctx.globalAlpha = 0.16 + s * 0.4;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      const spikes = 12;
      ctx.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU + tick * 0.004;
        const rr = H * (i % 2 ? 0.42 : 0.42 + 0.16 * s);
        ctx.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.85);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    // ---- WRAITH: a siphon well that darkens and then bleeds violet
    case 'siphon': {
      if (t.meter <= 0.03) break;
      glow(ctx, rx, ry, H * (0.5 + t.meter * 0.4), c, 0.1 + t.meter * 0.28);
      ctx.globalAlpha = 0.3 + t.meter * 0.4;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const a = tick * 0.03 + i * (TAU / 5);
        const rr = H * 0.62 * (0.5 + 0.5 * Math.sin(tick * 0.04 + i));
        ctx.beginPath();
        ctx.arc(rx, ry, rr, a, a + 0.9);
        ctx.stroke();
      }
      break;
    }

    // ---- SERAPH: a halo that fills, then six wings of light while ASCENDED
    case 'radiance': {
      const headY = ry - H * 0.46;
      ctx.globalAlpha = 0.25 + t.meter * 0.6;
      ctx.strokeStyle = c;
      ctx.lineWidth = t.active ? 3 : 1.8;
      ctx.beginPath();
      ctx.ellipse(rx, headY - 12, 15, 5, 0, -Math.PI, -Math.PI + Math.PI * 2 * Math.max(0.08, t.meter));
      ctx.stroke();
      if (t.active) {
        glow(ctx, rx, ry, H * 1.1, c, 0.22 + Math.sin(tick * 0.1) * 0.06);
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 0; i < 3; i++) {
            const spread = 0.5 + i * 0.42;
            const len = H * (0.9 - i * 0.16) * (1 + Math.sin(tick * 0.08 + i) * 0.06);
            ctx.globalAlpha = 0.34 - i * 0.07;
            ctx.strokeStyle = i === 0 ? '#ffffff' : c;
            ctx.lineWidth = 6 - i * 1.5;
            ctx.beginPath();
            ctx.moveTo(rx, ry - H * 0.16);
            ctx.quadraticCurveTo(
              rx + side * len * 0.55, ry - H * 0.5 - i * 6,
              rx + side * len, ry - H * 0.2 + spread * 22,
            );
            ctx.stroke();
          }
        }
      }
      break;
    }

    // ---- VIPER: a low venom fog that pools around her feet
    case 'venom': {
      ctx.globalAlpha = 0.24;
      for (let i = 0; i < 4; i++) {
        const a = tick * 0.02 + i * 1.6;
        glow(ctx, rx + Math.cos(a) * 16, ry + H * 0.38 + Math.sin(a * 2) * 4, 16, c, 0.3);
      }
      break;
    }

    // ---- TEMPEST: gale charges as orbiting vortices, spun up while airborne
    case 'gale': {
      for (let i = 0; i < t.charges; i++) {
        const a = -tick * 0.06 + (i / Math.max(1, t.charges)) * TAU;
        const ox = rx + Math.cos(a) * H * 0.5;
        const oy = ry + Math.sin(a) * H * 0.5 * 0.6;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 14; k++) {
          const sa = (k / 14) * TAU * 1.5 + tick * 0.2;
          const sr = 2 + k * 0.5;
          ctx.lineTo(ox + Math.cos(sa) * sr, oy + Math.sin(sa) * sr);
        }
        ctx.stroke();
      }
      break;
    }

    // ---- JAEGER: a bandolier of bolts, and a reload ring while shielding
    case 'ammo': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = -1.2 + (i / (n - 1)) * 2.4;
        const ox = rx - f.facing * (Math.cos(a) * H * 0.42);
        const oy = ry + Math.sin(a) * H * 0.34;
        if (i < t.charges) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = c;
          ctx.fillRect(ox - 1.4, oy - 4, 2.8, 8);
          glow(ctx, ox, oy, 6, c, 0.4);
        } else {
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox - 1.4, oy - 4, 2.8, 8);
        }
      }
      if (t.stacks > 0) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rx, ry, H * 0.55, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, t.stacks / 40));
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

// ===========================================================================
//  OVER-LAYER — statuses inflicted on this fighter, drawn on top of the body
// ===========================================================================

export function drawStatusFX(ctx: CanvasRenderingContext2D, f: Fighter, rx: number, ry: number, tick: number) {
  const H = f.h, W = f.w;
  ctx.save();

  // ---- BURN (Ember): licking flames along the silhouette
  if (f.burn > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ph = tick * 0.16 + i * 1.9;
      const fx = rx + Math.sin(ph) * W * 0.4;
      const fy = ry + H * 0.35 - ((tick * 2.2 + i * 21) % (H * 0.95));
      const s = 5 + Math.sin(ph * 1.7) * 2;
      glow(ctx, fx, fy, s * 2.2, i % 2 ? '#ffd166' : '#ff5c1a', 0.45);
    }
  }

  // ---- POISON (Viper): rising bubbles + sickly wash
  if (f.poison > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 + f.poison * 0.035;
    ctx.fillStyle = '#aef65c';
    ctx.beginPath();
    ctx.ellipse(rx, ry, W * 0.5, H * 0.52, 0, 0, TAU);
    ctx.fill();
  }

  // ---- SHOCK (Volt): crackle arcs on the body
  if (f.shock > 0 && tick % 4 < 2) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = '#7cf3ff';
    ctx.lineWidth = 1.3;
    bolt(ctx, rx - W * 0.3, ry - H * 0.3, rx + W * 0.3, ry + H * 0.3, tick, 9);
  }

  // ---- CHILL / FROZEN (Frost): frost crust, then a full ice block
  if (f.chill > 0 || f.frozen > 0) {
    const stacks = f.frozen > 0 ? 4 : f.chill;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.14 + stacks * 0.1;
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath();
    ctx.ellipse(rx, ry, W * 0.5, H * 0.52, 0, 0, TAU);
    ctx.fill();
    if (f.frozen > 0) {
      // solid ice prism with a specular streak — unmistakable, even at distance
      const w = W * 0.92, h = H * 1.02;
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#bff0ff';
      ctx.beginPath();
      ctx.moveTo(rx, ry - h * 0.62);
      ctx.lineTo(rx + w * 0.54, ry - h * 0.2);
      ctx.lineTo(rx + w * 0.42, ry + h * 0.55);
      ctx.lineTo(rx - w * 0.42, ry + h * 0.55);
      ctx.lineTo(rx - w * 0.54, ry - h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rx - w * 0.22, ry - h * 0.5);
      ctx.lineTo(rx - w * 0.04, ry - h * 0.52);
      ctx.lineTo(rx + w * 0.16, ry + h * 0.5);
      ctx.lineTo(rx - w * 0.02, ry + h * 0.52);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < stacks * 2; i++) {
        const a = (i / (stacks * 2)) * TAU + tick * 0.01;
        const r0 = W * 0.34, r1 = r0 + 4 + stacks;
        ctx.beginPath();
        ctx.moveTo(rx + Math.cos(a) * r0, ry + Math.sin(a) * r0);
        ctx.lineTo(rx + Math.cos(a) * r1, ry + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Rim light. A single cheap pass that lifts every character off the background
 * and makes the 2D vector art read as sculpted rather than flat.
 */
export function drawRimLight(ctx: CanvasRenderingContext2D, f: Fighter, rx: number, ry: number) {
  const c = f.cfg.info.colors.glow;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.16;
  const g = ctx.createLinearGradient(rx - f.w * 0.6, ry - f.h * 0.5, rx + f.w * 0.6, ry + f.h * 0.5);
  g.addColorStop(0, hexA(c, 0.9));
  g.addColorStop(0.45, hexA(c, 0));
  g.addColorStop(1, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(rx, ry, f.w * 0.52, f.h * 0.54, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
