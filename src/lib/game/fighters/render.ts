// ============ RIFT BRAWL — Fighter Rendering v2 ============
// High-readability vector fighters: bold outlines, gradient shading, rim light,
// per-character silhouettes & weapons, swing trails, afterimages, charge FX.

import { Fighter, moveActive } from './Fighter';
import { clamp, lerp } from '../core/constants';

import { drawTraitAuraUnder, drawStatusFX, drawRimLight } from './aura';

const VIS = 1.2; // visual presence bump (physics untouched)

interface Pose {
  lean: number; crouch: number; bob: number; rot: number; squash: number;
  armF: [number, number]; armB: [number, number];
  legF: [number, number]; legB: [number, number];
  headTilt: number;
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function computePose(f: Fighter, tick: number): Pose {
  const p: Pose = {
    lean: 0, crouch: 0, bob: 0, rot: 0, squash: 1,
    armF: [0.25, 0.15], armB: [-0.2, 0.2], legF: [0.08, 0.05], legB: [-0.08, 0.05],
    headTilt: 0,
  };
  const t = tick;
  switch (f.state) {
    case 'idle': case 'respawn': {
      p.bob = Math.sin(t * 0.07) * 1.4;
      p.armF = [0.22 + Math.sin(t * 0.07) * 0.07, 0.18];
      p.armB = [-0.22 - Math.sin(t * 0.07) * 0.07, 0.22];
      p.legF = [0.06, 0.04]; p.legB = [-0.06, 0.04];
      if (f.state === 'respawn') {
        p.legF = [0.9, 1.9]; p.legB = [-0.9, -1.9];
        p.armF = [0.5, 1.6]; p.armB = [-0.5, -1.6];
        p.bob = Math.sin(t * 0.05) * 3 - 4;
      }
      break;
    }
    case 'walk': {
      const spd = clamp(Math.abs(f.vx) / 4.5, 0.4, 1.3);
      const ph = t * 0.33 * spd;
      p.legF = [Math.sin(ph) * 0.62 * spd, 0.1 + Math.max(0, -Math.sin(ph)) * 0.5];
      p.legB = [Math.sin(ph + Math.PI) * 0.62 * spd, 0.1 + Math.max(0, -Math.sin(ph + Math.PI)) * 0.5];
      p.armF = [Math.sin(ph + Math.PI) * 0.44 * spd, 0.25];
      p.armB = [Math.sin(ph) * 0.44 * spd, 0.25];
      p.bob = Math.abs(Math.sin(ph)) * -1.7;
      p.lean = clamp(f.vx * 0.03, -0.18, 0.18);
      break;
    }
    case 'crouch': {
      p.crouch = 1; p.armF = [0.5, 0.9]; p.armB = [-0.4, 0.9];
      p.legF = [0.85, 1.5]; p.legB = [-0.85, 1.5]; p.headTilt = 0.08;
      break;
    }
    case 'dash': {
      p.lean = 0.42 * f.facing; p.bob = -2;
      p.legF = [1.05, 0.25]; p.legB = [-0.95, 0.55];
      p.armF = [-0.9, 0.4]; p.armB = [0.8, 0.3];
      break;
    }
    case 'air': {
      const rising = f.vy < -1.5;
      if (rising) {
        p.legF = [0.5, 1.05]; p.legB = [-0.35, 0.75];
        p.armF = [-0.5, 0.5]; p.armB = [0.35, 0.6];
        p.lean = 0.08;
      } else {
        const ff = f.fastFalling ? 0.3 : 0;
        p.legF = [0.18 + ff, 0.28]; p.legB = [-0.22 + ff * 0.5, 0.2];
        p.armF = [-1.7 - ff, 0.3]; p.armB = [-1.5, 0.45];
        p.lean = -0.06 - ff * 0.2;
      }
      break;
    }
    case 'land': {
      p.crouch = 0.55; p.squash = 0.82;
      p.legF = [0.6, 1.1]; p.legB = [-0.6, 1.1];
      p.armF = [0.7, 0.6]; p.armB = [-0.7, 0.6];
      break;
    }
    case 'shield': case 'shieldstun': {
      p.crouch = 0.3; p.armF = [0.75, 1.25]; p.armB = [0.55, 1.35];
      p.legF = [0.4, 0.8]; p.legB = [-0.4, 0.8];
      p.squash = f.state === 'shieldstun' ? 0.92 : 1;
      break;
    }
    case 'dizzy': {
      p.lean = Math.sin(t * 0.11) * 0.14;
      p.armF = [0.9, 0.4]; p.armB = [-0.9, 0.4];
      p.headTilt = Math.sin(t * 0.13) * 0.3;
      p.legF = [0.3, 0.4]; p.legB = [-0.3, 0.4];
      p.crouch = 0.25;
      break;
    }
    case 'dodge': {
      const total = 24;
      const prog = clamp(1 - f.stateTimer / total, 0, 1);
      if (Math.abs(f.vx) > 1.5 || !f.grounded) {
        p.rot = prog * Math.PI * 2 * (f.facing as number);
        p.squash = 0.9;
        p.legF = [0.7, 1.6]; p.legB = [-0.7, 1.6];
        p.armF = [0.6, 1.8]; p.armB = [-0.6, 1.8];
      } else {
        p.squash = 0.88;
        p.crouch = 0.5;
      }
      break;
    }
    case 'hitstun': case 'launch': {
      const fl = t * 0.55;
      // tumble direction follows the launch: flying backward = backflip, forward = frontflip
      const backflip = f.vx * f.facing < -0.5;
      p.rot = f.state === 'launch'
        ? f.stateTimer * 0.19 * (backflip ? -1 : 1) * f.facing
        : Math.sin(fl) * 0.12;
      p.armF = [-1.9 + Math.sin(fl) * 0.5, 0.4];
      p.armB = [-1.6 - Math.sin(fl) * 0.5, 0.4];
      p.legF = [0.5 + Math.sin(fl + 1) * 0.4, 0.5];
      p.legB = [-0.5 + Math.cos(fl) * 0.4, 0.5];
      p.headTilt = Math.sin(fl * 1.3) * 0.3;
      break;
    }
    case 'grabbed': {
      p.armF = [-2.2, 0.3]; p.armB = [-2.0, 0.3];
      p.legF = [0.3, 0.5]; p.legB = [-0.25, 0.5];
      p.bob = Math.sin(t * 0.4) * 1;
      break;
    }
    case 'grabbing': {
      p.armF = [1.5, 0.1]; p.armB = [-0.3, 0.3];
      p.lean = 0.12;
      break;
    }
    case 'ledge': {
      // hanging from the edge: both arms up gripping the lip, legs dangling with sway
      const sway = Math.sin(t * 0.09) * 0.14;
      p.armF = [2.75 + sway * 0.3, 0.15];
      p.armB = [2.45 - sway * 0.3, 0.25];
      p.legF = [0.34 + sway, 0.42];
      p.legB = [-0.18 - sway, 0.5];
      p.bob = Math.sin(t * 0.09) * 1.6;
      p.headTilt = -sway * 0.8;
      p.squash = 1.02;
      break;
    }
    case 'attack': {
      const m = f.move;
      if (m) {
        const fr = f.moveFrame;
        const mo = m.motion;
        const charge = m.chargeable && f.chargeFrames > 0;
        const easeOut2 = (v: number) => 1 - (1 - v) * (1 - v);
        const swing = clamp((fr - m.startup * 0.35) / Math.max(2, m.active + m.startup * 0.65), 0, 1);

        if (charge) {
          const isUp = m.id.startsWith('u') || m.angle > 70;
          const isDown = m.id === 'dattack' || m.id === 'dair' || (m.angle > 260 && m.angle < 290);
          p.armF = [isDown ? -1.4 : (isUp ? 2.6 : -1.9), 0.7];
          p.lean = isDown ? 0.1 : -0.16;
          p.crouch = 0.2;
          p.squash = 1 + Math.sin(tick * 0.8) * 0.015;
        } else if (mo) {
          // ---------- MOTION-DRIVEN ATTACK POSES (per weapon-motion kind) ----------
          const k = mo.kind;
          const windup = mo.windup, strike = mo.strike;
          if (k === 'thrust' || k === 'punch' || k === 'flurry') {
            // snap: windup during startup → full extension through active → ease back
            const a0 = windup ?? -1.0;           // pulled back
            const a1 = strike ?? 1.62;           // full extension (forward horizontal)
            let a: number;
            if (fr <= m.startup) {
              a = lerp(0.25, a0, easeOut2(clamp(fr / Math.max(1, m.startup), 0, 1)));
            } else if (fr <= m.startup + moveActive(m)) {
              a = a1;
            } else {
              a = lerp(a1, 0.25, clamp((fr - m.startup - moveActive(m)) / Math.max(1, m.recovery), 0, 1));
            }
            p.armF = [a, k === 'thrust' || k === 'flurry' ? 0.06 : 0.12];
            p.lean = a > 0.9 ? 0.3 : a < -0.3 ? -0.14 : 0.1;
            p.legF = [0.4, 0.3]; p.legB = [-0.5, 0.35];
            if (k === 'flurry') {
              // rapid alternating jabs — arm jitters forward each rehit cycle
              const jit = Math.sin(fr * 2.1) * 0.3;
              p.armF = [a1 - Math.abs(jit), 0.05];
              p.armB = [-0.7 + jit * 0.4, 0.3];
              p.lean = 0.34;
            }
          } else if (k === 'spin') {
            // full-body spin — weapon sweeps a real circle with the body
            const turns = mo.turns ?? 1;
            const sp = easeOut2(swing);
            p.rot = sp * Math.PI * 2 * turns * f.facing;
            p.armF = [1.62, 0]; p.armB = [1.45, 0];
            p.legF = [0.55, 1.15]; p.legB = [-0.45, 1.0];
            p.squash = 0.96;
          } else if (k === 'cross') {
            // dual weapons — arms swing in mirrored X arcs
            const s0 = easeOut2(swing);
            p.armF = [lerp(windup ?? -1.8, strike ?? 2.0, s0), 0.15];
            p.armB = [lerp(-(windup ?? -1.8), -(strike ?? 2.0), s0) * 0.85, 0.25];
            p.lean = lerp(-0.1, 0.26, s0);
            p.legF = [0.42, 0.3]; p.legB = [-0.5, 0.32];
          } else if (k === 'kick') {
            // chamber the leg → roundhouse extension
            let ex: number;
            if (fr <= m.startup) ex = lerp(0.1, 0.9, clamp(fr / Math.max(1, m.startup), 0, 1));
            else ex = strike ?? 1.5;
            p.legF = [ex, 0.12];
            p.legB = [-0.3, 0.3];
            p.armF = [-1.1, 0.35]; p.armB = [0.9, 0.4];
            p.lean = ex > 1 ? -0.16 : 0.06;
            p.bob = -2;
          } else if (k === 'sweep') {
            // low crouching sweep
            const s0 = easeOut2(swing);
            p.crouch = 0.85;
            p.legF = [lerp(-0.4, 1.25, s0), 0.55];
            p.legB = [-0.7, 1.1];
            p.armF = [0.9, 0.5]; p.armB = [-1.0, 0.6];
            p.lean = 0.3;
          } else if (k === 'smash') {
            // slow overhead windup → crushing down-swing with squash
            const a = lerp(windup ?? 2.85, strike ?? 0.7, easeOut2(swing));
            p.armF = [a, 0.2];
            p.lean = lerp(-0.12, 0.38, swing);
            p.legF = [0.45 + swing * 0.3, 0.35]; p.legB = [-0.5 - swing * 0.2, 0.4];
            if (fr <= m.startup) p.squash = 1 + 0.05 * (1 - fr / Math.max(1, m.startup));
            else p.squash = 1.04;
          } else {
            // slash: classic weapon arc (windup → strike through the target)
            const a = lerp(windup ?? -2.3, strike ?? 1.15, easeOut2(swing));
            p.armF = [a, 0.2];
            p.lean = lerp(-0.18, 0.28, swing);
            p.legF = [0.35 + swing * 0.3, 0.3]; p.legB = [-0.35 - swing * 0.2, 0.35];
            if (m.armor) p.squash = 1.04;
          }
        } else {
          const id = m.id;
          const isUp = id.startsWith('u') || m.angle > 70;
          const isDown = id === 'dattack' || id === 'dair' || (m.angle > 260 && m.angle < 290);
          const isBack = id === 'bair';
          if (isUp) {
            const a = lerp(0.6, -2.6, easeOut(swing));
            p.armF = [a, 0.25];
            p.lean = lerp(0.1, -0.14, swing);
            p.legF = [0.2, 0.3]; p.legB = [-0.3, 0.3];
          } else if (isDown) {
            const a = lerp(-2.0, 1.9, easeOut(swing));
            p.armF = [a, 0.3];
            p.lean = lerp(-0.2, 0.3, swing);
            p.legF = [0.4, 0.4]; p.legB = [-0.4, 0.4];
          } else if (isBack) {
            const a = lerp(0.8, -2.2, easeOut(swing));
            p.armF = [a, 0.2];
            p.lean = lerp(0.25, -0.3, swing);
          } else if (m.kind === 'grab') {
            const a = lerp(0.5, 1.5, easeOut(swing));
            p.armF = [a, 0.05];
            p.lean = 0.18;
          } else if (id === 'uspecial') {
            const a = lerp(1.8, -2.9, easeOut(swing));
            p.armF = [a, 0.2]; p.armB = [-2.4, 0.3];
            p.legF = [0.7, 1.2]; p.legB = [-0.5, 0.9];
            p.lean = -0.1;
          } else if (id === 'sspecial') {
            p.armF = [1.35, 0.1]; p.lean = 0.5;
            p.legF = [1.1, 0.3]; p.legB = [-1.0, 0.5];
          } else if (id === 'dspecial') {
            p.squash = 1 - 0.12 * easeOut(clamp(fr / m.startup, 0, 1));
            p.armF = [-2.6, 0.4]; p.armB = [-2.6, 0.4];
            p.crouch = 0.5 * clamp(fr / m.startup, 0, 1);
          } else if (id === 'nspecial') {
            p.armF = [lerp(-2.2, 0.9, easeOut(swing)), 0.3];
            p.lean = lerp(-0.25, 0.3, swing);
          } else {
            // generic forward slash / punch
            const a = lerp(-2.3, 1.15, easeOut(swing));
            p.armF = [a, 0.2];
            p.lean = lerp(-0.18, 0.28, swing);
            p.legF = [0.35 + swing * 0.3, 0.3]; p.legB = [-0.35 - swing * 0.2, 0.35];
            if (m.armor) p.squash = 1.04;
          }
        }
      }
      break;
    }
    case 'victory': {
      const b = Math.sin(t * 0.18);
      p.bob = b * -4;
      p.armF = [-2.9, 0.1];
      p.armB = [0.4, 0.4];
      p.headTilt = -0.08;
      p.squash = 1 + b * 0.03;
      break;
    }
    default: break;
  }
  return p;
}

// ---------- forward kinematics ----------
function limb(
  ctx: CanvasRenderingContext2D, x: number, y: number, a1: number, a2: number,
  l1: number, l2: number, width: number, color: string, outline: string,
  end?: (ex: number, ey: number, ang: number) => void,
) {
  const jx = x + Math.sin(a1) * l1;
  const jy = y + Math.cos(a1) * l1;
  const aT = a1 + a2;
  const ex = jx + Math.sin(aT) * l2;
  const ey = jy + Math.cos(aT) * l2;
  // dark outline pass
  ctx.strokeStyle = outline;
  ctx.lineWidth = width + 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(jx, jy); ctx.lineTo(ex, ey);
  ctx.stroke();
  // fill pass
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(jx, jy); ctx.lineTo(ex, ey);
  ctx.stroke();
  if (end) end(ex, ey, aT);
  return { ex, ey, ang: aT };
}

function roundCapsule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2);
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
  ctx.closePath();
}

// ---------- trail system (afterimages + weapon tips) ----------
interface TrailPt { x: number; y: number; facing: 1 | -1; life: number }
const ghosts = new WeakMap<Fighter, TrailPt[]>();
const tips = new WeakMap<Fighter, { x: number; y: number; life: number }[]>();

function pushTrail(map: WeakMap<Fighter, TrailPt[]>, f: Fighter, x: number, y: number, max = 7) {
  let arr = map.get(f);
  if (!arr) { arr = []; map.set(f, arr); }
  for (const p of arr) p.life--;
  arr.push({ x, y, facing: f.facing, life: max });
  while (arr.length > max) arr.shift();
}

function pushTip(map: WeakMap<Fighter, { x: number; y: number; life: number }[]>, f: Fighter, x: number, y: number, max = 7) {
  let arr = map.get(f);
  if (!arr) { arr = []; map.set(f, arr); }
  for (const p of arr) p.life--;
  arr.push({ x, y, life: max });
  while (arr.length > max) arr.shift();
}

// ---------- color helpers ----------
function shade(hex: string, amt: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.substring(0, 2), 16);
  const g = parseInt(n.substring(2, 4), 16);
  const b = parseInt(n.substring(4, 6), 16);
  const cl = (v: number) => clamp(Math.round(v), 0, 255);
  return `rgb(${cl(r + amt)},${cl(g + amt)},${cl(b + amt)})`;
}

function hexA(hex: string, a: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.substring(0, 2), 16);
  const g = parseInt(n.substring(2, 4), 16);
  const b = parseInt(n.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ============================================================
// MAIN ENTRY
// ============================================================
export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, tick: number, alpha = 1) {
  if (f.state === 'ko') return;
  let rx = lerp(f.px, f.x, alpha);
  let ry = lerp(f.py, f.y, alpha);
  // hitstop micro-jitter: frozen fighters vibrate slightly (impact reads harder)
  if (f.hitstop > 2) {
    rx += Math.sin(tick * 7.3 + f.playerIndex * 2) * 1.5;
    ry += Math.cos(tick * 8.1 + f.playerIndex) * 1.5;
  }

  // ---- afterimages (dashing / launching / specials) ----
  const fast = Math.abs(f.vx) > 6.5 || Math.abs(f.vy) > 11 || f.state === 'dash';
  if (fast || f.state === 'launch') pushTrail(ghosts, f, f.x, f.y, f.state === 'launch' ? 6 : 4);
  const gArr = ghosts.get(f);
  if (gArr) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < gArr.length - 1; i++) {
      const g = gArr[i];
      if (g.life <= 0) continue;
      const a = (i / gArr.length) * 0.16 * (g.life / 6);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.cfg.info.colors.glow;
      const gw = f.w * 0.42 * VIS, gh = f.h * 0.52 * VIS;
      roundCapsule(ctx, g.x, g.y, gw, gh, gw * 0.5);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- respawn invulnerability blink ----
  if (f.invuln > 0 && f.state !== 'respawn' && Math.floor(tick / 3) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // ---- signature resource aura (behind the body) ----
  if (f.state !== 'respawn') drawTraitAuraUnder(ctx, f, rx, ry, tick);

  const pose = computePose(f, tick);
  const body = drawBody(ctx, f, rx, ry, tick, pose, alpha, false);
  drawRimLight(ctx, f, rx, ry);

  // ---- inflicted statuses (burn / poison / shock / chill / frozen) ----
  drawStatusFX(ctx, f, rx, ry, tick);

  // ---- white hit-flash silhouette (Smash-style impact feedback) ----
  if (f.hitFlash > 0 && f.state !== 'respawn') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, f.hitFlash / 3) * 0.85;
    ctx.fillStyle = '#ffffff';
    roundCapsule(ctx, rx, ry, f.w * 0.95 * VIS, f.h * 0.96 * VIS, f.w * 0.48 * VIS);
    ctx.fill();
    ctx.restore();
  }

  // ---- PARRY gold shimmer (perfect shield reward) ----
  if (f.parried > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(f.parried / 14, 0, 1) * 0.55;
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, f.h * 0.72 * VIS * (1.25 - f.parried / 28), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(rx, ry, f.h * 0.62 * VIS * (1.3 - f.parried / 24), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // weapon tip trail for sweeping attacks
  if (body.tip) {
    pushTip(tips, f, body.tip.x, body.tip.y, 7);
    const tArr = tips.get(f)!;
    const attacking = f.state === 'attack' && f.move && f.moveFrame > (f.move.startup ?? 0) - 1 && f.moveFrame <= (f.move.startup ?? 0) + moveActive(f.move) + 2;
    if (attacking && tArr.length > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const col = f.move?.fxColor ?? f.cfg.info.colors.glow;
      // wide soft glow pass then a hot core pass — reads as an energy arc
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < tArr.length; i++) {
          const t0 = tArr[i - 1], t1 = tArr[i];
          if (t0.life <= 0 || t1.life <= 0) continue;
          if (Math.hypot(t1.x - t0.x, t1.y - t0.y) > 60) continue; // teleport jump — skip
          const frac = i / tArr.length;
          const w = pass === 0 ? frac * 16 : frac * 7;
          ctx.globalAlpha = frac * (pass === 0 ? 0.22 : 0.6);
          ctx.strokeStyle = pass === 0 ? col : i === tArr.length - 1 ? '#ffffff' : col;
          ctx.lineWidth = Math.max(1.5, w);
          ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
        }
      }
      ctx.restore();
    }
  } else {
    pushTip(tips, f, rx, ry, 2);
  }

  ctx.globalAlpha = 1;
}

/** Draws the full character; returns weapon tip (world space) if any. */
function drawBody(
  ctx: CanvasRenderingContext2D, f: Fighter, rx: number, ry: number,
  tick: number, pose: Pose, alpha: number, ghost: boolean,
): { tip: { x: number; y: number } | null } {
  const s = f.scale * VIS;
  const c = f.cfg.info.colors;
  const outline = 'rgba(6,6,16,0.92)';
  ctx.save();
  ctx.translate(rx, ry + f.h / 2); // feet anchor
  if (pose.rot !== 0) {
    ctx.translate(0, -f.h * 0.45);
    ctx.rotate(pose.rot);
    ctx.translate(0, f.h * 0.45);
  }
  const squashY = clamp(pose.squash, 0.8, 1.2);
  // air squash & stretch: rising stretches, falling squashes (Smash-style bounce)
  let airStretch = 1;
  if (!f.grounded && f.state !== 'respawn') {
    airStretch = clamp(1 - f.vy * 0.0075, 0.93, 1.09);
  }
  const sy = clamp(squashY * airStretch, 0.82, 1.18);
  const squashX = clamp(2 - sy, 0.8, 1.2);
  ctx.scale(f.facing * squashX * s, sy * s);
  ctx.rotate(pose.lean);

  const hipY = -21 - pose.bob + pose.crouch * 9;
  const shoulderY = hipY - 15;
  const headY = hipY - 28 + pose.headTilt * 6;

  const dark = c.secondary;
  const main = c.primary;
  const accent = c.accent;
  const heavy = f.id === 'titan' || f.id === 'frost';
  const limbW = heavy ? 8.4 : f.id === 'nova' || f.id === 'volt' || f.id === 'wraith' ? 6 : 6.6;

  // ---- back leg & arm ----  (pose convention: 0 = straight down, + = forward)
  limb(ctx, -2, hipY + 2, pose.legB[0], pose.legB[1], 10.5, 10.5, limbW, shade(dark, -6), outline, (ex, ey) => {
    ctx.fillStyle = shade(dark, -18);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(ex + 1.5, ey, 4.6, 2.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  const backArm = limb(ctx, -3, shoulderY + 2, pose.armB[0], pose.armB[1], 10.5, 10, limbW * 0.85, shade(dark, 2), outline, (ex, ey, ang) => {
    drawHand(ctx, f, ex, ey, ang, shade(dark, 14), false, tick);
  });

  // ---- torso ----
  const bodyW = (f.id === 'titan' ? 27 : f.id === 'frost' ? 22 : f.id === 'ember' ? 16 : f.id === 'volt' ? 15.5 : 18) ;
  const bodyH = 27;
  // outline
  ctx.fillStyle = outline;
  roundCapsule(ctx, 0, (shoulderY + hipY) / 2 + 2, bodyW + 3.4, bodyH + 3.4, (bodyW + 3.4) * 0.42);
  ctx.fill();
  // fill gradient
  const grad = ctx.createLinearGradient(-bodyW / 2, shoulderY, bodyW / 2, hipY + 4);
  grad.addColorStop(0, shade(main, 30));
  grad.addColorStop(0.5, main);
  grad.addColorStop(1, shade(main, -36));
  ctx.fillStyle = grad;
  roundCapsule(ctx, 0, (shoulderY + hipY) / 2 + 2, bodyW, bodyH, bodyW * 0.42);
  ctx.fill();
  // rim light on facing edge
  ctx.strokeStyle = hexA(c.accent, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bodyW * 0.28, shoulderY + 3);
  ctx.quadraticCurveTo(bodyW * 0.52, shoulderY + bodyH * 0.5, bodyW * 0.3, hipY);
  ctx.stroke();
  // chest emblem / core light
  ctx.fillStyle = c.glow;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(1.5, shoulderY + 8, f.id === 'titan' ? 4.6 : 3.2, f.id === 'titan' ? 5.8 : 4.2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(1.5, shoulderY + 8, 6.4, 7.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  drawTorsoDetail(ctx, f, shoulderY, hipY, tick);
  drawBackDetail(ctx, f, shoulderY, tick);

  // ---- front leg ----
  limb(ctx, 2, hipY + 2, pose.legF[0], pose.legF[1], 11, 11, limbW, shade(main, -14), outline, (ex, ey) => {
    ctx.fillStyle = shade(dark, 6);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(ex + 1.5, ey, 4.8, 2.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });

  // ---- head ----
  drawHead(ctx, f, 0, headY, tick, pose, outline);

  // ---- front arm + weapon ----
  const frontArm = limb(ctx, 3, shoulderY + 2, pose.armF[0], pose.armF[1], 11, 10.5, limbW * 0.9, main, outline, (ex, ey, ang) => {
    drawHand(ctx, f, ex, ey, ang, accent, true, tick);
  });
  const tip = drawWeapon(ctx, f, frontArm.ex, frontArm.ey, frontArm.ang, tick, pose);

  // ---- charge FX ----
  const m = f.move;
  if (!ghost && f.state === 'attack' && m?.chargeable && f.chargeFrames > 0) {
    const cr = 12 + (f.chargeFrames % 14);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.glow;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, shoulderY, cr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(0, shoulderY, cr * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  // tip back to world space (mirror x for facing)
  if (tip) {
    const wx = rx + (tip.x * f.facing * squashX * s);
    const wy = ry + f.h / 2 + (tip.y * squashY * s);
    return { tip: { x: wx, y: wy } };
  }
  return { tip: null };
}

// ---------- per-character pieces ----------

function drawTorsoDetail(ctx: CanvasRenderingContext2D, f: Fighter, shoulderY: number, hipY: number, tick: number) {
  const c = f.cfg.info.colors;
  switch (f.id) {
    case 'titan': {
      // shoulder plates
      ctx.fillStyle = shade(c.secondary, 10);
      ctx.strokeStyle = 'rgba(6,6,16,0.9)';
      ctx.lineWidth = 1.4;
      roundCapsule(ctx, -8, shoulderY + 1, 10, 9, 3.5); ctx.fill(); ctx.stroke();
      roundCapsule(ctx, 8, shoulderY + 1, 10, 9, 3.5); ctx.fill(); ctx.stroke();
      // belt
      ctx.fillStyle = shade(c.secondary, 4);
      ctx.fillRect(-bodyW(f) / 2, hipY - 1, bodyW(f), 4);
      break;
    }
    case 'frost': {
      // pauldron plates
      ctx.fillStyle = shade(c.secondary, 12);
      ctx.strokeStyle = 'rgba(6,6,16,0.9)';
      ctx.lineWidth = 1.4;
      roundCapsule(ctx, 8.5, shoulderY + 2, 9, 8, 3.2); ctx.fill(); ctx.stroke();
      // ice crystal emblem
      ctx.fillStyle = hexA(c.glow, 0.9);
      const cy = shoulderY + 14;
      ctx.beginPath();
      ctx.moveTo(1.5, cy - 4); ctx.lineTo(3.2, cy); ctx.lineTo(1.5, cy + 4); ctx.lineTo(-0.2, cy);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'volt': {
      // lightning emblem
      ctx.fillStyle = c.glow;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      const bx = 1.5, by = shoulderY + 6;
      ctx.moveTo(bx + 2, by); ctx.lineTo(bx - 1, by + 4); ctx.lineTo(bx + 0.5, by + 4); ctx.lineTo(bx - 2, by + 9);
      ctx.lineTo(bx + 1.5, by + 4.5); ctx.lineTo(bx, by + 4.5); ctx.lineTo(bx + 3, by);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'nova': {
      // constellation dots
      ctx.fillStyle = hexA('#ffffff', 0.85);
      const pts = [[-3, 6], [3, 9], [-1, 13], [4, 15]];
      for (const [dx, dy] of pts) {
        ctx.beginPath(); ctx.arc(dx, shoulderY + dy, 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = hexA(c.glow, 0.4);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-3, shoulderY + 6); ctx.lineTo(3, shoulderY + 9); ctx.lineTo(-1, shoulderY + 13); ctx.lineTo(4, shoulderY + 15);
      ctx.stroke();
      break;
    }
    case 'wraith': {
      // tattered shadow hem
      ctx.fillStyle = shade(c.secondary, -4);
      ctx.beginPath();
      const hemY = hipY + 4;
      ctx.moveTo(-7, hemY - 3);
      for (let i = 0; i <= 4; i++) {
        const x = -7 + i * 3.5;
        const dy = Math.sin(tick * 0.1 + i * 1.3) * 1.4;
        ctx.lineTo(x, hemY + 2.5 + dy);
        ctx.lineTo(x + 1.75, hemY - 1);
      }
      ctx.lineTo(7, hemY - 3);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'hook': {
      // belt + pouch
      ctx.fillStyle = shade(c.secondary, 8);
      ctx.fillRect(-8, hipY - 2, 16, 3.4);
      ctx.fillStyle = shade(c.accent, -30);
      roundCapsule(ctx, 5, hipY + 2, 5.5, 5, 2); ctx.fill();
      break;
    }
    case 'seraph': {
      // gilded breastplate with a rising-sun emblem
      ctx.fillStyle = shade(c.primary, -4);
      ctx.beginPath();
      ctx.moveTo(-8, shoulderY + 1);
      ctx.lineTo(8, shoulderY + 1);
      ctx.lineTo(6, shoulderY + 13);
      ctx.lineTo(0, shoulderY + 17);
      ctx.lineTo(-6, shoulderY + 13);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline0(); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexA(c.glow, 0.75);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) {
        const aa = -Math.PI / 2 + (i - 2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 9);
        ctx.lineTo(Math.cos(aa) * 4.4, shoulderY + 9 + Math.sin(aa) * 4.4);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'viper': {
      // bandolier of venom vials across the chest
      ctx.strokeStyle = shade(c.secondary, 18);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-7, shoulderY + 3);
      ctx.lineTo(7, hipY - 4);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.25;
        const vx2 = -7 + 14 * t;
        const vy2 = shoulderY + 3 + (hipY - 4 - shoulderY - 3) * t;
        ctx.fillStyle = hexA(c.glow, 0.85);
        roundCapsule(ctx, vx2 - 1.4, vy2, 2.8, 4.6, 1.4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(vx2 - 1.4, vy2 + 0.6, 0.9, 1.4);
      }
      break;
    }
    case 'tempest': {
      // flowing storm-sash that whips behind her
      ctx.fillStyle = hexA(c.glow, 0.75);
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(tick * 0.11 + i * 1.9) * 2.6;
        ctx.beginPath();
        ctx.moveTo(-6, shoulderY + 4 + i * 2);
        ctx.quadraticCurveTo(-12 - i * 2, shoulderY + 7 + i * 2 + wob, -18 - i * 2.5, shoulderY + 6 + i * 3 - wob);
        ctx.lineTo(-16 - i * 2.5, shoulderY + 9 + i * 3 + wob);
        ctx.quadraticCurveTo(-11 - i * 2, shoulderY + 10 + i * 2 - wob, -6, shoulderY + 7 + i * 2);
        ctx.closePath();
        ctx.fill();
      }
      // chest wind-glyph clasp
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc(0, shoulderY + 7, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(c.glow, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, shoulderY + 7, 3.6, tick * 0.05, tick * 0.05 + Math.PI * 1.3); ctx.stroke();
      break;
    }
    case 'jaeger': {
      // leather bolt-bandolier + hip quiver
      ctx.strokeStyle = shade(c.secondary, 22);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-8, shoulderY + 2);
      ctx.lineTo(8, hipY - 2);
      ctx.stroke();
      ctx.strokeStyle = shade(c.secondary, 4);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, shoulderY + 4);
      ctx.lineTo(8, hipY);
      ctx.stroke();
      // bolt shafts peeking from the bandolier
      ctx.strokeStyle = '#d8d2c2';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const t = 0.3 + i * 0.2;
        const bx = -8 + 16 * t;
        const by = shoulderY + 2 + (hipY - 2 - shoulderY - 2) * t;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 2.4, by - 5);
        ctx.stroke();
        ctx.fillStyle = hexA(c.glow, 0.9);
        ctx.beginPath(); ctx.arc(bx + 2.4, by - 5, 1, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: break;
  }
}
function bodyW(f: Fighter) { return f.id === 'titan' ? 27 : f.id === 'frost' ? 22 : f.id === 'ember' ? 16 : f.id === 'volt' ? 15.5 : 18; }

function drawHead(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, tick: number, pose: Pose, outline: string) {
  const c = f.cfg.info.colors;
  const r = f.id === 'titan' ? 10.4 : f.id === 'frost' ? 10.2 : 10;
  // neck
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y + r * 0.4); ctx.stroke();
  ctx.strokeStyle = shade(c.secondary, -8);
  ctx.lineWidth = 3.6;
  ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y + r * 0.4); ctx.stroke();

  // skull with outline
  ctx.fillStyle = outline;
  ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
  g.addColorStop(0, shade(c.primary, 38));
  g.addColorStop(1, shade(c.primary, -22));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  switch (f.id) {
    case 'vanguard': {
      // visor + crest
      ctx.fillStyle = c.glow;
      ctx.globalAlpha = 0.95;
      roundCapsule(ctx, 2.2, -0.5, 10.5, 3.4, 1.7); ctx.fill();
      ctx.globalAlpha = 0.3;
      roundCapsule(ctx, 2.2, -0.5, 13.5, 6, 3); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.secondary;
      ctx.beginPath();
      ctx.moveTo(-2, -r + 1); ctx.lineTo(-10, -r - 5); ctx.lineTo(-3.5, -r + 4.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      break;
    }
    case 'ember': {
      // flame hair
      for (let i = 0; i < 4; i++) {
        const fx0 = -5 + i * 3.2;
        const h = 7 + Math.sin(tick * 0.31 + i * 1.9) * 3.6 + i * 1.8;
        ctx.fillStyle = i % 2 ? c.glow : '#ff9a52';
        ctx.beginPath();
        ctx.moveTo(fx0 - 2.4, -r + 2.5);
        ctx.quadraticCurveTo(fx0 + Math.sin(tick * 0.23 + i) * 2.2, -r - h, fx0 + 2.2, -r + 2.5);
        ctx.closePath(); ctx.fill();
      }
      // eyes
      ctx.fillStyle = '#fff6e8';
      ctx.beginPath(); ctx.ellipse(3.4, -0.5, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.secondary;
      ctx.beginPath(); ctx.arc(3.9, -0.4, 1, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hook': {
      // goggles + cap
      ctx.fillStyle = c.secondary;
      roundCapsule(ctx, 2.4, -1, 12.5, 5.4, 2.7); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.fillStyle = '#8affe0';
      ctx.beginPath(); ctx.arc(4.6, -1, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(5.2, -1.7, 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.secondary;
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, r * 0.95, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.stroke();
      break;
    }
    case 'titan': {
      // heavy brow + glowing visor band + jaw plate (no cartoon dot-eyes)
      ctx.fillStyle = shade(c.secondary, 12);
      roundCapsule(ctx, 2.2, -3.2, 13, 6.4, 3); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.stroke();
      // glowing visor slit
      ctx.fillStyle = c.glow;
      roundCapsule(ctx, 3.4, -2.4, 9.4, 2.6, 1.3); ctx.fill();
      ctx.globalAlpha = 0.3;
      roundCapsule(ctx, 3.4, -2.4, 12.5, 5, 2.5); ctx.fill();
      ctx.globalAlpha = 1;
      // jaw guard
      ctx.fillStyle = shade(c.secondary, 4);
      roundCapsule(ctx, 2, r * 0.55, 9, 3.4, 1.6); ctx.fill();
      break;
    }
    case 'nova': {
      // dome helmet with starfield + antenna ring
      ctx.fillStyle = 'rgba(220,235,255,0.28)';
      ctx.beginPath(); ctx.arc(0, -0.5, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(c.accent, 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -0.5, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(2.4, -2, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-2.2, 1.4, 0.7, 0, Math.PI * 2); ctx.fill();
      // glowing eyes inside dome
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.arc(2.8, 0.8, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-0.6, 0.8, 1.2, 0, Math.PI * 2); ctx.fill();
      // orbit ring
      ctx.strokeStyle = hexA(c.glow, 0.65);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, -0.5, r * 1.25, r * 0.42, -0.35 + Math.sin(tick * 0.03) * 0.1, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'volt': {
      // spiky static hair
      ctx.strokeStyle = c.glow;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI * 0.85 + i * 0.34 + Math.sin(tick * 0.2 + i) * 0.06;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * (r + 5.5), Math.sin(a) * (r + 5.5));
        ctx.stroke();
      }
      // goggle eyes
      ctx.fillStyle = '#241d04';
      ctx.beginPath(); ctx.arc(2.8, -0.4, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-1.8, -0.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.arc(3.2, -0.5, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-1.5, -0.5, 1, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'frost': {
      // knight helm + ice horns
      ctx.fillStyle = shade(c.secondary, 16);
      ctx.beginPath();
      ctx.arc(0, -1, r * 0.92, Math.PI, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      // horns
      ctx.fillStyle = hexA(c.accent, 0.92);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * r * 0.55, -r * 0.55);
        ctx.quadraticCurveTo(sgn * (r + 3), -r - 5, sgn * (r + 5.5), -r + 2.5);
        ctx.quadraticCurveTo(sgn * r * 0.9, -r * 0.5, sgn * r * 0.55, -r * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = outline; ctx.stroke();
      }
      // T visor
      ctx.fillStyle = c.glow;
      roundCapsule(ctx, 2.4, -0.4, 10, 3, 1.5); ctx.fill();
      ctx.fillRect(1.2, -0.4, 2.2, 6);
      break;
    }
    case 'wraith': {
      // hood — dark cowl over glowing eyes
      ctx.fillStyle = shade(c.secondary, -2);
      ctx.beginPath();
      ctx.moveTo(-r - 1.5, r * 0.65);
      ctx.quadraticCurveTo(-r - 2, -r - 2.5, 0.5, -r - 2);
      ctx.quadraticCurveTo(r + 2, -r - 2, r + 1.5, r * 0.55);
      ctx.quadraticCurveTo(r * 0.4, r * 0.95, -r - 1.5, r * 0.65);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      // glowing eyes in the dark
      ctx.fillStyle = hexA(c.glow, 0.28);
      ctx.beginPath(); ctx.ellipse(1.4, 0, 5.4, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.ellipse(3, -0.3, 1.5, 0.9, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.6, -0.3, 1.3, 0.85, -0.15, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'seraph': {
      // sleek helm with a crest fin + glowing eyes
      ctx.fillStyle = shade(c.primary, -6);
      ctx.beginPath();
      ctx.arc(0, -1, r * 0.94, Math.PI * 0.98, Math.PI * 0.02);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      // crest fin sweeping back
      ctx.fillStyle = hexA(c.accent, 0.95);
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.95);
      ctx.quadraticCurveTo(-r - 5, -r - 4.5, -r - 7.5, -r + 3);
      ctx.quadraticCurveTo(-r * 0.8, -r * 0.7, -r * 0.2, -r * 0.95);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.stroke();
      // halo floating above
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = c.glow;
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 5;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0.5, -r - 4.5 + Math.sin(tick * 0.07) * 0.8, r * 0.72, r * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // visor slit eyes
      ctx.fillStyle = '#2a1d05';
      roundCapsule(ctx, 2.6, -0.2, 9.5, 2.6, 1.3); ctx.fill();
      ctx.fillStyle = c.glow;
      roundCapsule(ctx, 4.4, 0.1, 5.4, 1.3, 0.65); ctx.fill();
      break;
    }
    case 'viper': {
      // deep hood with a wide brim — only toxic eyes visible
      ctx.fillStyle = shade(c.secondary, 4);
      ctx.beginPath();
      ctx.moveTo(-r - 3, r * 0.35);
      ctx.quadraticCurveTo(-r - 3.5, -r - 3.5, 0, -r - 3);
      ctx.quadraticCurveTo(r + 3.5, -r - 3.5, r + 3, r * 0.35);
      ctx.quadraticCurveTo(r + 1.5, r * 0.5, 0, r * 0.52);
      ctx.quadraticCurveTo(-r - 1.5, r * 0.5, -r - 3, r * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      // face shadow
      ctx.fillStyle = 'rgba(4,10,4,0.9)';
      ctx.beginPath(); ctx.ellipse(0.5, 0.4, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // slit pupils
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.ellipse(2.6, 0, 1.9, 1.1, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1.2, 0, 1.6, 1, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0c1806';
      ctx.fillRect(2.55, -0.9, 0.7, 1.9);
      ctx.fillRect(-1.25, -0.85, 0.6, 1.8);
      // hood venom-green trim
      ctx.strokeStyle = hexA(c.glow, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, r * 0.44, r * 0.95, r * 0.2, 0, 0, Math.PI); ctx.stroke();
      break;
    }
    case 'tempest': {
      // windswept twin-tail hair whipping backward
      for (const side of [-1, 1]) {
        ctx.fillStyle = shade(c.primary, side < 0 ? -6 : 6);
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.7);
        ctx.quadraticCurveTo(-r - 4, -r * 0.9 + Math.sin(tick * 0.13 + side) * 2.2, -r - 8, r * 0.3 + Math.sin(tick * 0.11 + side) * 2.6);
        ctx.quadraticCurveTo(-r - 2, r * 0.2, -r * 0.5, r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke();
      }
      // goggles pushed up on the forehead
      ctx.fillStyle = shade(c.secondary, 6);
      roundCapsule(ctx, -r * 0.55, -r * 0.72, r * 1.5, 3.4, 1.7); ctx.fill();
      ctx.fillStyle = hexA(c.glow, 0.85);
      ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
      // bright eyes
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.arc(r * 0.42, r * 0.05, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.28, r * 0.05, 1.3, 0, Math.PI * 2); ctx.fill();
      // wind streak past the cheek
      ctx.strokeStyle = hexA(c.accent, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.2 - Math.sin(tick * 0.2) * 1.2);
      ctx.quadraticCurveTo(r * 1.5, 0, r * 0.95, r * 0.3);
      ctx.stroke();
      break;
    }
    case 'jaeger': {
      // weathered hunter cap with brim
      ctx.fillStyle = shade(c.secondary, 16);
      ctx.beginPath();
      ctx.arc(0, -r * 0.42, r * 0.92, Math.PI, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
      // brim
      ctx.fillStyle = shade(c.secondary, 8);
      roundCapsule(ctx, -r * 0.5, -r * 0.5, r * 1.9, 3, 1.5); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke();
      // face
      ctx.fillStyle = 'rgba(4,6,4,0.85)';
      ctx.beginPath(); ctx.ellipse(0.5, r * 0.28, r * 0.66, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // amber hunter eyes
      ctx.fillStyle = c.glow;
      ctx.beginPath(); ctx.arc(r * 0.42, r * 0.22, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.26, r * 0.22, 1.3, 0, Math.PI * 2); ctx.fill();
      // cheek scar
      ctx.strokeStyle = hexA('#d8d2c2', 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, r * 0.05);
      ctx.lineTo(-r * 0.3, r * 0.55);
      ctx.stroke();
      // stubble shade
      ctx.fillStyle = 'rgba(20,18,10,0.4)';
      ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.62, r * 0.5, r * 0.22, 0, 0, Math.PI); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, ang: number, color: string, front: boolean, tick: number) {
  const c = f.cfg.info.colors;
  switch (f.id) {
    case 'titan': {
      // gauntlet
      ctx.fillStyle = outline0();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = front ? shade(c.accent, 6) : shade(c.secondary, 14);
      ctx.beginPath(); ctx.arc(x, y, 5.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.arc(x, y + 2.2, 5.8, 0.2, Math.PI - 0.2); ctx.fill();
      break;
    }
    case 'ember': {
      ctx.fillStyle = outline0();
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = front ? c.glow : shade(c.secondary, 18);
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
      if (front) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = c.glow;
        ctx.beginPath(); ctx.arc(x, y, 5.8 + Math.sin(tick * 0.02) * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'volt': {
      ctx.fillStyle = outline0();
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = front ? shade(c.accent, 4) : shade(c.secondary, 16);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      if (front && Math.sin(tick * 0.4) > 0.4) {
        ctx.strokeStyle = c.glow;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 2); ctx.lineTo(x, y); ctx.lineTo(x - 1, y + 3);
        ctx.stroke();
      }
      break;
    }
    default: {
      ctx.fillStyle = outline0();
      ctx.beginPath(); ctx.arc(x, y, 4.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  void ang;
}
function outline0() { return 'rgba(6,6,16,0.92)'; }

function drawBackDetail(ctx: CanvasRenderingContext2D, f: Fighter, shoulderY: number, tick: number) {
  const c = f.cfg.info.colors;
  switch (f.id) {
    case 'vanguard': {
      ctx.fillStyle = shade(c.secondary, 6);
      ctx.beginPath();
      ctx.moveTo(-7, shoulderY + 1);
      ctx.lineTo(-14.5, shoulderY + 9 + Math.sin(tick * 0.05) * 0.8);
      ctx.lineTo(-6, shoulderY + 12);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'hook': {
      // scarf
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, shoulderY + 3);
      let sx = -5, sy = shoulderY + 3;
      for (let i = 1; i <= 3; i++) {
        sx -= 4.6; sy += 1.2 + Math.sin(tick * 0.14 + i) * 1.7;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      break;
    }
    case 'titan': {
      ctx.fillStyle = shade(c.secondary, 4);
      roundCapsule(ctx, -8.5, shoulderY + 8, 7.5, 15, 3.6); ctx.fill();
      break;
    }
    case 'nova': {
      // drifting star motes
      ctx.fillStyle = hexA(c.glow, 0.7);
      for (let i = 0; i < 2; i++) {
        const a = tick * 0.04 + i * Math.PI;
        const mx = -11 + Math.cos(a) * 3;
        const my = shoulderY + 6 + Math.sin(a) * 6;
        ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'frost': {
      // fur collar
      ctx.strokeStyle = shade(c.accent, -16);
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const x = -8 + i * 4;
        ctx.moveTo(x, shoulderY + 2);
        ctx.lineTo(x + 1, shoulderY + 5.5 + Math.sin(tick * 0.05 + i) * 0.6);
      }
      ctx.stroke();
      break;
    }
    case 'wraith': {
      // shadow wisps trailing
      ctx.fillStyle = hexA(c.primary, 0.4);
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(tick * 0.09 + i * 2.1) * 2.2;
        ctx.beginPath();
        ctx.ellipse(-9 - i * 3.5, shoulderY + 6 + i * 2.5 + wob, 3.4 - i * 0.7, 2 - i * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'volt': {
      // static sparks off the shoulders
      if (Math.floor(tick / 6) % 2 === 0) {
        ctx.strokeStyle = hexA(c.glow, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, shoulderY);
        ctx.lineTo(-9 - Math.sin(tick) * 1.5, shoulderY - 3);
        ctx.stroke();
      }
      break;
    }
    case 'seraph': {
      // folded light-wings: two layered feather fans glowing softly
      const flap = f.state === 'air' ? Math.sin(tick * 0.35) * 2.5 : Math.sin(tick * 0.08) * 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 5, shoulderY + 2);
        ctx.rotate(side * (0.5 + flap * 0.04));
        for (let i = 0; i < 5; i++) {
          const len = 15 - i * 1.6;
          const spread = side * (0.28 + i * 0.24);
          const ex = Math.sin(spread) * len * side;
          const ey = Math.cos(spread) * len * -1;
          ctx.strokeStyle = hexA(i % 2 ? c.accent : c.glow, 0.5 - i * 0.06);
          ctx.lineWidth = 3 - i * 0.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(ex * 0.5, ey * 0.7 - 2, ex, ey);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      break;
    }
    case 'viper': {
      // coiled tail swaying behind
      const sway = Math.sin(tick * 0.1) * 4;
      ctx.strokeStyle = outline0();
      ctx.lineWidth = 6.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, shoulderY + 16);
      ctx.quadraticCurveTo(-16, shoulderY + 22 + sway * 0.4, -13 + sway, shoulderY + 34);
      ctx.stroke();
      const tg = ctx.createLinearGradient(0, shoulderY + 10, -13 + sway, shoulderY + 34);
      tg.addColorStop(0, shade(c.secondary, 22));
      tg.addColorStop(1, c.primary);
      ctx.strokeStyle = tg;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(-4, shoulderY + 16);
      ctx.quadraticCurveTo(-16, shoulderY + 22 + sway * 0.4, -13 + sway, shoulderY + 34);
      ctx.stroke();
      // stinger tip
      ctx.fillStyle = c.glow;
      ctx.beginPath();
      ctx.moveTo(-13 + sway, shoulderY + 34);
      ctx.lineTo(-10 + sway, shoulderY + 41);
      ctx.lineTo(-16 + sway, shoulderY + 38);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: break;
  }
}

// ---------- weapon system ----------
// Every brawler carries a real signature weapon. It follows the arm during swings
// and rests over the shoulder when not attacking (carry offset keeps tips off the floor).

function bladePoly(ctx: CanvasRenderingContext2D, hx: number, hy: number, a: number, len: number, w0: number, w1: number) {
  const dx = Math.sin(a), dy = Math.cos(a);
  const px = Math.cos(a), py = -Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(hx + px * w0, hy + py * w0);
  ctx.lineTo(hx + dx * len + px * w1, hy + dy * len + py * w1);
  ctx.lineTo(hx + dx * len - px * w1, hy + dy * len - py * w1);
  ctx.lineTo(hx - px * w0, hy - py * w0);
  ctx.closePath();
}

/** Crescent blade band: outer arc widens toward the tip (a0 → a1 around pivot). */
function crescentPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, w: number, a0: number, a1: number, steps = 8) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const aa = a0 + (a1 - a0) * (i / steps);
    const rr = R + w * (i / steps);
    const X = cx + Math.cos(aa) * rr, Y = cy + Math.sin(aa) * rr;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  for (let i = steps; i >= 0; i--) {
    const aa = a0 + (a1 - a0) * (i / steps);
    ctx.lineTo(cx + Math.cos(aa) * R, cy + Math.sin(aa) * R);
  }
  ctx.closePath();
}

// carry rest angle per weapon kind (radians added to the arm angle when not swinging)
const WEAPON_CARRY: Record<string, number> = {
  saber: 2.05, falchion: 1.95, sickle: 1.8, maul: 2.3, staff: 2.1, tonfa: 1.55, glacier: 2.25, scythe: 2.0, lance: 2.4, kama: 1.5, fan: 1.7, crossbow: 1.75,
};

function drawWeapon(ctx: CanvasRenderingContext2D, f: Fighter, hx: number, hy: number, ang: number, tick: number, pose: Pose): { x: number; y: number } | null {
  const c = f.cfg.info.colors;
  const m = f.move;
  const w = f.cfg.weapon;
  if (!w) return null;
  const charging = f.state === 'attack' && !!m?.chargeable && f.chargeFrames > 0;
  const attacking = f.state === 'attack' && !!m;
  const carry = f.state !== 'attack' && f.state !== 'grabbing' && f.state !== 'victory' ? (WEAPON_CARRY[w.kind] ?? 1.9) : 0;
  const a = ang + carry;
  const dx = Math.sin(a), dy = Math.cos(a);   // along the weapon (0 = straight down)
  const px = Math.cos(a), py = -Math.sin(a);  // perpendicular
  const L = w.len;
  const tipX = hx + dx * L, tipY = hy + dy * L;
  const glow = w.glow ?? c.glow;

  // shared hilt pass
  const drawHilt = (back: number, width: number) => {
    ctx.strokeStyle = outline0(); ctx.lineWidth = width + 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - dx * back, hy - dy * back); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = shade(c.secondary, 22); ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(hx - dx * back, hy - dy * back); ctx.lineTo(hx, hy); ctx.stroke();
    // grip wrap stripes
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      const t = -back * (i / 3);
      ctx.beginPath();
      ctx.moveTo(hx + dx * t + px * width * 0.5, hy + dy * t + py * width * 0.5);
      ctx.lineTo(hx + dx * t - px * width * 0.5, hy + dy * t - py * width * 0.5);
      ctx.stroke();
    }
  };

  switch (w.kind) {
    // ------------------------------------------------ VANGUARD: Rift Saber
    case 'saber': {
      drawHilt(9, 4);
      // crossguard
      ctx.strokeStyle = outline0(); ctx.lineWidth = 6.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx + px * 6, hy + py * 6); ctx.lineTo(hx - px * 6, hy - py * 6); ctx.stroke();
      ctx.strokeStyle = shade(c.accent, -14); ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(hx + px * 6, hy + py * 6); ctx.lineTo(hx - px * 6, hy - py * 6); ctx.stroke();
      // energy aura
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charging ? 0.62 : 0.34;
      ctx.strokeStyle = glow; ctx.lineWidth = charging ? 11 : 8;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.restore();
      // blade — tapered quad with hard outline
      ctx.fillStyle = outline0();
      bladePoly(ctx, hx + dx * 1.5, hy + dy * 1.5, a, L - 1.5, 3.4, 1.2); ctx.fill();
      const bg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.5, c.accent);
      bg.addColorStop(1, glow);
      ctx.fillStyle = bg;
      bladePoly(ctx, hx + dx * 1.5, hy + dy * 1.5, a, L - 1.5, 2.3, 0.55); ctx.fill();
      // hot core line
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(hx + dx * 4, hy + dy * 4); ctx.lineTo(tipX - dx * 3, tipY - dy * 3); ctx.stroke();
      return { x: tipX, y: tipY };
    }

    // ------------------------------------------------ EMBER: Cinder Falchion
    case 'falchion': {
      drawHilt(7, 3.6);
      // guard disc
      ctx.fillStyle = outline0();
      ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(c.glow, -30);
      ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2); ctx.fill();
      // curved blade — crescent band curling forward
      const pivotX = hx - px * 9, pivotY = hy - py * 9;
      const R0 = 9;
      const a0 = Math.atan2(hy - pivotY, hx - pivotX);           // angle of hand around pivot
      // sweep direction follows weapon orientation (sign of perpendicular alignment)
      const sweep = (px * dy - py * dx) >= 0 ? 1 : -1;
      const aEnd = a0 + sweep * (L / R0) * 0.95;
      ctx.fillStyle = outline0();
      crescentPath(ctx, pivotX, pivotY, R0, 6.4, a0, aEnd); ctx.fill();
      const fg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      fg.addColorStop(0, '#ff5a26');
      fg.addColorStop(0.55, '#ff9a52');
      fg.addColorStop(1, '#ffd166');
      ctx.fillStyle = fg;
      crescentPath(ctx, pivotX, pivotY, R0, 4.6, a0, aEnd); ctx.fill();
      // hot edge
      ctx.strokeStyle = 'rgba(255,235,190,0.9)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, R0 + 4.6, Math.min(a0, aEnd), Math.max(a0, aEnd));
      ctx.stroke();
      // rising flame wisps along the blade
      const heat = attacking ? 1.5 : 1;
      for (let i = 0; i < 3; i++) {
        const tt = 0.35 + i * 0.26;
        const aa = a0 + sweep * (L / R0) * 0.95 * tt;
        const wx = pivotX + Math.cos(aa) * (R0 + 5.5), wy = pivotY + Math.sin(aa) * (R0 + 5.5);
        const h = (3.5 + Math.sin(tick * 0.33 + i * 2.1) * 1.8) * heat;
        ctx.fillStyle = i % 2 ? glow : '#ffd166';
        ctx.beginPath();
        ctx.moveTo(wx - 1.8, wy);
        ctx.quadraticCurveTo(wx + Math.sin(tick * 0.3 + i) * 2, wy - h - 2.5, wx + 1.8, wy);
        ctx.closePath(); ctx.fill();
      }
      return { x: tipX, y: tipY };
    }

    // ------------------------------------------------ HOOK: Rift Sickle
    case 'sickle': {
      drawHilt(6, 3.4);
      // straight shaft
      const shX = hx + dx * L * 0.55, shY = hy + dy * L * 0.55;
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(shX, shY); ctx.stroke();
      ctx.strokeStyle = shade(c.secondary, 30); ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(shX, shY); ctx.stroke();
      // hooked blade curving off the shaft tip
      const a0 = a - 0.35;
      const a1 = a0 + 1.5;
      const R0 = L * 0.42;
      ctx.fillStyle = outline0();
      crescentPath(ctx, shX, shY, R0 * 0.4, 6, a0, a1); ctx.fill();
      const hg = ctx.createLinearGradient(shX, shY, tipX, tipY);
      hg.addColorStop(0, shade(c.accent, -8));
      hg.addColorStop(1, glow);
      ctx.fillStyle = hg;
      crescentPath(ctx, shX, shY, R0 * 0.4, 4, a0, a1); ctx.fill();
      ctx.strokeStyle = 'rgba(240,230,255,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(shX, shY, R0 * 0.4 + 4, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      // dangling chain from the pommel
      ctx.fillStyle = shade(c.accent, -40);
      for (let i = 1; i <= 3; i++) {
        const sway = Math.sin(tick * 0.08 + i) * 1.4 * i;
        ctx.beginPath();
        ctx.arc(hx - dx * (4 + i * 3.4) + px * sway * 0.4, hy - dy * (4 + i * 3.4) + sway, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return { x: tipX, y: tipY };
    }

    // ------------------------------------------------ TITAN: Star-Iron Maul
    case 'maul': {
      drawHilt(8, 4.6);
      // thick shaft
      const headC = L - 6;
      const cxT = hx + dx * headC, cyT = hy + dy * headC;
      ctx.strokeStyle = outline0(); ctx.lineWidth = 7.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cxT - dx * 3, cyT - dy * 3); ctx.stroke();
      ctx.strokeStyle = shade(c.secondary, 26); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cxT - dx * 3, cyT - dy * 3); ctx.stroke();
      // massive head (extends perpendicular — striking face forward)
      const dHat = 5.6, pHat = 10;
      ctx.fillStyle = outline0();
      ctx.beginPath();
      ctx.moveTo(cxT + dx * dHat + px * pHat, cyT + dy * dHat + py * pHat);
      ctx.lineTo(cxT - dx * dHat + px * pHat, cyT - dy * dHat + py * pHat);
      ctx.lineTo(cxT - dx * dHat - px * pHat, cyT - dy * dHat - py * pHat);
      ctx.lineTo(cxT + dx * dHat - px * pHat, cyT + dy * dHat - py * pHat);
      ctx.closePath(); ctx.fill();
      const mg = ctx.createLinearGradient(cxT - px * pHat, cyT - py * pHat, cxT + px * pHat, cyT + py * pHat);
      mg.addColorStop(0, shade(c.primary, -34));
      mg.addColorStop(0.5, c.primary);
      mg.addColorStop(1, shade(c.primary, 26));
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(cxT + dx * (dHat - 1.2) + px * (pHat - 1.2), cyT + dy * (dHat - 1.2) + py * (pHat - 1.2));
      ctx.lineTo(cxT - dx * (dHat - 1.2) + px * (pHat - 1.2), cyT - dy * (dHat - 1.2) + py * (pHat - 1.2));
      ctx.lineTo(cxT - dx * (dHat - 1.2) - px * (pHat - 1.2), cyT - dy * (dHat - 1.2) - py * (pHat - 1.2));
      ctx.lineTo(cxT + dx * (dHat - 1.2) - px * (pHat - 1.2), cyT + dy * (dHat - 1.2) - py * (pHat - 1.2));
      ctx.closePath(); ctx.fill();
      // glowing star-iron seams
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charging ? 0.85 : 0.45;
      ctx.strokeStyle = glow; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cxT + px * pHat * 0.6, cyT + py * pHat * 0.6);
      ctx.lineTo(cxT - px * pHat * 0.6, cyT - py * pHat * 0.6);
      ctx.stroke();
      ctx.restore();
      // charge flare behind the head
      if (charging) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cxT, cyT, 13 + Math.sin(tick * 0.4) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // strike face tip = leading corner
      return { x: cxT + px * pHat * 0.9, y: cyT + py * pHat * 0.9 };
    }

    // ------------------------------------------------ NOVA: Astral Staff
    case 'staff': {
      drawHilt(7, 3.2);
      // long shaft with twin accent rings
      ctx.strokeStyle = outline0(); ctx.lineWidth = 4.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      const sg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      sg.addColorStop(0, shade(c.secondary, 34));
      sg.addColorStop(1, shade(c.accent, -6));
      ctx.strokeStyle = sg; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      for (const t of [0.3, 0.62]) {
        const rx = hx + dx * L * t, ry = hy + dy * L * t;
        ctx.strokeStyle = glow; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx + px * 2.6, ry + py * 2.6); ctx.lineTo(rx - px * 2.6, ry - py * 2.6);
        ctx.stroke();
      }
      // big star head
      const sr = 6.4 + Math.sin(tick * 0.2) * 0.5 + (charging ? 1.8 : 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(tipX, tipY, 0.5, tipX, tipY, sr * 2.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(tipX, tipY, sr * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f4f9ff';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a2 = i * Math.PI * 2 / 5 + tick * 0.04 - Math.PI / 2;
        ctx.lineTo(tipX + Math.cos(a2) * sr * 1.7, tipY + Math.sin(a2) * sr * 1.7);
        ctx.lineTo(tipX + Math.cos(a2 + Math.PI / 5) * sr * 0.66, tipY + Math.sin(a2 + Math.PI / 5) * sr * 0.66);
      }
      ctx.closePath(); ctx.fill();
      // orbiting mote
      const oa = tick * 0.09;
      ctx.fillStyle = hexA(glow, 0.85);
      ctx.beginPath();
      ctx.arc(tipX + Math.cos(oa) * sr * 2.3, tipY + Math.sin(oa) * sr * 1.1, 1.3, 0, Math.PI * 2);
      ctx.fill();
      return { x: tipX, y: tipY };
    }

    // ------------------------------------------------ VOLT: Storm Tonfa
    case 'tonfa': {
      drawHilt(4, 3.4);
      // main shaft
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      const tg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      tg.addColorStop(0, shade(c.secondary, 30));
      tg.addColorStop(1, shade(c.accent, 10));
      ctx.strokeStyle = tg; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      // perpendicular side handle
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(hx + px * 5.5, hy + py * 5.5); ctx.lineTo(hx - px * 4, hy - py * 4); ctx.stroke();
      ctx.strokeStyle = shade(c.secondary, 36); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx + px * 5.5, hy + py * 5.5); ctx.lineTo(hx - px * 4, hy - py * 4); ctx.stroke();
      // crackling arcs along the shaft
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const inten = charging || attacking ? 1 : 0.55;
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k === 0 ? glow : '#ffffff';
        ctx.globalAlpha = 0.75 * inten;
        ctx.lineWidth = k === 0 ? 1.8 : 0.9;
        ctx.beginPath();
        ctx.moveTo(hx + dx * 3, hy + dy * 3);
        const segs = 4;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const jitter = Math.sin(tick * 0.9 + k * 5 + i * 3.1) * 2.6 * inten;
          ctx.lineTo(hx + dx * L * t + px * jitter, hy + dy * L * t + py * jitter);
        }
        ctx.stroke();
      }
      // tip spark
      ctx.globalAlpha = 0.9 * inten;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tipX, tipY, 1.8 + Math.sin(tick * 0.7) * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return { x: tipX, y: tipY };
    }

    // ------------------------------------------------ FROST: Glacier Maul
    case 'glacier': {
      drawHilt(8, 4.2);
      const headC = L - 7;
      const cxG = hx + dx * headC, cyG = hy + dy * headC;
      ctx.strokeStyle = outline0(); ctx.lineWidth = 6.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cxG, cyG); ctx.stroke();
      ctx.strokeStyle = shade(c.secondary, 30); ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cxG, cyG); ctx.stroke();
      // faceted crystal head — elongated diamond
      const dG = 6.4, pG = 9.4;
      ctx.fillStyle = outline0();
      ctx.beginPath();
      ctx.moveTo(cxG + dx * dG, cyG + dy * dG);
      ctx.lineTo(cxG + px * pG, cyG + py * pG);
      ctx.lineTo(cxG - dx * dG * 0.7, cyG - dy * dG * 0.7);
      ctx.lineTo(cxG - px * pG, cyG - py * pG);
      ctx.closePath(); ctx.fill();
      const ig = ctx.createLinearGradient(cxG - px * pG, cyG - py * pG, cxG + px * pG, cyG + py * pG);
      ig.addColorStop(0, '#eafcff');
      ig.addColorStop(0.5, glow);
      ig.addColorStop(1, shade(c.primary, -30));
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.moveTo(cxG + dx * (dG - 1.4), cyG + dy * (dG - 1.4));
      ctx.lineTo(cxG + px * (pG - 1.4), cyG + py * (pG - 1.4));
      ctx.lineTo(cxG - dx * (dG - 1.4) * 0.7, cyG - dy * (dG - 1.4) * 0.7);
      ctx.lineTo(cxG - px * (pG - 1.4), cyG - py * (pG - 1.4));
      ctx.closePath(); ctx.fill();
      // facets
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cxG + dx * dG * 0.7, cyG + dy * dG * 0.7); ctx.lineTo(cxG - px * pG * 0.55, cyG - py * pG * 0.55);
      ctx.moveTo(cxG + px * pG * 0.55, cyG + py * pG * 0.55); ctx.lineTo(cxG - dx * dG * 0.4, cyG - dy * dG * 0.4);
      ctx.stroke();
      // frost mist
      if (charging || attacking) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cxG, cyG, pG * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return { x: cxG + dx * dG, y: cyG + dy * dG };
    }

    // ------------------------------------------------ WRAITH: Void Scythe
    case 'scythe': {
      drawHilt(7, 3.4);
      // dark shaft
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      const wg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      wg.addColorStop(0, shade(c.secondary, 16));
      wg.addColorStop(1, shade(c.primary, 8));
      ctx.strokeStyle = wg; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      // curved crescent blade hanging off the tip
      const pivotX = tipX - dx * 2, pivotY = tipY - dy * 2;
      const a0 = a + Math.PI * 0.62;
      const sweep = (px * dy - py * dx) >= 0 ? 1 : -1;
      const a1 = a0 + sweep * 1.55;
      const R0 = L * 0.46;
      ctx.fillStyle = outline0();
      crescentPath(ctx, pivotX, pivotY, R0 * 0.55, 6.2, a0, a1); ctx.fill();
      const bg2 = ctx.createLinearGradient(tipX, tipY, pivotX + Math.cos((a0 + a1) / 2) * R0, pivotY + Math.sin((a0 + a1) / 2) * R0);
      bg2.addColorStop(0, shade(c.primary, 22));
      bg2.addColorStop(1, shade(c.secondary, 30));
      ctx.fillStyle = bg2;
      crescentPath(ctx, pivotX, pivotY, R0 * 0.55, 4.2, a0, a1); ctx.fill();
      // void edge glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = glow; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, R0 * 0.55 + 4.2, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
      ctx.restore();
      // smoke wisp off the blade
      const wa = (a0 + a1) / 2;
      const wx2 = pivotX + Math.cos(wa) * (R0 * 0.55 + 6), wy2 = pivotY + Math.sin(wa) * (R0 * 0.55 + 6);
      ctx.fillStyle = hexA(c.glow, 0.3);
      ctx.beginPath();
      ctx.ellipse(wx2 + Math.sin(tick * 0.1) * 1.5, wy2 - 2 + Math.cos(tick * 0.13) * 1.5, 2.6, 1.4, tick * 0.05, 0, Math.PI * 2);
      ctx.fill();
      return { x: pivotX + Math.cos(a1) * (R0 * 0.55 + 4.2), y: pivotY + Math.sin(a1) * (R0 * 0.55 + 4.2) };
    }

    // ------------------------------------------------ SERAPH: Dawn Lance
    case 'lance': {
      drawHilt(8, 4);
      // long polished shaft with an outline and gradient sheen
      ctx.strokeStyle = outline0(); ctx.lineWidth = 6.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx - dx * 6, hy - dy * 6); ctx.lineTo(tipX, tipY); ctx.stroke();
      const lg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      lg.addColorStop(0, shade(c.secondary, 30));
      lg.addColorStop(0.6, shade(c.primary, 12));
      lg.addColorStop(1, c.accent);
      ctx.strokeStyle = lg; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(hx - dx * 6, hy - dy * 6); ctx.lineTo(tipX - dx * L * 0.14, tipY - dy * L * 0.14); ctx.stroke();
      // conical spearhead — the longest reach in the rift
      const tipA = a;
      const headLen = L * 0.2;
      const baseX = tipX - dx * headLen, baseY = tipY - dy * headLen;
      ctx.fillStyle = outline0();
      ctx.beginPath();
      ctx.moveTo(tipX + dx * 2, tipY + dy * 2);
      ctx.lineTo(baseX + px * 4.6, baseY + py * 4.6);
      ctx.lineTo(baseX - px * 4.6, baseY - py * 4.6);
      ctx.closePath(); ctx.fill();
      const hg = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
      hg.addColorStop(0, '#fff6d9');
      hg.addColorStop(0.65, glow);
      hg.addColorStop(1, '#ffffff');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.moveTo(tipX + dx * 1, tipY + dy * 1);
      ctx.lineTo(baseX + px * 3.2, baseY + py * 3.2);
      ctx.lineTo(baseX - px * 3.2, baseY - py * 3.2);
      ctx.closePath(); ctx.fill();
      // halo ring where shaft meets head
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charging ? 0.9 : 0.55;
      ctx.strokeStyle = glow; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(baseX, baseY, 5.4 + Math.sin(tick * 0.15) * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // twin tassels streaming from the base ring
      ctx.strokeStyle = hexA(c.primary, 0.85); ctx.lineWidth = 1.4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(
          baseX - dx * 6 + px * s * 4, baseY - dy * 6 + py * s * 4,
          baseX - dx * 13 + px * s * 6 + Math.sin(tick * 0.1 + s) * 1.5, baseY - dy * 13 + py * s * 6,
        );
        ctx.stroke();
      }
      return { x: tipX + dx * 2, y: tipY + dy * 2 };
    }

    // ------------------------------------------------ VIPER: Venom Kamas
    case 'kama': {
      drawHilt(5, 3.2);
      // short handle
      ctx.strokeStyle = outline0(); ctx.lineWidth = 4.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX - dx * L * 0.3, tipY - dy * L * 0.3); ctx.stroke();
      const kg = ctx.createLinearGradient(hx, hy, tipX, tipY);
      kg.addColorStop(0, shade(c.secondary, 26));
      kg.addColorStop(1, shade(c.primary, 10));
      ctx.strokeStyle = kg; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX - dx * L * 0.3, tipY - dy * L * 0.3); ctx.stroke();
      // curved sickle blade sweeping off the tip
      const pvx = tipX - dx * L * 0.3, pvy = tipY - dy * L * 0.3;
      const sweep = (px * dy - py * dx) >= 0 ? 1 : -1;
      const ka0 = Math.atan2(tipY - pvy, tipX - pvx);
      const ka1 = ka0 + sweep * 1.9;
      const kR = L * 0.62;
      ctx.fillStyle = outline0();
      crescentPath(ctx, pvx, pvy, kR * 0.72, 4.6, ka0, ka1); ctx.fill();
      const vb = ctx.createLinearGradient(pvx, pvy, tipX, tipY);
      vb.addColorStop(0, '#eaffd0');
      vb.addColorStop(0.6, glow);
      vb.addColorStop(1, shade(glow, -18));
      ctx.fillStyle = vb;
      crescentPath(ctx, pvx, pvy, kR * 0.72, 2.8, ka0, ka1); ctx.fill();
      // venom drip on the edge
      const da = (ka0 + ka1) / 2;
      const drX = pvx + Math.cos(da) * (kR * 0.72 + 4), drY = pvy + Math.sin(da) * (kR * 0.72 + 4);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(drX, drY + Math.sin(tick * 0.12) * 1.2, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = glow; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pvx, pvy, kR * 0.72 + 3.4, Math.min(ka0, ka1), Math.max(ka0, ka1));
      ctx.stroke();
      ctx.restore();
      return { x: pvx + Math.cos(ka1) * (kR * 0.72 + 3.4), y: pvy + Math.sin(ka1) * (kR * 0.72 + 3.4) };
    }

    // ------------------------------------------------ TEMPEST: Gale War Fans
    case 'fan': {
      drawHilt(5, 3);
      // folded steel fan: a flared wedge of slats spreading off the hand
      const flare = attacking ? 1 : 0.55 + Math.sin(tick * 0.1) * 0.04; // opens on attack
      const spread = 1.15 * flare;
      const a0 = a - spread / 2, a1 = a + spread / 2;
      // outer fan face
      ctx.fillStyle = outline0();
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.sin(a0) * L, hy + Math.cos(a0) * L);
      ctx.quadraticCurveTo(hx + dx * (L + 6), hy + dy * (L + 6), hx + Math.sin(a1) * L, hy + Math.cos(a1) * L);
      ctx.closePath();
      ctx.fill();
      const fgr = ctx.createLinearGradient(hx, hy, tipX, tipY);
      fgr.addColorStop(0, shade(c.secondary, 30));
      fgr.addColorStop(0.6, shade(c.primary, 8));
      fgr.addColorStop(1, glow);
      ctx.fillStyle = fgr;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.sin(a0) * (L - 1.6), hy + Math.cos(a0) * (L - 1.6));
      ctx.quadraticCurveTo(hx + dx * (L + 4), hy + dy * (L + 4), hx + Math.sin(a1) * (L - 1.6), hy + Math.cos(a1) * (L - 1.6));
      ctx.closePath();
      ctx.fill();
      // slat ribs
      ctx.strokeStyle = 'rgba(8,14,22,0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const ra = a0 + (spread * i) / 4;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.sin(ra) * (L - 2), hy + Math.cos(ra) * (L - 2));
        ctx.stroke();
      }
      // glowing leading edge + wind shimmer
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = attacking ? 0.7 : 0.4;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, L - 0.5, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.stroke();
      ctx.restore();
      // iron end caps
      ctx.fillStyle = shade(c.accent, -6);
      for (const ea of [a0, a1]) {
        ctx.beginPath(); ctx.arc(hx + Math.sin(ea) * L, hy + Math.cos(ea) * L, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // twin-fan offhand glint (second fan rides the other arm)
      if (attacking && tick % 4 < 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(hx, hy, L * 0.8, a0 - Math.PI / 2 - 0.4, a1 - Math.PI / 2 + 0.4); ctx.stroke();
        ctx.restore();
      }
      return { x: hx + Math.sin(a) * L, y: hy + Math.cos(a) * L };
    }

    // ------------------------------------------------ JAEGER: Longshot Crossbow
    case 'crossbow': {
      // stock along the arm, bow limbs perpendicular at the tip, taut string
      const stockBack = 12;
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx - dx * stockBack, hy - dy * stockBack); ctx.lineTo(tipX, tipY); ctx.stroke();
      const sg = ctx.createLinearGradient(hx - dx * stockBack, hy - dy * stockBack, tipX, tipY);
      sg.addColorStop(0, shade(c.secondary, 26));
      sg.addColorStop(1, shade(c.primary, 14));
      ctx.strokeStyle = sg; ctx.lineWidth = 3.8;
      ctx.beginPath(); ctx.moveTo(hx - dx * stockBack, hy - dy * stockBack); ctx.lineTo(tipX, tipY); ctx.stroke();
      // recurve limbs (perpendicular arc at the tip)
      const limb = L * 0.42;
      ctx.strokeStyle = outline0(); ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(tipX + px * limb, tipY + py * limb);
      ctx.quadraticCurveTo(tipX + px * limb * 0.5 + dx * 5, tipY + py * limb * 0.5 + dy * 5, tipX - px * limb, tipY - py * limb);
      ctx.stroke();
      ctx.strokeStyle = shade(c.accent, -12); ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(tipX + px * limb, tipY + py * limb);
      ctx.quadraticCurveTo(tipX + px * limb * 0.5 + dx * 5, tipY + py * limb * 0.5 + dy * 5, tipX - px * limb, tipY - py * limb);
      ctx.stroke();
      // string (drawn back when attacking/charging)
      const pull = attacking ? 8 : 0;
      ctx.strokeStyle = 'rgba(240,235,215,0.85)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(tipX + px * limb, tipY + py * limb);
      ctx.lineTo(hx - dx * (stockBack - 2) - dx * pull, hy - dy * (stockBack - 2) - dy * pull);
      ctx.lineTo(tipX - px * limb, tipY - py * limb);
      ctx.stroke();
      // loaded bolt glow when about to fire
      if (charging || (attacking && f.moveFrame <= (f.move?.startup ?? 0) + 2)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = glow; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(tipX - dx * 8, tipY - dy * 8); ctx.lineTo(tipX + dx * 8, tipY + dy * 8); ctx.stroke();
        ctx.restore();
      }
      // scope glint
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(hx + dx * 4 + px * 3, hy + dy * 4 + py * 3, 1.7, 0, Math.PI * 2); ctx.fill();
      return { x: tipX + dx * 4, y: tipY + dy * 4 };
    }
  }
  return { x: tipX, y: tipY };
}

/** Shadow blob beneath fighter, projected to nearest ground below */
export function drawFighterShadow(ctx: CanvasRenderingContext2D, f: Fighter, groundY: number | null, alpha = 1) {
  if (groundY === null || f.state === 'ko' || f.state === 'respawn') return;
  const dy = groundY - (f.y + f.h / 2);
  if (dy < -4 || dy > 260) return;
  const a = alpha * clamp(1 - dy / 260, 0.15, 0.55);
  ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  ctx.beginPath();
  const shrink = clamp(dy / 260, 0, 0.7);
  ctx.ellipse(f.x, groundY - 2, f.w * 0.55 * (1 - shrink), 4.6 * (1 - shrink), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Shield bubble */
export function drawShield(ctx: CanvasRenderingContext2D, f: Fighter, tick: number) {
  if (!f.shielding || f.state !== 'shield') return;
  const r = f.getShieldRadius();
  const c = f.cfg.info.colors;
  const pulse = 1 + Math.sin(tick * 0.3) * 0.03;
  const hpRatio = f.shieldHp / f.shieldMax;
  ctx.save();
  ctx.globalAlpha = 0.14 + hpRatio * 0.1;
  ctx.fillStyle = c.glow;
  ctx.beginPath(); ctx.arc(f.x, f.y, r * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = c.glow;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(f.x, f.y, r * pulse, 0, Math.PI * 2); ctx.stroke();
  // hex-ish inner shimmer
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(f.x, f.y, r * pulse * 0.8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + tick * 0.01;
    const px = f.x + Math.cos(a) * r * pulse * 0.55;
    const py = f.y + Math.sin(a) * r * pulse * 0.55;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

/** Grab tension indicator when grabbing */
export function drawGrabLink(ctx: CanvasRenderingContext2D, f: Fighter) {
  if (f.state !== 'grabbing' || !f.grabTarget) return;
  const v = f.grabTarget;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = f.cfg.info.colors.glow;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(v.x, v.y); ctx.stroke();
  ctx.restore();
}
