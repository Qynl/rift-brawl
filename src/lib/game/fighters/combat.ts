// ============ RIFT BRAWL — Projectiles, Traps & Hookshots ============

import type { Fighter, World } from './Fighter';
import { WEAPON_REACH_RADIUS, HITBOX_BOOST } from './Fighter';
import { MoveData } from '../core/types';
import { clamp, rand } from '../core/constants';

// ---------- WEAPON SWING FX SPEC (shared by local sim + netplay replication) ----------

export interface SwingFXSpec {
  kind: string;
  style: string;            // per-character FX language (rift / flame / chain / quake ...)
  x: number; y: number;     // world anchor (body pivot for arcs/rings, body front for stabs)
  ang: number;              // world-space swing angle (0 = right, PI/2 = up on screen)
  radius: number;           // swing reach in px
  scale: number;            // FX size scale (strong moves bigger)
  color: string;
  dir: 1 | -1;              // crescent sweep direction
  span: number;             // crescent span radians
  grounded: boolean;
}

/** Build the swing-FX spec for the first active frame of a melee move. */
export function swingFXSpec(f: Fighter, m: MoveData): SwingFXSpec | null {
  const hb0 = m.hitboxes?.[0];
  if (!hb0) return null;
  const s = f.scale;
  const wreach = f.cfg.weapon?.reach ?? 0;
  const color = m.fxColor ?? f.cfg.weapon?.glow ?? f.cfg.info.colors.glow;
  const mo = m.motion;
  const kind = mo?.kind ?? 'slash';
  const scale = (m.strong ? 1.4 : 1) * (mo?.fxScale ?? 1);
  const off = f.motionOffset(hb0, m, m.startup + 1, wreach);
  const worldAng = f.facing >= 0 ? off.ang : Math.PI - off.ang;
  const bodyY = f.y - 6 * s;
  const swingDist = Math.hypot(off.dx, off.dy) * s + (hb0.r * HITBOX_BOOST + wreach * WEAPON_REACH_RADIUS) * s;
  let span = 2.25;
  let dirX: 1 | -1 = 1;
  if (mo?.sweep) {
    span = Math.max(1.6, Math.min(3.2, (Math.abs(mo.sweep[1] - mo.sweep[0]) * Math.PI) / 180 + 0.55));
    dirX = mo.sweep[1] >= mo.sweep[0] ? 1 : -1;
  }
  const dir: 1 | -1 = f.facing >= 0 ? dirX : ((-dirX) as 1 | -1);
  return {
    kind,
    style: f.cfg.weapon?.fxStyle ?? '',
    x: f.x,
    y: bodyY,
    ang: worldAng,
    radius: swingDist,
    scale,
    color,
    dir,
    span,
    grounded: f.grounded,
  };
}

export class Projectile {
  kind: 'fireball' | 'boomerang' | 'hookshot' | 'wave' | 'shockwave' | 'flare' | 'star' | 'bolt' | 'icicle' | 'shadoworb' | 'beam' | 'dart' | 'gust' | 'arrow' | 'net' | 'scatter';
  x = 0; y = 0; px = 0; py = 0;
  vx = 0; vy = 0;
  life: number; maxLife: number;
  r: number;
  dmg: number; angle: number; bkb: number; kbg: number;
  owner: Fighter;
  hitVictims = new Set<number>();
  hitsLeft: number;
  dead = false;
  color: string;
  tick = 0;
  phase: 'out' | 'back' = 'out';
  storeX = 0; storeY = 0;
  maxDist: number;
  originX = 0; originY = 0;
  groundHug: boolean;
  pull: boolean;
  venom: boolean;
  root: boolean;

  constructor(owner: Fighter, move: MoveData, dir: number) {
    this.owner = owner;
    const pd = move.projectile!;
    this.kind = pd.kind;
    this.x = this.px = owner.x + dir * 20 * owner.scale;
    this.y = this.py = owner.y - 2 * owner.scale;
    this.vx = pd.speed * dir;
    this.vy = pd.vy ?? 0;
    this.maxLife = pd.life;
    this.life = pd.life;
    this.r = pd.r * (pd.kind === 'boomerang' ? 1 : owner.scale);
    this.dmg = pd.dmg;
    this.angle = pd.angle;
    this.bkb = pd.bkb;
    this.kbg = pd.kbg;
    this.hitsLeft = pd.hits ?? 1;
    this.color = pd.color;
    this.groundHug = !!pd.groundHug;
    this.pull = !!pd.pull;
    this.venom = !!pd.venom;
    this.root = !!pd.root;
    this.maxDist = pd.kind === 'boomerang' ? 300 : 1000;
    this.originX = this.x; this.originY = this.y;
    if (pd.kind === 'boomerang') this.vy = -0.6;
    if (pd.kind === 'fireball') this.vy = 0.35;
    if (pd.kind === 'icicle') this.vy = pd.vy ?? -3;
    if (pd.kind === 'star' && this.pull) this.vy = -0.5;
    if (pd.kind === 'dart') this.vy = pd.vy ?? -1.2;
    if (pd.kind === 'net') this.vy = pd.vy ?? -3.2;
    if (pd.kind === 'scatter') this.vy = pd.vy ?? -0.4;
    if (pd.kind === 'arrow') this.vy = pd.vy ?? 0;
    if (pd.kind === 'beam') {
      this.r = pd.r; // beams ignore owner scale (uniform lance of light)
    }
    if (pd.kind === 'shockwave') {
      // spawn at the owner's feet level
      this.y = this.py = owner.y + owner.h / 2 - this.r * 0.55;
    }
  }

  update(world: World) {
    this.px = this.x; this.py = this.y;
    this.tick++;
    this.life--;
    if (this.life <= 0) {
      this.dead = true;
      if (this.kind === 'dart') world.spawnVenomCloud(this.x, this.y, this.owner);
      return;
    }

    if (this.kind === 'boomerang') {
      if (this.phase === 'out') {
        const traveled = Math.hypot(this.x - this.originX, this.y - this.originY);
        if (traveled > this.maxDist || this.life < this.maxLife * 0.45) this.phase = 'back';
        this.vy += Math.sin(this.tick * 0.12) * 0.08;
      } else {
        // seek owner
        const dx = this.owner.x - this.x, dy = this.owner.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 8.5;
        this.vx = (dx / d) * sp;
        this.vy = (dy / d) * sp;
        if (d < 26) { this.dead = true; return; }
      }
    }
    if (this.kind === 'hookshot') {
      // straight flight, handled on collision by Match
    }

    this.x += this.vx;
    this.y += this.vy;

    if (this.kind === 'fireball') {
      world.particles.fire(this.x, this.y, 1, this.color);
    }
    if (this.kind === 'star') {
      // star bolts weave gently; the gravity well slowly settles and pulses
      this.vy += Math.sin(this.tick * 0.09) * (this.pull ? 0.02 : 0.05);
      if (this.pull && this.tick > 26) { this.vx *= 0.86; this.vy *= 0.86; }
      world.particles.emit({
        type: 'glow', x: this.x, y: this.y, maxLife: this.pull ? 26 : 12,
        size: this.pull ? 7 : 4.5, color: this.color, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3),
      });
    }
    if (this.kind === 'bolt' && this.tick % 2 === 0) {
      world.particles.emit({
        type: 'spark', x: this.x - Math.sign(this.vx) * 6, y: this.y + rand(-3, 3),
        maxLife: 8, size: 3, color: this.color, vx: -this.vx * 0.12, vy: rand(-0.4, 0.4),
      });
    }
    if (this.kind === 'icicle') {
      this.vy += 0.12; // arcing lob
      world.particles.emit({
        type: 'glow', x: this.x, y: this.y, maxLife: 12, size: 3.5, color: this.color, vx: 0, vy: 0,
      });
    }
    if (this.kind === 'shadoworb' && this.tick % 3 === 0) {
      world.particles.emit({
        type: 'glow', x: this.x - Math.sign(this.vx) * 5, y: this.y + rand(-4, 4),
        maxLife: 22, size: 5.5, color: this.color, vx: rand(-0.2, 0.2), vy: rand(-0.5, -0.1),
      });
    }
    if (this.kind === 'beam' && this.tick % 2 === 0) {
      // scorching light trail
      world.particles.emit({
        type: 'glow', x: this.x - Math.sign(this.vx) * this.r * 1.4, y: this.y + rand(-3, 3),
        maxLife: 14, size: this.r * 0.75, color: this.color, vx: -this.vx * 0.06, vy: rand(-0.2, 0.2),
      });
    }
    if (this.kind === 'dart') {
      this.vy += 0.055; // slight arc
      if (this.tick % 3 === 0) {
        world.particles.emit({
          type: 'glow', x: this.x - Math.sign(this.vx) * 4, y: this.y,
          maxLife: 12, size: 3.4, color: this.color, vx: 0, vy: rand(-0.1, 0.1),
        });
      }
    }
    if (this.kind === 'gust') {
      // TEMPEST: rolling wind body — layered swirl trail
      if (this.tick % 2 === 0) {
        const a = this.tick * 0.5;
        world.particles.emit({ type: 'glow', x: this.x - Math.sign(this.vx) * 6, y: this.y + Math.sin(a) * 6, maxLife: 13, size: rand(4, 7), color: '#eafaff', vx: -this.vx * 0.06, vy: Math.cos(a) * 0.5, drag: 0.94 });
        world.particles.emit({ type: 'glow', x: this.x, y: this.y, maxLife: 10, size: 5, color: this.color, vx: rand(-0.3, 0.3), vy: rand(-0.5, 0.5) });
      }
    }
    if (this.kind === 'arrow' && this.tick % 3 === 0) {
      world.particles.emit({ type: 'spark', x: this.x - Math.sign(this.vx) * 8, y: this.y, maxLife: 7, size: 2.8, color: this.color, vx: -this.vx * 0.08, vy: 0 });
    }
    if (this.kind === 'net') {
      this.vy += 0.14; // weighted lob
      if (this.tick % 3 === 0) {
        world.particles.emit({ type: 'glow', x: this.x, y: this.y + 3, maxLife: 10, size: 3, color: this.color, vx: 0, vy: 0.2 });
      }
    }
    if (this.kind === 'scatter' && this.tick % 2 === 0) {
      world.particles.emit({ type: 'spark', x: this.x, y: this.y, maxLife: 6, size: 2.6, color: this.color, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4) });
    }

    // shockwave: ride the platform top, die past the edge
    if (this.kind === 'shockwave') {
      let top: number | null = null;
      for (const p of world.stage.platforms) {
        if (p.broken > 0) continue;
        if (this.x > p.cx - 4 && this.x < p.cx + p.w + 4 && p.cy >= this.y - 30 && p.cy <= this.y + 80) {
          if (top === null || p.cy < top) top = p.cy;
        }
      }
      if (top === null) { this.dead = true; world.particles.dust(this.x, this.y, 0, 4); return; }
      this.y = top - this.r * 0.55;
      this.vy = 0;
      if (this.tick % 2 === 0) {
        world.particles.emit({
          type: 'dust', x: this.x + (this.vx > 0 ? -this.r : this.r), y: top,
          vx: (this.vx > 0 ? -1 : 1) * rand(0.5, 1.6), vy: rand(-1.6, -0.4),
          maxLife: 14, size: rand(2, 4), color: this.color,
        });
      }
      return; // skips the generic platform collision below (it rides along the top)
    }

    // stage collision
    for (const p of world.stage.platforms) {
      if (p.broken > 0) continue;
      if (this.x > p.cx - this.r && this.x < p.cx + p.w + this.r && this.y > p.cy - this.r && this.y < p.cy + p.h + this.r) {
        if (this.kind === 'hookshot') {
          // latch point
          this.owner.hookPull = { x: this.x, y: this.y - 6 };
          this.dead = true;
          world.audio.play('proj_boomer');
          world.particles.emit({ type: 'ring', x: this.x, y: this.y, maxLife: 12, size: 4, color: '#c99aff', vx: 0, vy: 0 });
          return;
        }
        this.dead = true;
        if (this.kind === 'dart') world.spawnVenomCloud(this.x, this.y, this.owner);
        if (this.kind === 'net') {
          // net splats on the ground — harmless flutter
          for (let i = 0; i < 5; i++) {
            world.particles.emit({ type: 'glow', x: this.x + rand(-10, 10), y: this.y + rand(-4, 4), maxLife: 14, size: 3.5, color: this.color, vx: rand(-0.6, 0.6), vy: rand(-0.4, 0.4) });
          }
        }
        world.particles.hitBurst(this.x, this.y, 0, 0.2, this.color, 0.5);
        return;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number) {
    const rx = this.px + (this.x - this.px) * alpha;
    const ry = this.py + (this.y - this.py) * alpha;
    ctx.save();
    if (this.kind === 'wave') {
      // crescent energy wave (Vanguard's Rift Wave)
      const dir = Math.sign(this.vx) || 1;
      ctx.translate(rx, ry);
      ctx.scale(dir, 1);
      const pulse = 1 + Math.sin(this.tick * 0.5) * 0.08;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(-this.r * 0.4, 0, this.r * pulse, -0.9, 0.9);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(-this.r * 0.9, 0, this.r * 0.8 * pulse, -0.7, 0.7);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, this.r * 1.2);
      g.addColorStop(0, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (this.kind === 'shockwave') {
      // ground-hugging shockwave (Titan)
      const h = this.r * (1 + Math.sin(this.tick * 0.6) * 0.12);
      const g = ctx.createLinearGradient(rx, ry - h, rx, ry + h * 0.4);
      g.addColorStop(0, 'rgba(255,209,102,0)');
      g.addColorStop(0.55, this.color);
      g.addColorStop(1, 'rgba(140,70,10,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(rx - this.r * 1.4, ry + this.r * 0.5);
      ctx.quadraticCurveTo(rx, ry - h * 1.6, rx + this.r * 1.4, ry + this.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.7)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (this.kind === 'fireball') {
      const g = ctx.createRadialGradient(rx, ry, 1, rx, ry, this.r * 1.5);
      g.addColorStop(0, '#fff3c0');
      g.addColorStop(0.5, this.color);
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (this.kind === 'boomerang') {
      ctx.translate(rx, ry);
      ctx.rotate(this.tick * 0.4);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.r); ctx.lineTo(this.r * 0.85, this.r * 0.5); ctx.lineTo(-this.r * 0.85, this.r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (this.kind === 'star') {
      // NOVA: four-point star; the gravity well version is larger with an event-horizon ring
      const rot = this.tick * (this.pull ? 0.03 : 0.14);
      const rr = this.r * (this.pull ? 1 + Math.sin(this.tick * 0.11) * 0.1 : 1);
      const glow = ctx.createRadialGradient(rx, ry, 1, rx, ry, rr * 1.9);
      glow.addColorStop(0, this.color);
      glow.addColorStop(0.45, this.pull ? 'rgba(90,110,220,0.35)' : 'rgba(140,180,255,0.3)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(rx, ry, rr * 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.fillStyle = '#f4f9ff';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const a2 = a + Math.PI / 4;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a2) * rr * 0.38, Math.sin(a2) * rr * 0.38);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (this.pull) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.arc(0, 0, rr * 2.3 + Math.sin(this.tick * 0.1) * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    } else if (this.kind === 'bolt') {
      // VOLT: jagged lightning bolt segment
      const dir = Math.sign(this.vx) || 1;
      ctx.translate(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, this.r * 2.2);
      g.addColorStop(0, 'rgba(255,250,190,0.9)');
      g.addColorStop(1, 'rgba(255,240,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fffbe0';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-dir * this.r * 2, 0);
      ctx.lineTo(-dir * this.r * 0.6, -3.5);
      ctx.lineTo(dir * 1, 2.5);
      ctx.lineTo(dir * this.r * 1.9, -1);
      ctx.stroke();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (this.kind === 'icicle') {
      // FROST: spinning shard pointing along its velocity
      const ang = Math.atan2(this.vy, this.vx);
      ctx.translate(rx, ry);
      ctx.rotate(ang + Math.PI / 2);
      const g = ctx.createLinearGradient(0, -this.r * 1.7, 0, this.r * 0.9);
      g.addColorStop(0, '#eafcff');
      g.addColorStop(0.5, this.color);
      g.addColorStop(1, 'rgba(80,170,220,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -this.r * 1.7);
      ctx.lineTo(this.r * 0.62, this.r * 0.55);
      ctx.lineTo(0, this.r * 0.95);
      ctx.lineTo(-this.r * 0.62, this.r * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(230,251,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (this.kind === 'shadoworb') {
      // WRAITH: creeping void orb with a dark core and violet corona
      const g = ctx.createRadialGradient(rx, ry, 1, rx, ry, this.r * 1.8);
      g.addColorStop(0, '#0d0820');
      g.addColorStop(0.55, this.color);
      g.addColorStop(1, 'rgba(60,40,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1233';
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 0.62 * (1 + Math.sin(this.tick * 0.2) * 0.08), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(217,204,255,0.7)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 0.95, this.tick * 0.15, this.tick * 0.15 + Math.PI * 1.4); ctx.stroke();
    } else if (this.kind === 'beam') {
      // SERAPH: piercing lance of light — hot core + wide glow + leading tip
      const dir = Math.sign(this.vx) || 1;
      const len = this.r * 4.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(rx - dir * len, ry, rx + dir * len * 0.4, ry);
      g.addColorStop(0, 'rgba(255,224,138,0)');
      g.addColorStop(0.7, this.color);
      g.addColorStop(1, '#ffffff');
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      ctx.lineWidth = this.r * 1.15;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(rx - dir * len, ry); ctx.lineTo(rx + dir * this.r * 0.6, ry); ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = this.r * 0.42;
      ctx.beginPath(); ctx.moveTo(rx - dir * len * 0.7, ry); ctx.lineTo(rx + dir * this.r * 0.5, ry); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(rx + dir * this.r * 0.4, ry, this.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.kind === 'gust') {
      // TEMPEST Gale Burst: concentric wind rings rushing forward
      const dir = Math.sign(this.vx) || 1;
      const wob = Math.sin(this.tick * 0.4) * 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const off = -i * 9 * dir;
        ctx.globalAlpha = 0.55 - i * 0.15;
        ctx.strokeStyle = i === 0 ? '#ffffff' : this.color;
        ctx.lineWidth = 2.6 - i * 0.6;
        ctx.beginPath();
        ctx.arc(rx + off, ry + wob * (i * 0.4), this.r * (1 - i * 0.16), -1.15, 1.15);
        ctx.stroke();
      }
      ctx.restore();
    } else if (this.kind === 'arrow') {
      // JAEGER power bolt: steel shaft, broadhead tip, fletching
      const ang = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      ctx.strokeStyle = '#d8d2c2';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-this.r * 2.4, 0); ctx.lineTo(this.r * 1.4, 0); ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(this.r * 2.1, 0);
      ctx.lineTo(this.r * 0.9, -this.r * 0.62);
      ctx.lineTo(this.r * 0.9, this.r * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f1fae6';
      ctx.beginPath();
      ctx.moveTo(-this.r * 2.4, -this.r * 0.5);
      ctx.lineTo(-this.r * 1.5, 0);
      ctx.lineTo(-this.r * 2.4, this.r * 0.5);
      ctx.closePath(); ctx.fill();
      const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, this.r * 2);
      gl.addColorStop(0, 'rgba(255,179,71,0.35)');
      gl.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.kind === 'net') {
      // JAEGER weighted net: tumbling mesh disc
      const ang = Math.atan2(this.vy, this.vx) + this.tick * 0.3;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * 1.7, this.r * 1.1, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.7;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * this.r * 0.55, -this.r * 0.9);
        ctx.lineTo(i * this.r * 0.55, this.r * 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6b6152';
      ctx.beginPath(); ctx.arc(this.r * 1.2, 0, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.kind === 'scatter') {
      // JAEGER scatter pellet: small heavy slug with heat trail
      const g2 = ctx.createRadialGradient(rx, ry, 1, rx, ry, this.r * 2.4);
      g2.addColorStop(0, '#fff3d9');
      g2.addColorStop(0.4, this.color);
      g2.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath(); ctx.arc(rx, ry, this.r * 0.7, 0, Math.PI * 2); ctx.fill();
    } else if (this.kind === 'dart') {
      // VIPER: venom dart — slim needle with a glowing droplet
      const ang = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      const gd = ctx.createRadialGradient(0, 0, 1, 0, 0, this.r * 1.8);
      gd.addColorStop(0, 'rgba(174,246,92,0.55)');
      gd.addColorStop(1, 'rgba(174,246,92,0)');
      ctx.fillStyle = gd;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaffd0';
      ctx.beginPath();
      ctx.moveTo(this.r * 1.5, 0);
      ctx.lineTo(-this.r * 0.9, -this.r * 0.5);
      ctx.lineTo(-this.r * 0.9, this.r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(-this.r * 1.3, 0, this.r * 0.4 * (1 + Math.sin(this.tick * 0.4) * 0.2), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      // hookshot: chain + hook head
      const ox = this.owner.x, oy = this.owner.y - 6;
      ctx.strokeStyle = 'rgba(220,210,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.fillStyle = '#c99aff';
      ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#efe6ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, 7.5, 0.6, 2.6); ctx.stroke();
    }
    ctx.restore();
  }
}

export class Trap {
  x: number; y: number;
  owner: Fighter;
  arm = 30;
  life = 640;
  dead = false;
  triggered = false;
  tick = 0;
  style: 'rune' | 'spikes' | 'venom' | 'light' | 'beartrap' = 'rune';

  constructor(owner: Fighter, x: number, y: number) {
    this.owner = owner;
    this.x = x; this.y = y;
    if (owner.id === 'viper') this.style = 'venom';
  }

  update(world: World, fighters: Fighter[]) {
    this.tick++;
    if (this.arm > 0) { this.arm--; return; }
    if (this.style === 'beartrap') {
      this.life--;
      if (this.life <= 0) { this.dead = true; return; }
      // JAEGER Snare Trap: clamps the first grounded foe that steps on it
      for (const f of fighters) {
        if (f === this.owner || f.state === 'ko' || f.state === 'respawn' || f.invuln > 0) continue;
        if (f.grounded && Math.abs(f.x - this.x) < 21 * f.scale && Math.abs((f.y + f.h / 2) - this.y) < 16) {
          this.dead = true;
          const dir = f.x >= this.x ? 1 : -1;
          const kb = f.applyKnockback(13, 76, 9, 22, dir, this.owner, null);
          f.hitstun = Math.max(f.hitstun, 44);   // clamped in place — free punish window
          this.owner.damageDealt += 13;
          world.audio.play('snap');
          world.particles.hitBurst(f.x, f.y + 10, 90, 0.85, '#ffb347', 1);
          world.particles.emit({ type: 'ring', x: f.x, y: f.y + 12, maxLife: 14, size: 7, color: '#ffb347', vx: 0, vy: 0, drag: 1 });
          const hs = Math.round(clamp(10 + kb * 0.4, 8, 14));
          this.owner.applyHitstop(hs);
          f.applyHitstop(hs);
          world.shake(0.32);
          break;
        }
      }
      if (this.tick % 22 === 0) {
        world.particles.emit({ type: 'glow', x: this.x, y: this.y - 5, maxLife: 14, size: 2.6, color: '#ffb347', vx: 0, vy: -0.4 });
      }
      return;
    }
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.style === 'light') {
      // SERAPH Sunspot Ward: periodically zaps the nearest foe in range
      if (this.tick % 46 === 0) {
        let best: Fighter | null = null; let bestD = 118;
        for (const f of fighters) {
          if (f === this.owner || f.state === 'ko' || f.state === 'respawn' || f.invuln > 0) continue;
          const d = Math.hypot(f.x - this.x, f.y - this.y);
          if (d < bestD) { bestD = d; best = f; }
        }
        if (best) {
          const dir = best.x > this.x ? 1 : -1;
          const kb = best.applyKnockback(5, 55, 10, 26, dir, this.owner, null);
          best.hitstun = Math.max(best.hitstun, 14);
          this.owner.damageDealt += 5;
          world.audio.play('proj_fire');
          world.particles.emit({ type: 'ring', x: best.x, y: best.y, maxLife: 12, size: 6, color: '#ffe08a', vx: 0, vy: 0, drag: 1 });
          for (let i = 0; i < 5; i++) {
            world.particles.emit({ type: 'spark', x: best.x + rand(-6, 6), y: best.y + rand(-8, 8), maxLife: 8, size: 3.4, color: '#ffe08a', vx: rand(-1.4, 1.4), vy: rand(-2.2, -0.4) });
          }
          const hs = Math.round(clamp(6 + kb * 0.4, 5, 10));
          this.owner.applyHitstop(hs);
          best.applyHitstop(hs);
        }
      }
      if (this.tick % 10 === 0) {
        world.particles.emit({ type: 'glow', x: this.x + rand(-10, 10), y: this.y - rand(2, 16), maxLife: 18, size: 4, color: '#ffe08a', vx: 0, vy: -0.5 });
      }
      return;
    }
    if (this.tick % 14 === 0) {
      world.particles.emit({
        type: 'glow', x: this.x + Math.sin(this.tick * 0.2) * 6, y: this.y - 4,
        maxLife: 20, size: 5, color: this.style === 'venom' ? 'rgba(174,246,92,0.85)' : 'rgba(200,150,255,0.8)', vx: 0, vy: -0.4,
      });
    }
    const reach = this.style === 'venom' ? 40 : 34;
    for (const f of fighters) {
      if (f === this.owner || f.state === 'ko' || f.state === 'respawn' || f.invuln > 0) continue;
      if (Math.hypot(f.x - this.x, f.y - this.y) < reach * f.scale) {
        // trigger
        this.dead = true;
        const dir = f.x > this.x ? 1 : -1;
        const venomous = this.style === 'venom';
        const kb = f.applyKnockback(venomous ? 5 : 6, 78, 10, 24, dir, this.owner, null);
        f.hitstun = Math.max(f.hitstun, 20);
        if (venomous) f.applyPoison(2);
        this.owner.damageDealt += 6;
        world.audio.play('trap');
        world.particles.hitBurst(f.x, f.y, 80, 0.4, venomous ? '#aef65c' : '#c99aff', 0.8);
        const hs = Math.round(clamp(8 + kb * 0.5, 6, 12));
        this.owner.applyHitstop(hs);
        f.applyHitstop(hs + 2);
        world.shake(0.25);
        break;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number) {
    void alpha;
    const a = this.arm > 0 ? 0.4 : 0.75 + Math.sin(this.tick * 0.15) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = a;
    if (this.style === 'beartrap') {
      // JAEGER Snare Trap: jagged steel jaws on a staked base
      const armed = this.arm <= 0;
      const open = armed ? 1 + Math.sin(this.tick * 0.08) * 0.06 : 0.45;
      ctx.save();
      ctx.fillStyle = '#3d3a33';
      ctx.strokeStyle = 'rgba(14,12,8,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // jaws (two arcs of teeth)
      ctx.strokeStyle = '#b8b2a2';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, -2, 12 * open, 5.5 * open, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8d8778';
      ctx.beginPath(); ctx.ellipse(0, -1, 12 * open, 4.4 * open, 0, 0, Math.PI); ctx.stroke();
      // teeth glints
      ctx.fillStyle = '#ffb347';
      for (let i = -2; i <= 2; i++) {
        const tx = i * 4.4 * open;
        ctx.beginPath(); ctx.moveTo(tx - 1.4, -3 - open * 2); ctx.lineTo(tx, -7 * open - 1); ctx.lineTo(tx + 1.4, -3 - open * 2); ctx.closePath(); ctx.fill();
      }
      // warning glimmer
      if (armed && this.tick % 30 < 4) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.arc(0, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (this.style === 'light') {
      // SERAPH Sunspot Ward: floating radiant halo with light column
      const hov = Math.sin(this.tick * 0.06) * 3;
      const g = ctx.createLinearGradient(0, -70, 0, 6);
      g.addColorStop(0, 'rgba(255,224,138,0)');
      g.addColorStop(0.75, 'rgba(255,224,138,0.22)');
      g.addColorStop(1, 'rgba(255,246,217,0.5)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-14, 4); ctx.lineTo(-8 + hov, -68); ctx.lineTo(8 + hov, -68); ctx.lineTo(14, 4);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.translate(hov, -58);
      ctx.strokeStyle = '#ffe08a';
      ctx.shadowColor = '#ffe08a';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 4.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.85;
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (this.style === 'venom') {
      // VIPER Toxic Snare: bubbling toxin pool with fang glyphs
      const g = ctx.createRadialGradient(0, -3, 2, 0, 0, 34);
      g.addColorStop(0, 'rgba(140,232,60,0.85)');
      g.addColorStop(0.6, 'rgba(90,160,40,0.45)');
      g.addColorStop(1, 'rgba(90,160,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -2, 32, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aef65c';
      for (let i = -1; i <= 1; i++) {
        const bx = i * 11 + Math.sin(this.tick * 0.1 + i * 2) * 3;
        const by = -3 - ((this.tick * 0.7 + i * 21) % 14);
        ctx.beginPath(); ctx.arc(bx, by, 2.2 + Math.sin(this.tick * 0.2 + i) * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(234,255,208,0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, 0, 27, 6.5, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (this.style === 'spikes') {
      // WRAITH: void spikes — dark rift torn open, jagged fangs
      const grow = this.arm > 0 ? 0.5 : 1;
      const g = ctx.createRadialGradient(0, -3, 2, 0, 0, 30);
      g.addColorStop(0, 'rgba(30,18,60,0.95)');
      g.addColorStop(0.6, 'rgba(90,64,190,0.5)');
      g.addColorStop(1, 'rgba(90,64,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -2, 26 * grow, 9 * grow, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b9a6ff';
      for (let i = -2; i <= 2; i++) {
        const h = (10 + Math.abs(i) * -3 + Math.sin(this.tick * 0.12 + i * 1.7) * 2.5) * grow;
        ctx.beginPath();
        ctx.moveTo(i * 8 - 4, 0);
        ctx.lineTo(i * 8 + Math.sin(this.tick * 0.08 + i) * 1.5, -h);
        ctx.lineTo(i * 8 + 4, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(217,204,255,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 24 * grow, 6 * grow, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    // rune
    ctx.strokeStyle = '#c99aff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -2, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -2); ctx.lineTo(0, -9); ctx.lineTo(10, -2); ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
