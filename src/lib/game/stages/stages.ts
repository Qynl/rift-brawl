// ============ RIFT BRAWL — Six Original Stages ============

import { Stage, Platform, StageHooks } from './Stage';
import { rand, chance, mulberry32 } from '../core/constants';
import { cachedLinear, cachedRadial } from '../effects/gradientCache';
import { blitGlow } from '../effects/glowSprite';

type Ctx = CanvasRenderingContext2D;

// ---------- shared art helpers ----------

function skyGrad(ctx: Ctx, y0: number, y1: number, c0: string, c1: string) {
  // cached: the sky ramp is identical every frame, it just used to be rebuilt
  ctx.fillStyle = cachedLinear(ctx, 0, y0, 0, y1, [[0, c0], [1, c1]]);
  ctx.fillRect(-2200, y0, 4400, y1 - y0);
}

function drawTree(ctx: Ctx, x: number, baseY: number, scale: number, sway: number, dark: string, light: string) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#2a1f16';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sway * 6, -55, sway * 10, -100); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(sway * 10 - 26, -112, 34, 26, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(sway * 10 + 22, -120, 32, 25, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(sway * 10, -140, 30, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(sway * 10 + 4, -128, 22, 16, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCloud(ctx: Ctx, x: number, y: number, s: number, alpha: number, color = 'rgba(255,255,255,0.8)') {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, 46 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 30 * s, y - 8 * s, 30 * s, 13 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 32 * s, y - 4 * s, 26 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function neonRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, glow = 12) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}


// crisp silhouette outline — the single biggest readability upgrade for platforms

/**
 * Jagged silhouette ridge. Deterministic from `seed`, so it is stable frame to
 * frame without storing anything, and cheap enough to draw several parallax
 * layers of.
 */
function ridge(
  ctx: Ctx, baseY: number, height: number, step: number,
  seed: number, fill: string, rim?: string,
) {
  const x0 = -1400, x1 = 1400;
  ctx.beginPath();
  ctx.moveTo(x0, baseY + 900);
  let h = 0;
  for (let x = x0, i = 0; x <= x1; x += step, i++) {
    // cheap hash -> stable pseudo-noise
    const n = Math.sin((i + seed) * 12.9898) * 43758.5453;
    const r = n - Math.floor(n);
    h = h * 0.55 + (r - 0.5) * height;
    ctx.lineTo(x, baseY - Math.abs(h) - height * 0.25);
  }
  ctx.lineTo(x1, baseY + 900);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function outlineLast(ctx: Ctx, w = 3, color = 'rgba(6,9,16,0.85)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

// soft drop shadow beneath a floating platform
function platformShadow(ctx: Ctx, p: Platform, alpha = 0.22) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.cx + p.w / 2, p.cy + p.h + 9, p.w * 0.44, 7, 0, 0, Math.PI * 2);
  ctx.fill();
}

// jagged hill/skyline band with parallax (seeded, deterministic)
function hillLayer(ctx: Ctx, camX: number, camY: number, par: number, color: string, baseY: number, hMax: number, seed: number, step = 150) {
  const rng = mulberry32(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-2600, baseY + 600);
  for (let x = -2600; x <= 2600; x += step) {
    const h = baseY - (rng() * 0.72 + 0.28) * hMax;
    ctx.lineTo(x - camX * par, h - camY * par);
  }
  ctx.lineTo(2600, baseY + 600);
  ctx.closePath();
  ctx.fill();
}

// volumetric god rays from a point
function godRays(ctx: Ctx, tick: number, cx: number, cy: number, rgb: string, reach = 760) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 5; i++) {
    const a = 0.45 + i * 0.22 + Math.sin(tick * 0.004 + i * 1.7) * 0.035;
    // The ray SHAPE sweeps, but the ramp along it does not need to: pinning the
    // gradient to the unswept angle keeps it cacheable and looks identical.
    const a0 = 0.45 + i * 0.22;
    ctx.fillStyle = cachedLinear(ctx, 0, 0, Math.cos(a0) * reach, Math.sin(a0) * reach, [
      [0, `rgba(${rgb},0.14)`],
      [1, `rgba(${rgb},0)`],
    ]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - 0.05) * reach * 1.05, Math.sin(a - 0.05) * reach * 1.05);
    ctx.lineTo(Math.cos(a + 0.05) * reach * 1.05, Math.sin(a + 0.05) * reach * 1.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ============================================================ STAGE 1: FOREST RUINS

const forestHooks: StageHooks = {
  update(s, _f, particles) {
    if (s.tick % 26 === 0) particles.ambient('leaf', rand(-700, 700), rand(-500, -200), chance(0.5) ? '#7fce6a' : '#b8e05c');
    if (s.tick % 40 === 0) particles.ambient('firefly', rand(-650, 650), rand(-100, 160), 'rgba(190,255,150,0.9)');
  },
  drawBg(ctx, s, tick, camX, camY) {
    // ---- dusk sky: deep indigo falling into a warm teal horizon ----
    ctx.fillStyle = cachedLinear(ctx, 0, -900, 0, 520, [
      [0, '#0a1524'], [0.42, '#10293c'], [0.75, '#174448'], [1, '#1f5c4e'],
    ]);
    ctx.fillRect(-2200, -900, 4400, 1440);
    // low sun haze
    ctx.fillStyle = cachedRadial(ctx, 470, -140, 40, 470, -140, 640, [
      [0, 'rgba(255,216,150,0.5)'], [0.35, 'rgba(255,190,120,0.16)'], [1, 'rgba(255,190,120,0)'],
    ]);
    ctx.fillRect(-2200, -900, 4400, 1440);
    // stars in the upper dark
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const srng = mulberry32(7);
    for (let i = 0; i < 26; i++) {
      const sx = srng() * 2200 - 1100 - camX * 0.02;
      const sy = srng() * -480 - 60 - camY * 0.02;
      if ((i + Math.floor(tick / 46)) % 6 !== 0) ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    // ---- three parallax hill bands ----
    hillLayer(ctx, camX, camY, 0.045, '#0c1b2a', 210, 300, 11, 220);
    hillLayer(ctx, camX, camY, 0.09, '#0f2430', 280, 240, 23, 180);
    // ruins on the mid band
    ctx.fillStyle = '#132b36';
    const rp = [[-520, 130, 26, 190], [-440, 130, 26, 150], [460, 130, 26, 170], [540, 130, 26, 130]] as const;
    for (const [px, py, pw, ph] of rp) ctx.fillRect(px - camX * 0.14, py - ph - camY * 0.14, pw, ph);
    ctx.strokeStyle = '#132b36';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(-480 - camX * 0.14, 130 - camY * 0.14, 60, Math.PI, 0);
    ctx.stroke();
    hillLayer(ctx, camX, camY, 0.14, '#14313a', 350, 180, 31, 140);
    // god rays through the canopy
    godRays(ctx, tick, 380 - camX * 0.1, -320 - camY * 0.1, '255,225,160', 700);
    // near detailed trees (sway)
    const sway = Math.sin(tick * 0.011) * 1 + Math.sin(tick * 0.005) * 0.6;
    drawTree(ctx, -560 - camX * 0.24, 400 - camY * 0.24, 1.8, sway, '#0f2a20', '#1c4430');
    drawTree(ctx, 570 - camX * 0.24, 405 - camY * 0.24, 2.0, -sway * 0.8, '#0f2a20', '#1c4430');
    drawTree(ctx, -130 - camX * 0.26, 470 - camY * 0.26, 1.35, sway * 1.2, '#0c241b', '#17392a');
    drawTree(ctx, 215 - camX * 0.26, 480 - camY * 0.26, 1.5, -sway, '#0c241b', '#17392a');
    // ground fog band
    // Breathing fog: one cached ramp, animated through globalAlpha instead of
    // rebuilding a colour stop every frame.
    ctx.fillStyle = cachedLinear(ctx, 0, 320, 0, 520, [
      [0, 'rgba(120,190,170,0)'], [0.6, 'rgba(120,190,170,0.13)'], [1, 'rgba(120,190,170,0.02)'],
    ]);
    ctx.globalAlpha = 0.77 + Math.sin(tick * 0.015) * 0.23;
    ctx.fillRect(-2200, 320, 4400, 220);
    ctx.globalAlpha = 1;
    void s;
  },
  drawPlatform(ctx, s, p) {
    if (p.type === 'solid') {
      // ---- floating island: layered grass cap, dirt body, roots, ruins ----
      // dirt body (jagged bottom)
      ctx.beginPath();
      ctx.moveTo(p.cx - 6, p.cy + 10);
      ctx.lineTo(p.cx + p.w + 6, p.cy + 10);
      ctx.lineTo(p.cx + p.w - 22, p.cy + p.h * 0.52);
      ctx.lineTo(p.cx + p.w * 0.78, p.cy + p.h + 16);
      ctx.lineTo(p.cx + p.w * 0.56, p.cy + p.h * 0.94);
      ctx.lineTo(p.cx + p.w * 0.34, p.cy + p.h + 6);
      ctx.lineTo(p.cx + p.w * 0.14, p.cy + p.h * 0.6);
      ctx.closePath();
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy + 8, 0, p.cy + p.h + 16, [
        [0, '#6d5238'], [0.45, '#513c29'], [1, '#342517'],
      ]);
      ctx.fill();
      outlineLast(ctx, 3.5);
      // embedded rocks
      ctx.fillStyle = '#5e5648';
      ctx.beginPath(); ctx.ellipse(p.cx + p.w * 0.3, p.cy + 34, 13, 8, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.cx + p.w * 0.68, p.cy + 48, 10, 6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(p.cx + p.w * 0.3 + 4, p.cy + 37, 8, 4, 0.4, 0, Math.PI * 2); ctx.fill();
      // hanging roots
      ctx.strokeStyle = 'rgba(74,56,36,0.85)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const rx = p.cx + p.w * (0.18 + i * 0.16);
        const rl = 14 + ((i * 37) % 20);
        ctx.beginPath();
        ctx.moveTo(rx, p.cy + 26 + (i % 2) * 10);
        ctx.quadraticCurveTo(rx + 5, p.cy + 30 + rl * 0.6, rx - 3, p.cy + 30 + rl);
        ctx.stroke();
      }
      // grass cap with overhang lip
      const cap = 15;
      ctx.beginPath();
      ctx.moveTo(p.cx - 12, p.cy + cap);
      ctx.quadraticCurveTo(p.cx - 15, p.cy - 1, p.cx + 2, p.cy - 2);
      ctx.lineTo(p.cx + p.w - 2, p.cy - 2);
      ctx.quadraticCurveTo(p.cx + p.w + 15, p.cy - 1, p.cx + p.w + 12, p.cy + cap);
      // wavy under-edge
      let wx = p.cx + p.w + 12;
      let k = 0;
      while (wx > p.cx - 12) {
        const nx = Math.max(p.cx - 12, wx - 26);
        ctx.quadraticCurveTo((wx + nx) / 2, p.cy + cap + 7 + (k % 2) * 5, nx, p.cy + cap);
        wx = nx; k++;
      }
      ctx.closePath();
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy - 2, 0, p.cy + cap + 8, [
        [0, '#68bd60'], [0.5, '#3f8f47'], [1, '#29683a'],
      ]);
      ctx.fill();
      outlineLast(ctx, 3.5);
      // top light catch
      ctx.strokeStyle = 'rgba(214,255,186,0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p.cx + 8, p.cy - 0.6);
      ctx.lineTo(p.cx + p.w - 8, p.cy - 0.6);
      ctx.stroke();
      // grass blades
      ctx.strokeStyle = 'rgba(140,220,120,0.8)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 9; i++) {
        const bx = p.cx + 14 + ((i * 71) % (p.w - 28));
        const bh = 5 + ((i * 13) % 5);
        ctx.beginPath();
        ctx.moveTo(bx, p.cy - 1);
        ctx.quadraticCurveTo(bx + 2, p.cy - bh, bx + 5, p.cy - bh - 2);
        ctx.stroke();
      }
      // ancient pillar
      ctx.fillStyle = '#988a72';
      ctx.strokeStyle = 'rgba(8,10,14,0.8)';
      ctx.lineWidth = 2;
      ctx.fillRect(p.cx + p.w * 0.82, p.cy - 46, 16, 46);
      ctx.strokeRect(p.cx + p.w * 0.82, p.cy - 46, 16, 46);
      ctx.fillRect(p.cx + p.w * 0.82 - 5, p.cy - 52, 26, 7);
      ctx.strokeRect(p.cx + p.w * 0.82 - 5, p.cy - 52, 26, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(p.cx + p.w * 0.82 + 10, p.cy - 46, 4, 46);
      // moss on pillar base
      ctx.fillStyle = 'rgba(63,143,71,0.8)';
      ctx.fillRect(p.cx + p.w * 0.82 - 1, p.cy - 8, 18, 6);
    } else {
      // wooden side platform — darker, outlined, moody
      platformShadow(ctx, p, 0.18);
      ctx.fillStyle = '#4c3d2c';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 4);
      ctx.fill();
      outlineLast(ctx, 3);
      // wood grain
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.4;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(p.cx + (p.w / 4) * i, p.cy + 2); ctx.lineTo(p.cx + (p.w / 4) * i, p.cy + p.h); ctx.stroke();
      }
      // lit top edge
      ctx.fillStyle = '#8a7354';
      ctx.fillRect(p.cx, p.cy, p.w, 5);
      ctx.fillStyle = 'rgba(230,210,160,0.5)';
      ctx.fillRect(p.cx + 2, p.cy, p.w - 4, 1.6);
      // rope
      ctx.strokeStyle = 'rgba(170,150,110,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.cx + 8, p.cy + p.h); ctx.lineTo(p.cx + 8, p.cy + p.h + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.cx + p.w - 8, p.cy + p.h); ctx.lineTo(p.cx + p.w - 8, p.cy + p.h + 14); ctx.stroke();
    }
    void s;
  },
};

// ============================================================ STAGE 2: VOLCANIC CORE

function volcanoInit(s: Stage) {
  s.hazard = { kind: 'lava', phase: 'idle', timer: 420, level: 1, currentY: 520, baseY: 520, highY: 268 };
}

const volcanoHooks: StageHooks = {
  init: volcanoInit,
  update(s, _f, particles, mods) {
    const hz = s.hazard;
    const cycle = mods.chaosHazards ? 240 : 480;
    hz.timer--;
    switch (hz.phase) {
      case 'idle':
        if (hz.timer <= 0) { hz.phase = 'warn'; hz.timer = mods.chaosHazards ? 70 : 120; }
        break;
      case 'warn':
        if (s.tick % 30 === 0) particles.emit({ type: 'ring', x: 0, y: 470, maxLife: 40, size: 30, color: 'rgba(255,120,40,0.8)', vx: 0, vy: 0, drag: 1 });
        if (hz.timer <= 0) { hz.phase = 'rise'; hz.timer = 42; }
        break;
      case 'rise':
        hz.currentY = lerpN(hz.baseY, hz.highY, 1 - hz.timer / 42);
        if (hz.timer <= 0) { hz.phase = 'high'; hz.timer = mods.chaosHazards ? 60 : 85; }
        break;
      case 'high':
        hz.currentY = hz.highY;
        if (hz.timer <= 0) { hz.phase = 'fall'; hz.timer = 50; }
        break;
      case 'fall':
        hz.currentY = lerpN(hz.highY, hz.baseY, 1 - hz.timer / 50);
        if (hz.timer <= 0) { hz.phase = 'idle'; hz.timer = cycle - (120 + 42 + 85 + 50); hz.currentY = hz.baseY; }
        break;
    }
    if (s.tick % 8 === 0) particles.ambient('ember', rand(-500, 500), rand(300, 500), chance(0.6) ? '#ff8a3c' : '#ffd166');
  },
  drawBg(ctx, s, tick, camX, camY) {
    // Draw order matters here: everything is painted back to front so that the
    // lava glow washes the distance but never the rock in front of it.

    // ---- 1. cavern sky: near black at the roof, smouldering at the floor ----
    skyGrad(ctx, -900, 620, '#0b0407', '#310906');

    // ---- 2. two parallax ridges, rimmed with their own heat ----
    ctx.save();
    ctx.translate(-camX * 0.05, -camY * 0.05);
    ridge(ctx, 330, 300, 120, 3, '#1a0709', 'rgba(255,110,40,0.13)');
    ctx.restore();
    ctx.save();
    ctx.translate(-camX * 0.1, -camY * 0.09);
    ridge(ctx, 430, 240, 90, 17, '#110406', 'rgba(255,130,50,0.2)');
    ctx.restore();

    // ---- 3. the erupting cone ----
    ctx.save();
    ctx.translate(-430 - camX * 0.08, 430 - camY * 0.08);
    ctx.beginPath();
    ctx.moveTo(-320, 0); ctx.lineTo(-70, -430); ctx.lineTo(70, -430); ctx.lineTo(320, 0);
    ctx.closePath();
    ctx.fillStyle = '#0d0405';
    ctx.fill();
    ctx.fillStyle = `rgba(255,150,60,${(0.55 + Math.sin(tick * 0.03) * 0.18).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, -428, 70, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    blitGlow(ctx, 0, -432, 130, '#ff7a28', 0.3 + Math.sin(tick * 0.03) * 0.08, 0.5);
    ctx.strokeStyle = 'rgba(255,120,40,0.42)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 40;
      ctx.beginPath();
      ctx.moveTo(off * 0.2, -420);
      ctx.quadraticCurveTo(off * 1.6 + Math.sin(tick * 0.01 + i) * 10, -230, off * 3.2, -10);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const t = (tick * 0.35 + i * 108) % 540;
      blitGlow(ctx, Math.sin((t + i * 40) * 0.01) * 60, -430 - t, 50 + t * 0.3, '#2b1a17', 0.4, 0.35);
    }
    ctx.restore();

    // ---- 4. the lava lake, well below the arena floor ----
    ctx.fillStyle = cachedLinear(ctx, 0, 380, 0, 660, [
      [0, 'rgba(255,110,35,0)'], [0.45, 'rgba(255,110,35,0.38)'], [1, 'rgba(255,74,14,0.92)'],
    ]);
    ctx.globalAlpha = 0.84 + Math.sin(tick * 0.05) * 0.16;
    ctx.fillRect(-2200, 380, 4400, 280);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffbd59';
    for (let i = 0; i < 9; i++) {
      const bx = ((i * 331 + tick * 0.4) % 1600) - 800;
      ctx.globalAlpha = 0.5 + Math.sin(tick * 0.1 + i) * 0.3;
      ctx.beginPath();
      ctx.ellipse(bx, 468 + Math.sin(tick * 0.07 + i * 2) * 3, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- 5. magma fissures crawling through the near rock ----
    ctx.strokeStyle = `rgba(255,110,40,${(0.2 + Math.sin(tick * 0.02) * 0.05).toFixed(3)})`;
    ctx.lineWidth = 3;
    const wob = Math.sin(tick * 0.02) * 8;
    for (let i = 0; i < 6; i++) {
      const bx = -720 + i * 290 - camX * 0.14;
      ctx.beginPath();
      ctx.moveTo(bx, -260 - camY * 0.14);
      ctx.quadraticCurveTo(bx + 60 + wob, -90 - camY * 0.14, bx - 30, 80 - camY * 0.14);
      ctx.stroke();
    }

    // ---- 6. near rock shoulders, painted over the glow so they stay black ----
    ctx.fillStyle = '#080304';
    for (const [rx, ry, rw, rh] of [[-820, 170, 440, 680], [660, 130, 520, 720]] as const) {
      ctx.beginPath();
      ctx.ellipse(rx - camX * 0.2, ry - camY * 0.2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 7. heat shimmer over the lake ----
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const y = 340 - i * 54;
      ctx.globalAlpha = 0.035 - i * 0.009;
      ctx.fillStyle = '#ff7a28';
      ctx.beginPath();
      ctx.moveTo(-2200, y);
      for (let x = -2200; x <= 2200; x += 110) {
        ctx.lineTo(x, y + Math.sin(x * 0.01 + tick * 0.06 + i) * 9);
      }
      ctx.lineTo(2200, y + 54); ctx.lineTo(-2200, y + 54);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    void s;
  },
  drawPlatform(ctx, s, p) {
    if (p.type === 'solid') {
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy, 0, p.cy + p.h, [
        [0, '#3a2c2c'], [0.12, '#2a2022'], [1, '#191113'],
      ]);
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 8); ctx.fill();
      outlineLast(ctx, 3);
      // basalt top
      ctx.fillStyle = '#4c3d3b';
      ctx.fillRect(p.cx, p.cy, p.w, 6);
      ctx.fillStyle = '#6b5b57';
      ctx.fillRect(p.cx, p.cy, p.w, 2.5);
      // Glowing fissures. The old version was three straight segments per
      // crack, which read as a row of ">" glyphs; these branch, wander and
      // fade out with depth like cooling rock.
      const pulse = 0.42 + Math.sin(s.tick * 0.08) * 0.18;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const cx0 = p.cx + (p.w / 7) * (i + 0.5) + Math.sin(i * 2.7) * 9;
        const depth = 26 + ((i * 37) % 26);
        ctx.strokeStyle = `rgba(255,${110 + ((i * 29) % 40)},40,${(pulse * (1 - i / 14)).toFixed(3)})`;
        ctx.lineWidth = 2.4 - (i % 3) * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx0, p.cy + 4);
        ctx.lineTo(cx0 + Math.sin(i * 1.3) * 7, p.cy + depth * 0.5);
        ctx.lineTo(cx0 + Math.sin(i * 2.1) * 12, p.cy + depth);
        ctx.stroke();
        // a short branch off the middle
        if (i % 2 === 0) {
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx0 + Math.sin(i * 1.3) * 7, p.cy + depth * 0.5);
          ctx.lineTo(cx0 + Math.sin(i * 1.3) * 7 - 11, p.cy + depth * 0.85);
          ctx.stroke();
        }
      }
      // hot rim right under the basalt cap, where the rock is thinnest
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.09 + Math.sin(s.tick * 0.08) * 0.03;
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy + 4, 0, p.cy + 22, [
        [0, 'rgba(255,120,40,1)'], [1, 'rgba(255,120,40,0)'],
      ]);
      ctx.fillRect(p.cx, p.cy + 4, p.w, 18);
      ctx.restore();
    } else {
      ctx.fillStyle = '#3d3034';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 5); ctx.fill();
      ctx.fillStyle = '#6a5a56';
      ctx.fillRect(p.cx, p.cy, p.w, 4.5);
      ctx.strokeStyle = 'rgba(255,120,50,0.35)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(p.cx + 1, p.cy + 1, p.w - 2, p.h - 2);
    }
  },
};

// ============================================================ STAGE 3: NEON CITY

const neonHooks: StageHooks = {
  update(_s, _f, particles) {
    if (_s.tick % 5 === 0) {
      // light rain
      particles.emit({
        type: 'snow', x: rand(-800, 800), y: rand(-500, -350), vx: -1.2, vy: 7,
        maxLife: 130, size: 1.1, color: 'rgba(140,200,255,0.5)', grav: 0, drag: 1, additive: false,
      });
    }
  },
  drawBg(ctx, _s, tick, camX, camY) {
    skyGrad(ctx, -900, 600, '#050810', '#0d1626');
    // moon
    ctx.fillStyle = 'rgba(220,235,255,0.9)';
    ctx.beginPath(); ctx.arc(360 - camX * 0.03, -280 - camY * 0.03, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d1626';
    ctx.beginPath(); ctx.arc(348 - camX * 0.03, -292 - camY * 0.03, 38, 0, Math.PI * 2); ctx.fill();
    // skyline far
    const rng = mulberry32(77);
    ctx.fillStyle = '#0a1220';
    for (let i = 0; i < 16; i++) {
      const bw = 60 + rng() * 90;
      const bx = -800 + i * 105 - camX * 0.1;
      const bh = 150 + rng() * 330;
      ctx.fillRect(bx, 400 - bh - camY * 0.1, bw, bh + 300);
    }
    // skyline near with windows
    ctx.fillStyle = '#101a2e';
    for (let i = 0; i < 12; i++) {
      const bw = 90 + (i % 3) * 40;
      const bx = -860 + i * 148 - camX * 0.22;
      const bh = 200 + ((i * 137) % 5) * 60;
      const by = 430 - bh - camY * 0.22;
      ctx.fillRect(bx, by, bw, bh + 300);
      // windows
      for (let wy = by + 18; wy < 420 - camY * 0.22; wy += 26) {
        for (let wx = bx + 10; wx < bx + bw - 12; wx += 22) {
          const flick = ((wx * 31 + wy * 17 + i * 7) % 97);
          const on = flick > 38;
          if (!on) continue;
          const warm = flick % 3 === 0;
          ctx.fillStyle = warm ? 'rgba(255,200,120,0.75)' : 'rgba(120,220,255,0.6)';
          if ((flick + tick) % 500 < 4) continue; // occasional flicker off
          ctx.fillRect(wx, wy, 9, 13);
        }
      }
    }
    // neon signs
    const flickA = Math.sin(tick * 0.21) > -0.85 ? 1 : 0.25;
    neonRect(ctx, -540 - camX * 0.22, 60 - camY * 0.22, 6, 90, `rgba(255,70,120,${0.8 * flickA})`);
    neonRect(ctx, -548 - camX * 0.22, 54 - camY * 0.22, 22, 6, `rgba(255,70,120,${0.8 * flickA})`);
    const flickB = Math.cos(tick * 0.13) > -0.9 ? 1 : 0.3;
    neonRect(ctx, 480 - camX * 0.22, 30 - camY * 0.22, 6, 110, `rgba(60,255,200,${0.8 * flickB})`);
    neonRect(ctx, 470 - camX * 0.22, 130 - camY * 0.22, 28, 6, `rgba(60,255,200,${0.8 * flickB})`);
    // searchlight sweep
    ctx.save();
    ctx.translate(120 - camX * 0.1, 430 - camY * 0.1);
    ctx.rotate(-0.7 + Math.sin(tick * 0.008) * 0.5);
    // Additive: a searchlight beam is light being added to the scene. Painted
    // normally it was a flat grey wedge sitting on top of the skyline.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = cachedLinear(ctx, 0, 0, 0, -620, [
      [0, 'rgba(120,170,220,0.16)'], [1, 'rgba(120,170,220,0)'],
    ]);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-70, -620); ctx.lineTo(70, -620); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  drawPlatform(ctx, s, p) {
    if (p.type === 'solid') {
      // rooftop
      ctx.fillStyle = '#1a2438';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 4); ctx.fill();
      outlineLast(ctx, 3);
      ctx.fillStyle = '#243350';
      ctx.fillRect(p.cx, p.cy, p.w, 7);
      // neon edge
      const pulse = 0.65 + Math.sin(s.tick * 0.09) * 0.25;
      neonRect(ctx, p.cx + 3, p.cy - 1.5, p.w - 6, 3, `rgba(80,240,255,${pulse})`, 10);
      // vents
      ctx.fillStyle = '#15203a';
      ctx.fillRect(p.cx + 40, p.cy - 14, 26, 14);
      ctx.fillRect(p.cx + p.w - 80, p.cy - 18, 34, 18);
      ctx.fillStyle = '#0e1830';
      ctx.fillRect(p.cx + 44, p.cy - 10, 18, 4);
    } else {
      // hover platform
      ctx.fillStyle = '#1c2a44';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 5); ctx.fill();
      outlineLast(ctx, 2.6);
      ctx.fillStyle = '#2c4066';
      ctx.fillRect(p.cx, p.cy, p.w, 4.5);
      neonRect(ctx, p.cx + 4, p.cy + p.h - 3, p.w - 8, 2, 'rgba(255,90,160,0.8)', 9);
      // hover glow
      ctx.fillStyle = 'rgba(255,90,160,0.14)';
      ctx.beginPath(); ctx.ellipse(p.cx + p.w / 2, p.cy + p.h + 8, p.w * 0.4, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
  },
};

// ============================================================ STAGE 4: FROZEN LAKE

const frozenHooks: StageHooks = {
  update(s, _f, particles) {
    if (s.tick % 12 === 0) particles.ambient('snow', rand(-800, 800), rand(-500, -250), 'rgba(235,245,255,0.85)');
  },
  drawBg(ctx, _s, tick, camX, camY) {
    skyGrad(ctx, -900, 600, '#0b1d33', '#2a4a6a');
    // aurora
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      const ay = -220 - band * 55 - camY * 0.05;
      ctx.moveTo(-900, ay);
      for (let x = -900; x <= 900; x += 60) {
        ctx.lineTo(x, ay + Math.sin(x * 0.006 + tick * 0.017 + band * 1.8) * 34);
      }
      ctx.lineTo(900, ay + 90); ctx.lineTo(-900, ay + 90);
      ctx.closePath();
      const hue = [140, 170, 200][band];
      // Animate the aurora with globalAlpha rather than by baking a new colour
      // stop every frame — same look, one cached ramp instead of 180/second.
      ctx.fillStyle = cachedLinear(ctx, 0, ay - 40, 0, ay + 90, [
        [0, `hsla(${hue},80%,60%,1)`],
        [1, 'rgba(0,0,0,0)'],
      ]);
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * (0.22 + Math.sin(tick * 0.02 + band) * 0.08);
      ctx.fill();
      ctx.globalAlpha = prevA;
    }
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const rng = mulberry32(9);
    for (let i = 0; i < 40; i++) {
      const sx = (rng() * 2000 - 1000) - camX * 0.02;
      const sy = (rng() * -500 - 40) - camY * 0.02;
      if ((i + Math.floor(tick / 40)) % 7 !== 0) { ctx.fillRect(sx, sy, 2, 2); }
    }
    // two ridges of far hills, so the three hero peaks have something to sit
    // in front of instead of a bare gradient
    ctx.save();
    ctx.translate(-camX * 0.06, -camY * 0.06);
    ridge(ctx, 430, 190, 130, 41, '#122844');
    ctx.restore();
    ctx.save();
    ctx.translate(-camX * 0.09, -camY * 0.08);
    ridge(ctx, 460, 140, 95, 7, '#0e2038');
    ctx.restore();

    // mountains
    ctx.fillStyle = '#173050';
    for (const [mx, mw, mh] of [[-650, 500, 380], [0, 700, 460], [700, 520, 400]] as const) {
      ctx.beginPath();
      ctx.moveTo(mx - mw / 2 - camX * 0.12, 420 - camY * 0.12);
      ctx.lineTo(mx - camX * 0.12, 420 - mh - camY * 0.12);
      ctx.lineTo(mx + mw / 2 - camX * 0.12, 420 - camY * 0.12);
      ctx.closePath(); ctx.fill();
      // snow cap
      ctx.fillStyle = 'rgba(220,240,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(mx - mw * 0.1 - camX * 0.12, 420 - mh * 0.72 - camY * 0.12);
      ctx.lineTo(mx - camX * 0.12, 420 - mh - camY * 0.12);
      ctx.lineTo(mx + mw * 0.12 - camX * 0.12, 420 - mh * 0.7 - camY * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#173050';
    }
    // a treeline of conifer silhouettes along the shore
    ctx.fillStyle = '#0a1a2e';
    for (let i = 0; i < 26; i++) {
      const tx = -1100 + i * 88 + Math.sin(i * 3.1) * 22 - camX * 0.16;
      const ty = 430 - camY * 0.16;
      const th = 70 + ((i * 53) % 46);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + th * 0.26, ty - th);
      ctx.lineTo(tx + th * 0.52, ty);
      ctx.closePath();
      ctx.fill();
    }

    // frozen lake sheen
    ctx.fillStyle = cachedLinear(ctx, 0, 380, 0, 640, [
      [0, 'rgba(160,220,255,0.25)'], [1, 'rgba(90,150,220,0.05)'],
    ]);
    ctx.fillRect(-2200, 380, 4400, 280);

    // freezing mist hugging the ice
    ctx.save();
    ctx.globalAlpha = 0.26 + Math.sin(tick * 0.012) * 0.06;
    ctx.fillStyle = cachedLinear(ctx, 0, 300, 0, 470, [
      [0, 'rgba(200,232,255,0)'], [0.55, 'rgba(200,232,255,0.5)'], [1, 'rgba(200,232,255,0)'],
    ]);
    ctx.fillRect(-2200, 300, 4400, 170);
    ctx.restore();
  },
  drawPlatform(ctx, s, p) {
    const broken = p.broken > 0;
    ctx.globalAlpha = broken ? 0.15 : 1;
    if (p.type === 'solid') {
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy, 0, p.cy + p.h, [
        [0, '#bfe3ff'], [0.14, '#7fb4e8'], [0.16, '#3d6a9a'], [1, '#274a72'],
      ]);
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 6); ctx.fill();
      outlineLast(ctx, 3, 'rgba(10,30,52,0.8)');
      // glossy ice top
      ctx.fillStyle = 'rgba(235,250,255,0.9)';
      ctx.fillRect(p.cx, p.cy, p.w, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(p.cx + p.w * 0.3, p.cy + 14, 60, 8, 0, 0, Math.PI * 2); ctx.fill();
      // ice cracks
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const cx0 = p.cx + p.w * (0.12 + i * 0.19);
        const cy0 = p.cy + 12 + ((i * 23) % 17);
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx0 + 26 + Math.sin(i * 1.7) * 12, cy0 + 9);
        ctx.lineTo(cx0 + 41 + Math.sin(i * 2.9) * 14, cy0 + 24);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx0 + 26 + Math.sin(i * 1.7) * 12, cy0 + 9);
        ctx.lineTo(cx0 + 12, cy0 + 26);
        ctx.stroke();
      }
    } else if (p.type === 'breakable') {
      ctx.fillStyle = '#a8d8f8';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 5); ctx.fill();
      ctx.fillStyle = 'rgba(240,252,255,0.95)';
      ctx.fillRect(p.cx, p.cy, p.w, 5);
      // cracks by damage state
      if (p.cracks > 0) {
        ctx.strokeStyle = 'rgba(20,60,100,0.7)';
        ctx.lineWidth = 2;
        const n = p.cracks * 3;
        for (let i = 0; i < n; i++) {
          const cx0 = p.cx + (p.w / (n + 1)) * (i + 1);
          ctx.beginPath();
          ctx.moveTo(cx0, p.cy + 1);
          ctx.lineTo(cx0 + Math.sin(i * 3.7) * 10, p.cy + p.h * 0.6);
          ctx.lineTo(cx0 + Math.sin(i * 2.2) * 6, p.cy + p.h - 1);
          ctx.stroke();
        }
      }
      // subtle blue glow
      ctx.strokeStyle = `rgba(150,220,255,${0.4 + Math.sin(s.tick * 0.1) * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.cx + 1, p.cy + 1, p.w - 2, p.h - 2);
    } else {
      ctx.fillStyle = '#8cc0ea';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 5); ctx.fill();
      ctx.fillStyle = 'rgba(240,252,255,0.9)';
      ctx.fillRect(p.cx, p.cy, p.w, 4.5);
    }
    ctx.globalAlpha = 1;
  },
};

// ============================================================ STAGE 5: SKY FORTRESS

const skyHooks: StageHooks = {
  init(s) {
    s.wind = { phase: 'idle', dir: 1, timer: 300 };
  },
  update(s, _f, particles, mods) {
    const w = s.wind;
    const cycle = mods.chaosHazards ? 240 : 420;
    w.timer--;
    if (w.phase === 'idle' && w.timer <= 0) { w.phase = 'warn'; w.timer = 90; w.dir = s.srand() < 0.5 ? 1 : -1; }
    else if (w.phase === 'warn') {
      if (s.tick % 14 === 0) particles.emit({ type: 'streak', x: w.dir > 0 ? -700 : 700, y: rand(-200, 250), vx: w.dir * 10, vy: 0, maxLife: 30, size: 12, color: 'rgba(200,230,255,0.5)', drag: 0.99 });
      if (w.timer <= 0) { w.phase = 'active'; w.timer = 130; }
    } else if (w.phase === 'active') {
      if (s.tick % 3 === 0) particles.emit({ type: 'streak', x: w.dir > 0 ? -720 : 720, y: rand(-260, 300), vx: w.dir * rand(16, 24), vy: rand(-1, 1), maxLife: 26, size: 14, color: 'rgba(210,235,255,0.6)', drag: 1 });
      if (w.timer <= 0) { w.phase = 'idle'; w.timer = cycle - 220; }
    }
  },
  onFighterUpdate(s, f) {
    if (s.wind.phase === 'active') {
      f.vx += s.wind.dir * 0.085;
      if (s.wind.phase === 'active' && s.tick % 30 === 0) {
        // gentle lift flutter
        f.vy -= 0.02;
      }
    }
  },
  drawBg(ctx, s, tick, camX, camY) {
    skyGrad(ctx, -900, 600, '#1a3a5c', '#7db4d8');
    // sun
    // Parallax sun: snapping the centre to an 8px grid makes a slow camera
    // pan reuse one ramp instead of allocating a new one every frame.
    const sunX = Math.round((500 - camX * 0.02) / 8) * 8;
    const sunY = Math.round((-300 - camY * 0.02) / 8) * 8;
    ctx.fillStyle = cachedRadial(ctx, sunX, sunY, 10, sunX, sunY, 420, [
      [0, 'rgba(255,250,220,0.85)'], [1, 'rgba(255,250,220,0)'],
    ]);
    ctx.fillRect(-2200, -900, 4400, 1300);
    // clouds parallax
    const t = tick;
    drawCloud(ctx, -400 - camX * 0.08 + ((t * 0.12) % 200), -160 - camY * 0.08, 1.6, 0.5);
    drawCloud(ctx, 300 - camX * 0.08 + ((t * 0.09) % 240), 60 - camY * 0.08, 2.1, 0.42);
    drawCloud(ctx, -100 - camX * 0.08 + ((t * 0.15) % 300), 260 - camY * 0.08, 1.4, 0.35);
    drawCloud(ctx, 560 - camX * 0.05, -60 - camY * 0.05, 1.2, 0.3);
    // distant floating islands
    ctx.fillStyle = '#3f6a52';
    for (const [ix, iy, isc] of [[-620, -40, 1.3], [640, 120, 1.1], [-200, 320, 0.8]] as const) {
      const px = ix - camX * 0.18, py = iy - camY * 0.18;
      ctx.beginPath();
      ctx.ellipse(px, py, 90 * isc, 22 * isc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - 70 * isc, py + 4 * isc);
      ctx.lineTo(px, py + 80 * isc);
      ctx.lineTo(px + 70 * isc, py + 4 * isc);
      ctx.closePath();
      ctx.fillStyle = '#33544a';
      ctx.fill();
      ctx.fillStyle = '#4d7a5c';
      ctx.beginPath(); ctx.ellipse(px, py - 3 * isc, 84 * isc, 16 * isc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f6a52';
    }
    // wind indicator arrows when active
    if (s.wind.phase === 'warn' || s.wind.phase === 'active') {
      const alpha = s.wind.phase === 'warn' ? 0.3 + Math.sin(tick * 0.3) * 0.2 : 0.55;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 3;
      const d = s.wind.dir;
      for (let i = 0; i < 3; i++) {
        const ax = d > 0 ? -560 + i * 30 : 560 - i * 30;
        ctx.beginPath();
        ctx.moveTo(ax, -330);
        ctx.lineTo(ax + d * 22, -318);
        ctx.lineTo(ax, -306);
        ctx.stroke();
      }
    }
  },
  drawPlatform(ctx, s, p) {
    if (p.type === 'solid') {
      // metal fortress deck
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy, 0, p.cy + p.h, [
        [0, '#8a96ac'], [0.1, '#5c6a84'], [1, '#37435c'],
      ]);
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 4); ctx.fill();
      outlineLast(ctx, 3, 'rgba(8,12,22,0.85)');
      ctx.fillStyle = '#aebcd4';
      ctx.fillRect(p.cx, p.cy, p.w, 4);
      // panel lines
      ctx.strokeStyle = 'rgba(20,30,50,0.4)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(p.cx + (p.w / 6) * i, p.cy + 4); ctx.lineTo(p.cx + (p.w / 6) * i, p.cy + p.h); ctx.stroke();
      }
      // rivets
      ctx.fillStyle = 'rgba(20,30,50,0.5)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.arc(p.cx + 14 + i * (p.w - 28) / 5, p.cy + 9, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      // signal light
      const blink = Math.sin(s.tick * 0.12) > 0.3;
      neonRect(ctx, p.cx + p.w / 2 - 3, p.cy - 8, 6, 6, blink ? 'rgba(255,120,80,0.95)' : 'rgba(255,120,80,0.2)', 8);
    } else {
      // sky platform
      ctx.fillStyle = '#66788f';
      roundRectPath(ctx, p.cx, p.cy, p.w, p.h, 4); ctx.fill();
      ctx.fillStyle = '#93a5bc';
      ctx.fillRect(p.cx, p.cy, p.w, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.cx + 6, p.cy + p.h - 2); ctx.lineTo(p.cx + p.w - 6, p.cy + p.h - 2); ctx.stroke();
    }
  },
};

// ============================================================ STAGE 6: RIFT

const riftSets: [number, number][][] = [
  [[-260, 40], [260, 40], [0, -100]],
  [[-180, -70], [180, -70], [-40, 40]],
  [[-300, -30], [300, -30], [60, -140]],
];

const riftHooks: StageHooks = {
  update(s, _f, particles, mods) {
    const period = mods.chaosHazards ? 240 : 400;
    const t = s.tick % period;
    const pass = s.platforms.filter(p => p.type === 'pass');
    if (t === period - 70 || t === period - 50 || t === period - 30) {
      for (const p of pass) {
        particles.emit({ type: 'ring', x: p.cx + p.w / 2, y: p.cy + p.h / 2, maxLife: 24, size: p.w * 0.4, color: 'rgba(190,140,255,0.7)', vx: 0, vy: 0, drag: 1 });
      }
    }
    if (t === 0) {
      const setIdx = Math.floor(s.tick / period) % riftSets.length;
      const set = riftSets[setIdx];
      pass.forEach((p, i) => {
        const [nx, ny] = set[i % set.length];
        p.cx = nx; p.cy = ny; p.x = nx; p.y = ny;
      });
      particles.emit({ type: 'ring', x: 0, y: 60, maxLife: 30, size: 60, color: 'rgba(190,140,255,0.8)', vx: 0, vy: 0, drag: 1 });
    }
    if (s.tick % 20 === 0) particles.ambient('ember', rand(-500, 500), rand(-300, 300), 'rgba(190,140,255,0.8)');
  },
  onFighterUpdate(s, f, tick) {
    // portals
    if ((f.portalCooldown ?? 0) > 0) return;
    for (const portal of s.portals) {
      const dA = Math.hypot(f.x - portal.ax, f.y - portal.ay);
      const dB = Math.hypot(f.x - portal.bx, f.y - portal.by);
      if (dA < portal.r) {
        f.x = portal.bx; f.y = portal.by; f.px = f.x; f.py = f.y;
        f.portalCooldown = 50;
        f.vy *= 0.6;
        return;
      } else if (dB < portal.r) {
        f.x = portal.ax; f.y = portal.ay; f.px = f.x; f.py = f.y;
        f.portalCooldown = 50;
        f.vy *= 0.6;
        void tick;
        return;
      }
    }
  },
  drawBg(ctx, _s, tick, camX, camY) {
    // void
    const vx = Math.round(-camX * 0.1 / 8) * 8;
    const vy = Math.round(-camY * 0.1 / 8) * 8;
    ctx.fillStyle = cachedRadial(ctx, vx, vy, 60, 0, 0, 900, [
      [0, '#171126'], [0.6, '#0d0a18'], [1, '#050309'],
    ]);
    ctx.fillRect(-2200, -1400, 4400, 2400);
    // swirling vortex arms
    ctx.save();
    ctx.translate(-camX * 0.15, -camY * 0.15);
    for (let arm = 0; arm < 5; arm++) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const tI = i / 40;
        const ang = arm * (Math.PI * 2 / 5) + tI * 2.6 + tick * 0.004;
        const r = 120 + tI * 520;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r * 0.7;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(150,100,255,${0.05 + 0.03 * Math.sin(tick * 0.02 + arm)})`;
      ctx.lineWidth = 26;
      ctx.stroke();
    }
    ctx.restore();
    // floating shards
    const rng = mulberry32(42);
    for (let i = 0; i < 14; i++) {
      const bx = rng() * 1600 - 800 - camX * 0.25;
      const by = rng() * 700 - 350 - camY * 0.25;
      const bs = 6 + rng() * 14;
      const bob = Math.sin(tick * 0.02 + i * 2.4) * 8;
      ctx.save();
      ctx.translate(bx, by + bob);
      ctx.rotate(tick * 0.008 + i);
      ctx.fillStyle = `rgba(${140 + i * 4},${90 + i * 3},255,0.28)`;
      ctx.beginPath();
      ctx.moveTo(0, -bs); ctx.lineTo(bs * 0.6, 0); ctx.lineTo(0, bs); ctx.lineTo(-bs * 0.6, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 173) % 1900) - 950 - camX * 0.03;
      const sy = ((i * 97) % 800) - 500 - camY * 0.03;
      if ((i + Math.floor(tick / 30)) % 5 !== 0) ctx.fillRect(sx, sy, 1.8, 1.8);
    }
  },
  drawPlatform(ctx, s, p) {
    const t = s.tick % 400;
    const warning = t > 330 && t < 400;
    if (p.type === 'solid') {
      // crystal main island
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy, 0, p.cy + p.h, [
        [0, '#9a7ae8'], [0.14, '#6a4fc0'], [0.16, '#3d2d70'], [1, '#2a1e52'],
      ]);
      ctx.beginPath();
      ctx.moveTo(p.cx + 10, p.cy);
      ctx.lineTo(p.cx + p.w - 10, p.cy);
      ctx.lineTo(p.cx + p.w - 30, p.cy + p.h * 0.5);
      ctx.lineTo(p.cx + p.w * 0.62, p.cy + p.h);
      ctx.lineTo(p.cx + p.w * 0.3, p.cy + p.h * 0.86);
      ctx.lineTo(p.cx + 26, p.cy + p.h * 0.44);
      ctx.closePath(); ctx.fill();
      // crystal top
      ctx.fillStyle = '#c9b2ff';
      ctx.fillRect(p.cx + 6, p.cy, p.w - 12, 4.5);
      // runes
      ctx.strokeStyle = `rgba(220,190,255,${0.5 + Math.sin(s.tick * 0.06) * 0.3})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const rx = p.cx + p.w * (0.25 + i * 0.25);
        ctx.strokeRect(rx - 5, p.cy + 14, 10, 10);
      }
    } else {
      // floating shard platform (semi transparent)
      ctx.globalAlpha = warning ? 0.45 + Math.sin(s.tick * 0.5) * 0.25 : 0.85;
      ctx.fillStyle = cachedLinear(ctx, 0, p.cy, 0, p.cy + p.h, [[0, '#b79aff'], [1, '#5a3fa8']]);
      ctx.beginPath();
      ctx.moveTo(p.cx + 6, p.cy);
      ctx.lineTo(p.cx + p.w - 6, p.cy);
      ctx.lineTo(p.cx + p.w - 20, p.cy + p.h);
      ctx.lineTo(p.cx + 20, p.cy + p.h);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(235,220,255,0.9)';
      ctx.fillRect(p.cx + 6, p.cy, p.w - 12, 3);
      ctx.globalAlpha = 1;
    }
  },
  drawFg(ctx, s, tick, camX, camY) {
    // portals
    for (const portal of s.portals) {
      drawPortal(ctx, portal.ax, portal.ay, portal.r, tick, '#8a5cff', '#e0c8ff');
      drawPortal(ctx, portal.bx, portal.by, portal.r, tick, '#5c8aff', '#c8e0ff');
    }
    void camX; void camY;
  },
};

function drawPortal(ctx: Ctx, x: number, y: number, r: number, tick: number, c0: string, c1: string) {
  ctx.save();
  ctx.translate(x, y);
  // outer ring
  ctx.strokeStyle = c0;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  // swirl
  for (let i = 0; i < 3; i++) {
    const a0 = tick * 0.06 + i * (Math.PI * 2 / 3);
    ctx.strokeStyle = c1;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, a0, a0 + 1.4);
    ctx.stroke();
  }
  // center glow
  ctx.fillStyle = cachedRadial(ctx, 0, 0, 2, 0, 0, r, [
    [0, 'rgba(255,255,255,0.7)'],
    [0.5, c0 + '66'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.globalAlpha = 0.5 + Math.sin(tick * 0.1) * 0.15;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ============================================================ shared utils

function lerpN(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============================================================ stage registry

export interface StageEntry { build(): Stage }

export const STAGE_BUILDERS: Record<string, () => Stage> = {
  forest: () => new Stage({
    id: 'forest', name: 'FOREST RUINS', desc: 'Ancient battleground swallowed by woods. A fair and honest arena.', hazardLabel: null,
    platforms: [
      { x: -330, y: 190, w: 660, h: 92, type: 'solid' },
      { x: -252, y: 26, w: 150, h: 14, type: 'pass' },
      { x: 102, y: 26, w: 150, h: 14, type: 'pass' },
      { x: -72, y: -118, w: 144, h: 14, type: 'pass' },
    ],
    blast: { left: -830, right: 830, top: -650, bottom: 660 },
    spawns: [{ x: -150, y: 100 }, { x: 150, y: 100 }, { x: -177, y: -44 }, { x: 177, y: -44 }],
    camBounds: { minX: -620, maxX: 620, minY: -520, maxY: 480 },
    hooks: forestHooks,
  }),
  volcano: () => new Stage({
    id: 'volcano', name: 'VOLCANIC CORE', desc: 'Suspended rock above a raging magma sea. Watch the warning glow — then run.', hazardLabel: 'Lava Surge',
    platforms: [
      { x: -235, y: 150, w: 470, h: 80, type: 'solid' },
      { x: -330, y: 6, w: 130, h: 13, type: 'pass' },
      { x: 200, y: 6, w: 130, h: 13, type: 'pass' },
      { x: -76, y: -132, w: 152, h: 13, type: 'pass' },
    ],
    blast: { left: -760, right: 760, top: -620, bottom: 560 },
    spawns: [{ x: -120, y: 70 }, { x: 120, y: 70 }, { x: -265, y: -64 }, { x: 265, y: -64 }],
    camBounds: { minX: -560, maxX: 560, minY: -500, maxY: 460 },
    hooks: volcanoHooks,
  }),
  neon: () => new Stage({
    id: 'neon', name: 'NEON CITY', desc: 'Rain-slick rooftops above the electric sprawl. Hover platforms drift on patrol routes.', hazardLabel: 'Moving Platforms',
    platforms: [
      { x: -300, y: 170, w: 600, h: 84, type: 'solid' },
      { x: -320, y: 24, w: 130, h: 13, type: 'pass', move: { bx: -80, by: 24, period: 320, phase: 0 } },
      { x: 80, y: 24, w: 130, h: 13, type: 'pass', move: { bx: 320, by: 24, period: 320, phase: 0 } },
      { x: -70, y: -126, w: 140, h: 13, type: 'pass' },
    ],
    blast: { left: -800, right: 800, top: -640, bottom: 640 },
    spawns: [{ x: -140, y: 90 }, { x: 140, y: 90 }, { x: -255, y: -46 }, { x: 145, y: -46 }],
    camBounds: { minX: -600, maxX: 600, minY: -510, maxY: 470 },
    hooks: neonHooks,
  }),
  frozen: () => new Stage({
    id: 'frozen', name: 'FROZEN LAKE', desc: 'Slick ice underfoot and thin shelves of ice. One careless slide and you are gone.', hazardLabel: 'Slippery Ice · Breakable',
    platforms: [
      { x: -300, y: 180, w: 600, h: 70, type: 'solid' },
      { x: -240, y: 20, w: 135, h: 13, type: 'breakable' },
      { x: 105, y: 20, w: 135, h: 13, type: 'breakable' },
      { x: -72, y: -112, w: 144, h: 13, type: 'ice' },
    ],
    blast: { left: -810, right: 810, top: -640, bottom: 650 },
    spawns: [{ x: -140, y: 100 }, { x: 140, y: 100 }, { x: -172, y: -50 }, { x: 172, y: -50 }],
    camBounds: { minX: -600, maxX: 600, minY: -510, maxY: 470 },
    hooks: frozenHooks,
  }),
  sky: () => new Stage({
    id: 'sky', name: 'SKY FORTRESS', desc: 'A warship deck among the clouds. Gust warnings mean grab the deck or drift away.', hazardLabel: 'Wind Gusts · Elevator',
    platforms: [
      { x: -260, y: 160, w: 520, h: 76, type: 'solid' },
      { x: -350, y: 16, w: 120, h: 13, type: 'pass' },
      { x: 230, y: 16, w: 120, h: 13, type: 'pass' },
      { x: -66, y: 40, w: 132, h: 13, type: 'pass', move: { bx: -66, by: -110, period: 380, phase: 60 } },
    ],
    blast: { left: -780, right: 780, top: -620, bottom: 620 },
    spawns: [{ x: -120, y: 80 }, { x: 120, y: 80 }, { x: -290, y: -54 }, { x: 290, y: -54 }],
    camBounds: { minX: -580, maxX: 580, minY: -500, maxY: 460 },
    hooks: skyHooks,
  }),
  rift: () => {
    const s = new Stage({
      id: 'rift', name: 'THE RIFT', desc: 'Reality is optional here. Shard platforms drift between anchors and portals fold space.', hazardLabel: 'Portals · Shifting Platforms',
      platforms: [
        { x: -240, y: 160, w: 480, h: 76, type: 'solid' },
        { x: -260, y: 40, w: 130, h: 13, type: 'pass' },
        { x: 130, y: 40, w: 130, h: 13, type: 'pass' },
        { x: -66, y: -100, w: 132, h: 13, type: 'pass' },
      ],
      blast: { left: -790, right: 790, top: -630, bottom: 640 },
      spawns: [{ x: -120, y: 80 }, { x: 120, y: 80 }, { x: -195, y: -30 }, { x: 195, y: -30 }],
      camBounds: { minX: -580, maxX: 580, minY: -500, maxY: 460 },
      hooks: riftHooks,
    });
    s.portals = [{ ax: -430, ay: 30, bx: 430, by: 30, r: 30 }];
    return s;
  },
};

// Ids and names live in ./meta so menus can import them without the renderer.
export { STAGE_IDS, STAGE_NAMES } from './meta';

export function buildStage(id: string): Stage {
  return (STAGE_BUILDERS[id] ?? STAGE_BUILDERS.forest)();
}

/** Render a static preview thumbnail of a stage onto a canvas */
export function renderStagePreview(stage: Stage, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const scale = W / 1300;
  ctx.save();
  ctx.translate(W / 2, H * 0.52);
  ctx.scale(scale, scale);
  ctx.translate(0, -130);
  stage.hooks.drawBg?.(ctx, stage, 40, 0, 0, 'low');
  for (const p of stage.platforms) {
    ctx.save();
    stage.hooks.drawPlatform?.(ctx, stage, p, 40);
    ctx.restore();
  }
  ctx.restore();
}
