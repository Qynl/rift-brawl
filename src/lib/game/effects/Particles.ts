// ============ RIFT BRAWL — Pooled Particle & Effect System ============

import { rand, randInt, pick } from '../core/constants';

export type ParticleType =
  | 'spark' | 'dust' | 'smoke' | 'ember' | 'shard' | 'ring' | 'flash'
  | 'streak' | 'star' | 'leaf' | 'snow' | 'firefly' | 'bubble' | 'glow' | 'icicle_frag'
  | 'boom' | 'line' | 'streamer' | 'num' | 'slash';

export interface Particle {
  active: boolean;
  type: ParticleType;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  rot: number; vrot: number;
  additive: boolean;
  wobble: number;
  label: string;   // text for 'num' particles
  len: number;     // beam length for 'line' / 'streamer'
  style: string;   // per-character FX variant for 'slash' (chain/volt/frost/void/gale/quake/light)
}

export class ParticleSystem {
  pool: Particle[] = [];
  cap: number;
  private head = 0;

  constructor(cap = 700) {
    this.cap = cap;
    for (let i = 0; i < cap; i++) {
      this.pool.push({
        active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, color: '#fff', grav: 0, drag: 1,
        rot: 0, vrot: 0, additive: true, wobble: 0, label: '', len: 0, style: '',
      });
    }
  }

  clear() { for (const p of this.pool) p.active = false; }

  setBudget(budget: number) { /* cap rendering density */ this._budget = budget; }
  private _budget = 1;

  private spawn(): Particle | null {
    for (let i = 0; i < this.cap; i++) {
      const p = this.pool[this.head];
      this.head = (this.head + 1) % this.cap;
      if (!p.active) return p;
    }
    return null;
  }

  emit(opts: Partial<Particle> & { x: number; y: number }) {
    const p = this.spawn();
    if (!p) return;
    p.active = true;
    p.type = opts.type ?? 'spark';
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0;
    p.maxLife = opts.maxLife ?? 30;
    p.life = p.maxLife;
    p.size = opts.size ?? 3;
    p.color = opts.color ?? '#ffffff';
    p.grav = opts.grav ?? 0;
    p.drag = opts.drag ?? 0.98;
    p.rot = opts.rot ?? 0;
    p.vrot = opts.vrot ?? 0;
    p.additive = opts.additive ?? (p.type === 'spark' || p.type === 'ember' || p.type === 'ring' || p.type === 'flash' || p.type === 'glow' || p.type === 'star' || p.type === 'boom' || p.type === 'line' || p.type === 'streamer' || p.type === 'slash');
    p.wobble = opts.wobble ?? 0;
    p.label = opts.label ?? '';
    p.len = opts.len ?? 0;
    p.style = opts.style ?? '';
  }

  // ---- effect recipes ----

  hitBurst(x: number, y: number, angleDeg: number, power: number, color: string, quality = 1) {
    // ---- Smash-grade impact: white core flash + 4-point smash star ----
    this.emit({ type: 'flash', x, y, maxLife: 7, size: 15 + power * 22, color: '#ffffff' });
    this.emit({ type: 'boom', x, y, maxLife: 9 + power * 7, size: 9 + power * 19, color: '#ffffff', rot: rand(0, Math.PI), vrot: 0.05 });
    this.emit({ type: 'boom', x, y, maxLife: 7 + power * 5, size: (9 + power * 19) * 0.62, color, rot: rand(0, Math.PI), vrot: -0.06 });
    // radial burst lines
    const lines = Math.round((6 + power * 7) * quality);
    for (let i = 0; i < lines; i++) {
      const a = (i / lines) * Math.PI * 2 + rand(-0.22, 0.22);
      const sp = rand(1.6, 3.4 + power * 3.4);
      this.emit({
        type: 'line', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        maxLife: rand(6, 12), size: rand(1.4, 2.4), len: rand(9, 15 + power * 12),
        color: i % 2 ? '#ffffff' : color, drag: 0.86,
      });
    }
    // directional cone of sparks (knockback direction)
    const rad = angleDeg * Math.PI / 180;
    const n = Math.round((7 + power * 5) * quality);
    for (let i = 0; i < n; i++) {
      const spread = rand(-0.55, 0.55);
      const a = rad + spread + Math.PI;
      const sp = rand(2, 5 + power * 5);
      this.emit({
        type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        maxLife: rand(10, 24), size: rand(1.5, 3.5 + power), color, grav: 0.08, drag: 0.9,
      });
    }
    this.emit({ type: 'ring', x, y, vx: 0, vy: 0, maxLife: 10 + power * 6, size: 6, color, drag: 1 });
    if (power > 0.5) {
      for (let i = 0; i < 4 * quality; i++) {
        this.emit({
          type: 'star', x: x + rand(-8, 8), y: y + rand(-8, 8),
          vx: rand(-3, 3), vy: rand(-3, 3), maxLife: rand(14, 26), size: rand(2, 5), color: '#fff', grav: 0.05, drag: 0.92,
        });
      }
    }
  }

  /** Floating damage number (Smash-show style feedback) */
  damageNumber(x: number, y: number, dmg: number, power: number) {
    this.emit({
      type: 'num', x: x + rand(-4, 4), y: y - 6, vx: rand(-0.3, 0.3), vy: -1.15,
      maxLife: 26, size: 10 + power * 6, color: power > 0.75 ? '#ffd166' : power > 0.4 ? '#ffeaa0' : '#ffffff',
      label: String(Math.round(dmg)), grav: 0.012, drag: 0.985,
    });
  }

  /**
   * Real weapon slash: tapered crescent arc with a hot leading edge.
   * (x,y) arc center, `center`/`dir` set where the swing sweeps, `radius` its reach,
   * `span` radians of sweep, `scale` sizes strong hits up.
   */
  slashArc(x: number, y: number, center: number, dir: 1 | -1, radius: number, span: number, color: string, scale = 1) {
    this.emit({
      type: 'slash', x, y, maxLife: 16, size: radius * scale,
      rot: center, vrot: dir, len: span, color,
    });
    // soft under-glow crescent (wider, dimmer) for depth
    this.emit({
      type: 'slash', x, y, maxLife: 12, size: radius * scale * 0.8,
      rot: center, vrot: dir, len: span * 0.8, color: '#ffffff',
    });
  }

  /** THRUST: piercing stab flash — elongated spear-line punching outward along `ang`. */
  stab(x: number, y: number, ang: number, len: number, color: string, scale = 1) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    // white-hot core line
    this.emit({ type: 'line', x: x - ux * len * 0.15, y: y - uy * len * 0.15, rot: ang, maxLife: 9, size: 3.2 * scale, len: len * 0.85, color: '#ffffff', drag: 1 });
    // colored outer lance + fading echo
    this.emit({ type: 'line', x, y, rot: ang, maxLife: 12, size: 5 * scale, len: len, color, drag: 1 });
    this.emit({ type: 'line', x: x - ux * len * 0.4, y: y - uy * len * 0.4, rot: ang, maxLife: 14, size: 6.5 * scale, len: len * 0.7, color, drag: 1 });
    // tip shock
    this.emit({ type: 'ring', x: x + ux * len * 0.9, y: y + uy * len * 0.9, maxLife: 10, size: 5, color, vx: 0, vy: 0, drag: 1 });
    for (let i = 0; i < 4; i++) {
      const a = ang + rand(-0.5, 0.5);
      this.emit({
        type: 'line', x: x + ux * len * 0.85, y: y + uy * len * 0.85,
        rot: a, vx: Math.cos(a) * rand(2, 4.5), vy: Math.sin(a) * rand(2, 4.5),
        maxLife: 7, size: 1.4, len: rand(6, 11), color: i % 2 ? '#ffffff' : color, drag: 0.88,
      });
    }
  }

  /** SPIN: full-circle reaping halo around the fighter. */
  slashRing(x: number, y: number, radius: number, color: string, scale = 1) {
    this.emit({ type: 'slash', x, y, maxLife: 15, size: radius * scale, rot: rand(0, Math.PI * 2), vrot: 1, len: Math.PI * 1.9, color });
    this.emit({ type: 'slash', x, y, maxLife: 11, size: radius * scale * 0.72, rot: rand(0, Math.PI * 2), vrot: -1, len: Math.PI * 1.9, color: '#ffffff' });
    this.emit({ type: 'ring', x, y, maxLife: 12, size: radius * 0.5, color, vx: 0, vy: 0, drag: 1 });
  }

  /**
   * Unified weapon-swing FX dispatcher.
   * STYLE FIRST: every brawler has its own FX language (fxStyle) so no two
   * characters' attacks look alike; motion kind then tunes the shape.
   * Used by the local simulation AND by netplay clients (same spec → same visuals).
   */
  swingFX(s: { kind: string; style?: string; x: number; y: number; ang: number; radius: number; scale: number; color: string; dir: 1 | -1; span: number; grounded: boolean }) {
    const style = s.style ?? '';
    const th = s.kind === 'thrust' || s.kind === 'punch' || s.kind === 'flurry';
    const ring = s.kind === 'spin';
    const cross = s.kind === 'cross';

    // point on the crescent at fraction f (0 tail → 1 head) — used to place style particles
    const arcPt = (f: number, spread = 0): { x: number; y: number } => {
      const a = s.ang - (s.span / 2) * s.dir + s.span * f * s.dir + spread;
      return { x: s.x + Math.cos(a) * s.radius * s.scale, y: s.y + Math.sin(a) * s.radius * s.scale };
    };

    switch (style) {
      // ================= per-character FX languages =================
      case 'rift': {
        // VANGUARD — twin crisp energy crescents + diamond sparks (rapier feel)
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 13, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: s.span * 0.92, color: s.color, style: 'rift' });
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 9, size: s.radius * s.scale * 0.62, rot: s.ang + 0.22 * s.dir, vrot: s.dir * 1.25, len: s.span * 0.7, color: '#ffffff', style: 'rift' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.3 + i * 0.2, rand(-0.12, 0.12));
          this.emit({ type: 'star', x: p.x, y: p.y, vx: Math.cos(s.ang) * rand(1, 2.4) * s.dir, vy: Math.sin(s.ang) * rand(1, 2.4), maxLife: 12, size: rand(1.8, 3), color: i % 2 ? '#ffffff' : s.color, vrot: rand(-0.3, 0.3) });
        }
        if (s.scale > 1.2) this.emit({ type: 'ring', x: s.x + Math.cos(s.ang) * s.radius * 0.7, y: s.y + Math.sin(s.ang) * s.radius * 0.7, maxLife: 10, size: 5, color: s.color, vx: 0, vy: 0, drag: 1 });
        break;
      }
      case 'flame': {
        // EMBER — burning fan: hot crescent + rising embers + smoke wisp
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 17, size: s.radius * s.scale * 1.08, rot: s.ang, vrot: s.dir, len: Math.max(2.1, s.span), color: s.color, style: 'flame' });
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 10, size: s.radius * s.scale * 0.6, rot: s.ang, vrot: s.dir, len: s.span * 0.62, color: '#fff3c0' });
        for (let i = 0; i < 6; i++) {
          const p = arcPt(0.15 + i * 0.15, rand(-0.2, 0.2));
          this.emit({ type: 'ember', x: p.x, y: p.y, vx: rand(-0.5, 0.9) * s.dir, vy: rand(-2.2, -0.6), maxLife: rand(16, 30), size: rand(2, 4.2), color: i % 3 === 0 ? '#ffd166' : s.color, grav: -0.03 });
        }
        this.emit({ type: 'smoke', x: s.x + Math.cos(s.ang) * s.radius * 0.8 * s.dir, y: s.y, vx: 0.2 * s.dir, vy: -0.8, maxLife: 30, size: 7, color: 'rgba(120,90,80,0.28)', additive: false });
        break;
      }
      case 'chain': {
        // HOOK — segmented chain-whip: links fly along the arc, hook glints at the tip
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 16, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.2, s.span), color: s.color, style: 'chain' });
        const tip = arcPt(1);
        this.emit({ type: 'ring', x: tip.x, y: tip.y, maxLife: 11, size: 4.5, color: '#ffffff', vx: 0, vy: 0, drag: 1 });
        for (let i = 0; i < 3; i++) {
          const p = arcPt(0.4 + i * 0.25, rand(-0.1, 0.1));
          this.emit({ type: 'spark', x: p.x, y: p.y, vx: rand(-1.4, 1.4), vy: rand(-1.4, 1.4), maxLife: 9, size: 2.2, color: i % 2 ? '#ffffff' : s.color, drag: 0.9 });
        }
        break;
      }
      case 'quake': {
        // TITAN — massive chunky arc + debris + shock dust (nothing subtle)
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 18, size: s.radius * s.scale * 1.16, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span * 0.9), color: s.color, style: 'quake' });
        this.emit({ type: 'flash', x: s.x + Math.cos(s.ang) * s.radius * 0.8, y: s.y + Math.sin(s.ang) * s.radius * 0.8, maxLife: 6, size: 22 * s.scale, color: '#ffffff' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.2 + i * 0.2, rand(-0.15, 0.15));
          this.emit({ type: 'shard', x: p.x, y: p.y, vx: Math.cos(s.ang) * rand(1.5, 3.4) * s.dir, vy: rand(-2.6, 0.4), maxLife: rand(18, 30), size: rand(2.4, 4.6), color: i % 2 ? '#ffd166' : '#c9b896', grav: 0.22, drag: 0.97, vrot: rand(-0.3, 0.3) });
        }
        if (s.grounded) this.smashImpact(s.x + Math.cos(s.ang) * s.radius * 0.5, s.y + 30, s.dir, s.color, s.scale);
        break;
      }
      case 'star': {
        // NOVA — spiral comet of stars with twinkles
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 15, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'gale' });
        for (let i = 0; i < 5; i++) {
          const p = arcPt(0.15 + i * 0.18, rand(-0.25, 0.25));
          this.emit({ type: 'star', x: p.x, y: p.y, vx: Math.cos(s.ang) * rand(0.8, 2.2) * s.dir + rand(-0.6, 0.6), vy: rand(-1.8, 0.2), maxLife: rand(14, 26), size: rand(2, 4), color: i % 2 ? '#ffffff' : s.color, grav: 0.02, drag: 0.95, vrot: rand(-0.2, 0.2) });
        }
        for (let i = 0; i < 3; i++) {
          const p = arcPt(rand(0.2, 0.9), rand(-0.3, 0.3));
          this.emit({ type: 'glow', x: p.x, y: p.y, maxLife: 14, size: rand(3.5, 6), color: s.color, vx: 0, vy: 0, drag: 0.93 });
        }
        break;
      }
      case 'volt': {
        // VOLT — jagged lightning arc with branching sparks
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 12, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'volt' });
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 8, size: s.radius * s.scale * 0.72, rot: s.ang, vrot: s.dir * 1.1, len: s.span * 0.85, color: '#ffffff', style: 'volt' });
        for (let i = 0; i < 5; i++) {
          const p = arcPt(rand(0.2, 1), rand(-0.4, 0.4));
          const ba = rand(0, Math.PI * 2);
          this.emit({ type: 'line', x: p.x, y: p.y, vx: Math.cos(ba) * rand(2, 4.6), vy: Math.sin(ba) * rand(2, 4.6), maxLife: rand(5, 9), size: 1.6, len: rand(6, 13), color: i % 2 ? '#fffbe0' : s.color, drag: 0.88 });
        }
        break;
      }
      case 'frost': {
        // FROST — crystal crescent with teeth, shards raining
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 16, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'frost' });
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 10, size: s.radius * s.scale * 0.66, rot: s.ang, vrot: s.dir, len: s.span * 0.7, color: '#ffffff' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.2 + i * 0.2, rand(-0.15, 0.15));
          this.emit({ type: 'icicle_frag', x: p.x, y: p.y, vx: Math.cos(s.ang) * rand(0.6, 1.8) * s.dir, vy: rand(-0.4, 1.2), maxLife: rand(16, 26), size: rand(2.6, 5), color: s.color, grav: 0.14 });
        }
        break;
      }
      case 'void': {
        // WRAITH — dark scythe crescent, void tendrils drifting inward
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 18, size: s.radius * s.scale * 1.05, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'void' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.15 + i * 0.22, rand(-0.2, 0.2));
          this.emit({ type: 'glow', x: p.x, y: p.y, maxLife: rand(18, 26), size: rand(4, 7), color: i % 2 ? '#3d2a73' : s.color, vx: (s.x - p.x) * 0.035, vy: (s.y - p.y) * 0.035, drag: 0.95 });
        }
        this.emit({ type: 'ring', x: s.x, y: s.y, maxLife: 12, size: s.radius * 0.4, color: '#8a76d9', vx: 0, vy: 0, drag: 1 });
        break;
      }
      case 'light': {
        // SERAPH — radiant crescent + holy rays + drifting feathers
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 16, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'light' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.2 + i * 0.2, rand(-0.1, 0.1));
          const ra = rand(0, Math.PI * 2);
          this.emit({ type: 'line', x: p.x, y: p.y, vx: Math.cos(ra) * rand(1.5, 3), vy: Math.sin(ra) * rand(1.5, 3), maxLife: rand(6, 10), size: 1.7, len: rand(8, 15), color: i % 2 ? '#ffffff' : s.color, drag: 0.9 });
        }
        for (let i = 0; i < 4; i++) {
          const p = arcPt(rand(0.1, 0.9), rand(-0.3, 0.3));
          this.emit({ type: 'glow', x: p.x, y: p.y, maxLife: rand(20, 30), size: rand(2.4, 4), color: '#fff6d9', vx: rand(-0.4, 0.4), vy: rand(0.4, 1.2), drag: 0.98 });
        }
        break;
      }
      case 'venom': {
        // VIPER — whip-crack arc + spraying venom droplets
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 12, size: s.radius * s.scale * 0.92, rot: s.ang, vrot: s.dir, len: Math.max(1.8, s.span * 0.85), color: s.color, style: 'rift' });
        const crack = arcPt(1);
        this.emit({ type: 'line', x: crack.x, y: crack.y, rot: s.ang, maxLife: 8, size: 3.4, len: 16, color: '#ffffff', drag: 1 });
        for (let i = 0; i < 5; i++) {
          const p = arcPt(rand(0.3, 1), rand(-0.25, 0.25));
          this.emit({ type: 'glow', x: p.x, y: p.y, maxLife: rand(12, 20), size: rand(2.2, 4), color: s.color, vx: Math.cos(s.ang) * rand(1, 2.6) * s.dir, vy: rand(-1.2, 0.6), grav: 0.16, drag: 0.96 });
        }
        break;
      }
      case 'gale': {
        // TEMPEST — triple concentric wind rings + streaking air
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 17, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'gale' });
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 13, size: s.radius * s.scale * 0.7, rot: s.ang + 0.3 * s.dir, vrot: s.dir * 1.3, len: s.span * 0.8, color: '#ffffff', style: 'gale' });
        for (let i = 0; i < 4; i++) {
          const p = arcPt(0.2 + i * 0.2, rand(-0.2, 0.2));
          this.emit({ type: 'streak', x: p.x, y: p.y, vx: Math.cos(s.ang) * rand(1.5, 3.2) * s.dir, vy: rand(-0.8, 0.8), maxLife: rand(10, 16), size: rand(4, 7), color: i % 2 ? '#ffffff' : s.color, drag: 0.92 });
        }
        break;
      }
      case 'hunter': {
        // JAEGER — steel crescent + crossbow bolt streaks
        this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 14, size: s.radius * s.scale, rot: s.ang, vrot: s.dir, len: Math.max(2.0, s.span), color: s.color, style: 'quake' });
        for (let i = 0; i < 3; i++) {
          const p = arcPt(0.35 + i * 0.25, rand(-0.12, 0.12));
          const ba = s.ang + rand(-0.3, 0.3);
          this.emit({ type: 'line', x: p.x, y: p.y, vx: Math.cos(ba) * rand(2.4, 4.4), vy: Math.sin(ba) * rand(2.4, 4.4), maxLife: rand(6, 10), size: 2, len: rand(9, 16), color: i % 2 ? '#ffffff' : '#ffb347', drag: 0.9 });
        }
        break;
      }
      default: {
        // generic fallback — motion-kind shapes (grab previews, unstyled callers)
        switch (s.kind) {
          case 'thrust':
            this.stab(s.x, s.y, s.ang, s.radius * 1.2, s.color, s.scale);
            break;
          case 'spin':
            this.slashRing(s.x, s.y, s.radius * 1.08, s.color, s.scale);
            break;
          case 'cross':
            this.crossSlash(s.x, s.y, s.ang, s.radius * 0.92, s.color, s.scale);
            break;
          case 'smash':
            this.slashArc(s.x, s.y, s.ang, s.dir, s.radius * 1.2, Math.max(1.9, s.span), s.color, s.scale * 1.18);
            if (s.grounded) this.smashImpact(s.x + Math.cos(s.ang) * s.radius * 0.5, s.y + 30, Math.cos(s.ang) >= 0 ? 1 : -1, s.color, s.scale);
            break;
          case 'flurry':
          case 'punch':
            this.stab(s.x, s.y, s.ang, s.radius * 0.95, s.color, s.scale * 0.85);
            break;
          case 'kick':
          case 'sweep':
            this.slashArc(s.x, s.y, s.ang, s.dir, s.radius, Math.max(2.0, s.span), s.color, s.scale);
            break;
          default: // slash
            this.slashArc(s.x, s.y, s.ang, s.dir, s.radius * 1.06, Math.max(2.0, s.span), s.color, s.scale);
        }
      }
    }
    // shared motion accents: thrusts get a stab core in every style; spins get a ring
    if (th && style !== '' && style !== 'rift' && style !== 'volt') {
      this.stab(s.x, s.y, s.ang, s.radius * 1.05, s.color, s.scale * 0.9);
    }
    if (ring && style !== '') {
      this.emit({ type: 'ring', x: s.x, y: s.y, maxLife: 11, size: s.radius * 0.45, color: s.color, vx: 0, vy: 0, drag: 1 });
    }
    if (cross && style !== '') {
      this.emit({ type: 'slash', x: s.x, y: s.y, maxLife: 14, size: s.radius * s.scale * 0.9, rot: s.ang - 0.5, vrot: -s.dir, len: 2.2, color: '#ffffff' });
    }
  }

  /** Per-character hit flavor — a small burst of the attacker's FX language on connect. */
  hitStyle(style: string, x: number, y: number, angleDeg: number, color: string, power: number) {
    const rad = angleDeg * Math.PI / 180;
    const dirX = Math.cos(rad);
    const n = Math.round(3 + power * 2);
    switch (style) {
      case 'flame':
        this.fire(x, y, n, color);
        break;
      case 'frost':
        for (let i = 0; i < n; i++) {
          this.emit({ type: 'icicle_frag', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: dirX * rand(1, 2.6) + rand(-0.8, 0.8), vy: rand(-1.4, 1), maxLife: rand(14, 24), size: rand(2.4, 4.6), color, grav: 0.18 });
        }
        break;
      case 'volt':
        for (let i = 0; i < n + 1; i++) {
          const a = rand(0, Math.PI * 2);
          this.emit({ type: 'line', x, y, vx: Math.cos(a) * rand(2, 4.4), vy: Math.sin(a) * rand(2, 4.4), maxLife: rand(4, 8), size: 1.7, len: rand(7, 13), color: i % 2 ? '#fffbe0' : color, drag: 0.87 });
        }
        break;
      case 'void':
        for (let i = 0; i < n; i++) {
          this.emit({ type: 'glow', x: x + rand(-8, 8), y: y + rand(-8, 8), maxLife: rand(16, 24), size: rand(3.5, 6.5), color: i % 2 ? '#3d2a73' : color, vx: rand(-0.8, 0.8), vy: rand(-1, 0.4), drag: 0.94 });
        }
        break;
      case 'light':
        for (let i = 0; i < n; i++) {
          this.emit({ type: 'glow', x: x + rand(-10, 10), y: y + rand(-8, 8), maxLife: rand(18, 28), size: rand(2.2, 3.8), color: '#fff6d9', vx: rand(-0.5, 0.5), vy: rand(0.3, 1.1), drag: 0.98 });
        }
        break;
      case 'star':
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          this.emit({ type: 'star', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: Math.cos(a) * rand(1.4, 3.2), vy: Math.sin(a) * rand(1.4, 3.2), maxLife: rand(12, 22), size: rand(2, 4), color: i % 2 ? '#ffffff' : color, grav: 0.04, drag: 0.93, vrot: rand(-0.3, 0.3) });
        }
        break;
      case 'venom':
        for (let i = 0; i < n; i++) {
          this.emit({ type: 'glow', x, y, vx: dirX * rand(0.8, 2.4) + rand(-0.6, 0.6), vy: rand(-1.6, 0.4), maxLife: rand(12, 20), size: rand(2.2, 4), color, grav: 0.2, drag: 0.95 });
        }
        break;
      case 'quake':
        for (let i = 0; i < n; i++) {
          this.emit({ type: 'shard', x: x + rand(-8, 8), y: y + rand(-6, 6), vx: dirX * rand(1.4, 3.2) + rand(-0.8, 0.8), vy: rand(-2.4, 0.2), maxLife: rand(16, 28), size: rand(2.4, 4.6), color: i % 2 ? '#ffd166' : '#c9b896', grav: 0.24, drag: 0.97, vrot: rand(-0.3, 0.3) });
        }
        break;
      case 'gale':
        this.emit({ type: 'ring', x, y, maxLife: 10, size: 5, color, vx: 0, vy: 0, drag: 1 });
        for (let i = 0; i < n - 1; i++) {
          this.emit({ type: 'streak', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: dirX * rand(1.6, 3), vy: rand(-1, 1), maxLife: rand(8, 14), size: rand(3.5, 6), color: i % 2 ? '#ffffff' : color, drag: 0.92 });
        }
        break;
      case 'chain':
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          this.emit({ type: 'spark', x, y, vx: Math.cos(a) * rand(1.6, 3.6), vy: Math.sin(a) * rand(1.6, 3.6), maxLife: rand(8, 14), size: 2.2, color: i % 2 ? '#ffffff' : color, drag: 0.9 });
        }
        break;
      case 'rift':
        for (let i = 0; i < n - 1; i++) {
          const a = rand(0, Math.PI * 2);
          this.emit({ type: 'star', x, y, vx: Math.cos(a) * rand(1.6, 3.4), vy: Math.sin(a) * rand(1.6, 3.4), maxLife: rand(8, 14), size: rand(1.6, 2.8), color: i % 2 ? '#ffffff' : color, vrot: rand(-0.3, 0.3), drag: 0.92 });
        }
        break;
      case 'hunter':
        for (let i = 0; i < 2; i++) {
          this.emit({ type: 'line', x, y, vx: dirX * rand(2.2, 3.8) + rand(-0.5, 0.5), vy: rand(-1, 1), maxLife: rand(6, 9), size: 2, len: rand(9, 15), color: i ? '#ffb347' : '#ffffff', drag: 0.9 });
        }
        break;
      default:
        break;
    }
  }

  /** CROSS: dual-weapon X slash — two mirrored crescents crossing at the body. */
  crossSlash(x: number, y: number, center: number, radius: number, color: string, scale = 1) {
    this.emit({ type: 'slash', x, y, maxLife: 15, size: radius * scale, rot: center + 0.5, vrot: 1, len: 2.3, color });
    this.emit({ type: 'slash', x, y, maxLife: 15, size: radius * scale, rot: center - 0.5, vrot: -1, len: 2.3, color: '#ffffff' });
  }

  /** SMASH: heavy ground impact — dust fan, shock ring, flash. */
  smashImpact(x: number, y: number, dir: number, color: string, scale = 1) {
    this.emit({ type: 'flash', x, y: y - 6, maxLife: 7, size: 34 * scale, color: '#ffffff' });
    this.emit({ type: 'ring', x, y: y - 4, maxLife: 16, size: 8, color, vx: 0, vy: 0, drag: 1 });
    this.emit({ type: 'boom', x, y: y - 8, maxLife: 12, size: 20 * scale, color, rot: rand(0, Math.PI), vrot: 0.04 });
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.38;
      this.emit({
        type: 'dust', x: x + Math.cos(a) * 6, y, vx: Math.cos(a) * rand(1.5, 3.4) + dir, vy: Math.sin(a) * rand(1, 2.6),
        maxLife: rand(16, 30), size: rand(3, 6.5) * scale, color: 'rgba(225,225,240,0.55)', grav: 0.05, drag: 0.9, additive: false,
      });
    }
  }

  shieldHit(x: number, y: number, color: string) {
    this.emit({ type: 'ring', x, y, maxLife: 14, size: 10, color });
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit({ type: 'spark', x, y, vx: Math.cos(a) * rand(1, 3), vy: Math.sin(a) * rand(1, 3), maxLife: 14, size: 2, color, drag: 0.92 });
    }
  }

  koBlast(x: number, y: number, color: string, quality = 1, big = true) {
    const n = big ? 52 : 20;
    for (let i = 0; i < n * quality; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(2, 13);
      this.emit({
        type: i % 3 === 0 ? 'ember' : 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        maxLife: rand(24, 60), size: rand(2, 5.5), color: i % 2 ? color : '#ffffff', grav: 0.06, drag: 0.95,
      });
    }
    this.emit({ type: 'flash', x, y, maxLife: 14, size: 110, color: '#ffffff' });
    this.emit({ type: 'boom', x, y, maxLife: 16, size: 56, color: '#ffffff', rot: rand(0, Math.PI), vrot: 0.03 });
    this.emit({ type: 'boom', x, y, maxLife: 14, size: 38, color, rot: Math.PI / 4, vrot: -0.04 });
    this.emit({ type: 'ring', x, y, maxLife: 26, size: 14, color: '#ffffff', vx: 0, vy: 0, drag: 1 });
    if (big) {
      this.emit({ type: 'ring', x, y, maxLife: 34, size: 8, color, vx: 0, vy: 0, drag: 1 });
      // KO streamers — long ribbons punching outward (Smash's iconic KO burst)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15);
        const sp = rand(7, 13);
        this.emit({
          type: 'streamer', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          maxLife: rand(22, 34), size: rand(2, 3.6), len: rand(26, 62),
          color: i % 2 ? color : '#ffffff', drag: 0.965,
        });
      }
      for (let i = 0; i < 14; i++) {
        this.emit({
          type: 'shard', x, y, vx: rand(-8, 8), vy: rand(-9, 4), maxLife: rand(30, 55),
          size: rand(3, 7), color: i % 2 ? '#ffffff' : color, grav: 0.28, drag: 0.985, vrot: rand(-0.3, 0.3),
        });
      }
    }
  }

  dust(x: number, y: number, dir = 0, n = 6, quality = 1) {
    for (let i = 0; i < n * quality; i++) {
      this.emit({
        type: 'dust', x: x + rand(-4, 4), y, vx: rand(-1.4, 1.4) - dir * rand(0.5, 2), vy: rand(-1.6, -0.3),
        maxLife: rand(14, 26), size: rand(2.5, 5.5), color: 'rgba(220,220,235,0.5)', grav: 0.03, drag: 0.9, additive: false,
      });
    }
  }

  dashTrail(x: number, y: number, vx: number, vy: number, color: string) {
    this.emit({ type: 'streak', x, y, vx: -vx * 0.12, vy: -vy * 0.12, maxLife: 14, size: 7, color, drag: 0.9 });
  }

  launchTrail(x: number, y: number, color: string) {
    this.emit({ type: 'streak', x, y, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), maxLife: 18, size: 8, color, drag: 0.92 });
    this.emit({ type: 'ember', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-1, 1), vy: rand(-1, 1), maxLife: 20, size: rand(1.5, 3), color, drag: 0.94 });
  }

  fire(x: number, y: number, n = 1, baseColor = '#ff8a3c') {
    for (let i = 0; i < n; i++) {
      this.emit({
        type: 'ember', x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-0.7, 0.7), vy: rand(-1.8, -0.4),
        maxLife: rand(16, 34), size: rand(2, 4.5), color: i % 3 === 0 ? '#ffd166' : baseColor, grav: -0.02, drag: 0.96,
      });
    }
  }

  smokePuff(x: number, y: number, n = 5) {
    for (let i = 0; i < n; i++) {
      this.emit({
        type: 'smoke', x: x + rand(-6, 6), y: y + rand(-4, 4), vx: rand(-0.5, 0.5), vy: rand(-1, -0.3),
        maxLife: rand(24, 46), size: rand(5, 11), color: 'rgba(200,200,215,0.3)', grav: -0.01, drag: 0.97, additive: false,
      });
    }
  }

  ambient(type: 'leaf' | 'snow' | 'firefly' | 'ember', x: number, y: number, color: string) {
    if (type === 'leaf') {
      this.emit({ type: 'leaf', x, y, vx: rand(-0.8, -0.1), vy: rand(0.3, 0.9), maxLife: 240, size: rand(3, 5), color, grav: 0, drag: 1, additive: false, wobble: rand(0.02, 0.06), vrot: rand(-0.04, 0.04) });
    } else if (type === 'snow') {
      this.emit({ type: 'snow', x, y, vx: rand(-0.6, 0.2), vy: rand(0.5, 1.4), maxLife: 300, size: rand(1.5, 3), color, grav: 0, drag: 1, additive: false, wobble: rand(0.01, 0.04) });
    } else if (type === 'firefly') {
      this.emit({ type: 'firefly', x, y, vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.2), maxLife: rand(120, 260), size: rand(1.5, 2.6), color, grav: 0, drag: 1, wobble: rand(0.02, 0.05) });
    } else {
      this.emit({ type: 'ember', x, y, vx: rand(-0.4, 0.4), vy: rand(-1.2, -0.4), maxLife: rand(60, 140), size: rand(1.5, 3), color, grav: 0, drag: 1 });
    }
  }

  update(dtFrames: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dtFrames;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.wobble > 0) p.vx += Math.sin(p.life * 0.2) * p.wobble;
      p.vy += p.grav;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dtFrames;
      p.y += p.vy * dtFrames;
      p.rot += p.vrot * dtFrames;
    }
  }

  render(ctx: CanvasRenderingContext2D, dtFrames: number) {
    // two passes: normal then additive
    ctx.save();
    for (const pass of [false, true]) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.pool) {
        if (!p.active || p.additive !== pass) continue;
        const t = p.life / p.maxLife;
        const alpha = t < 0.25 ? t / 0.25 : 1;
        ctx.globalAlpha = alpha;
        switch (p.type) {
          case 'spark': {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * t;
            ctx.beginPath();
            const vx = p.vx * 2.2, vy = p.vy * 2.2;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - vx, p.y - vy);
            ctx.stroke();
            break;
          }
          case 'flash': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1.4 - t * 0.4));
            g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * alpha).toFixed(3) + ')');
            g.addColorStop(0.4, p.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - t * 0.4), 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'ring': {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5 * t;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + (1 - t) * 46, 0, Math.PI * 2);
            ctx.stroke();
            break;
          }
          case 'boom': {
            // 4-point smash star
            const bs = p.size * (0.35 + t * 0.85);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const a = i * Math.PI / 2;
              ctx.lineTo(Math.cos(a) * bs, Math.sin(a) * bs);
              ctx.lineTo(Math.cos(a + Math.PI / 4) * bs * 0.24, Math.sin(a + Math.PI / 4) * bs * 0.24);
            }
            ctx.closePath();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha * 0.95;
            ctx.fill();
            ctx.restore();
            break;
          }
          case 'line': {
            // radial impact streak
            const sp2 = Math.hypot(p.vx, p.vy) || 1;
            const ux = p.vx / sp2, uy = p.vy / sp2;
            const L = p.len * (0.4 + t * 0.6);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * t;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - ux * L, p.y - uy * L);
            ctx.stroke();
            break;
          }
          case 'streamer': {
            const sp3 = Math.hypot(p.vx, p.vy) || 1;
            const ux3 = p.vx / sp3, uy3 = p.vy / sp3;
            const L3 = p.len * (0.5 + t * 0.5);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - ux3 * L3, p.y - uy3 * L3);
            ctx.stroke();
            break;
          }
          case 'slash': {
            // tapered crescent — bright hot leading edge fading to a thin tail
            const ts = 1 - p.life / p.maxLife;            // 0 → 1 over life
            const R = p.size * (0.66 + ts * 0.42);        // arc expands outward
            const dirS = p.vrot >= 0 ? 1 : -1;
            const span = p.len * (0.62 + ts * 0.5);
            const head = p.rot + (span / 2) * dirS;
            const tail = p.rot - (span / 2) * dirS;
            const thick = Math.max(2.6, p.size * 0.19);
            const fade = (1 - ts) * (1 - ts);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.lineCap = 'round';

            // ---- per-character slash geometry variants ----
            if (p.style === 'volt') {
              // jagged lightning polyline — re-jitters every frame (alive)
              const segs = 10;
              for (let pass = 0; pass < 2; pass++) {
                ctx.strokeStyle = pass === 0 ? p.color : '#ffffff';
                ctx.lineWidth = Math.max(1, (pass === 0 ? thick * 1.5 : thick * 0.6) * fade);
                ctx.globalAlpha = Math.min(1, fade * (pass === 0 ? 0.8 : 1));
                ctx.beginPath();
                for (let i = 0; i <= segs; i++) {
                  const f0 = i / segs;
                  const aa = tail + (head - tail) * f0;
                  const jitter = Math.sin(f0 * 21.7 + p.rot * 5 + p.life * 1.7) * R * 0.09
                    + Math.sin(f0 * 8.3 + p.life * 2.3) * R * 0.05;
                  const rr = R + jitter;
                  const X = Math.cos(aa) * rr, Y = Math.sin(aa) * rr;
                  if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
                }
                ctx.stroke();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'chain') {
              // segmented whip: link dots strung along the arc, shrinking toward the tail
              const segs = 9;
              for (let i = 0; i <= segs; i++) {
                const f0 = i / segs;
                const hN = dirS >= 0 ? f0 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const w = (thick * 0.55 + hN * thick * 0.9) * fade;
                ctx.globalAlpha = Math.min(1, fade * (0.35 + hN * 0.75));
                ctx.strokeStyle = hN > 0.75 ? '#ffffff' : p.color;
                ctx.lineWidth = Math.max(1, w);
                ctx.beginPath();
                ctx.arc(0, 0, R, aa - 0.09, aa + 0.09);
                ctx.stroke();
                if (i % 2 === 0 && hN > 0.3) {
                  ctx.fillStyle = hN > 0.8 ? '#ffffff' : p.color;
                  ctx.beginPath();
                  ctx.arc(Math.cos(aa) * R, Math.sin(aa) * R, Math.max(0.8, w * 0.42), 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.restore();
              break;
            }
            if (p.style === 'frost') {
              // crystal band + teeth on the outer edge
              const segs = 8;
              for (let pass = 0; pass < 2; pass++) {
                for (let i = 0; i < segs; i++) {
                  const f0 = i / segs, f1 = (i + 1) / segs;
                  const hN = dirS >= 0 ? f1 : 1 - f0;
                  const aa = tail + (head - tail) * f0;
                  const ab = tail + (head - tail) * f1;
                  const w = thick * (pass === 0 ? 2.4 : 1.05) * (0.3 + hN);
                  ctx.globalAlpha = Math.min(1, fade * (pass === 0 ? 0.6 : 1) * (0.35 + hN * 0.85));
                  ctx.strokeStyle = pass === 0 ? p.color : (hN > 0.75 ? '#ffffff' : p.color);
                  ctx.lineWidth = Math.max(1, w);
                  ctx.beginPath();
                  ctx.arc(0, 0, R, Math.min(aa, ab), Math.max(aa, ab));
                  ctx.stroke();
                }
              }
              // teeth: small crystal spikes sticking outward
              ctx.fillStyle = '#ffffff';
              for (let i = 0; i < 5; i++) {
                const f0 = 0.2 + i * 0.16;
                const hN = dirS >= 0 ? f0 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const tooth = thick * 1.5 * fade * (0.4 + hN);
                ctx.globalAlpha = fade * (0.4 + hN * 0.6);
                ctx.beginPath();
                ctx.moveTo(Math.cos(aa - 0.05) * R, Math.sin(aa - 0.05) * R);
                ctx.lineTo(Math.cos(aa) * (R + tooth), Math.sin(aa) * (R + tooth));
                ctx.lineTo(Math.cos(aa + 0.05) * R, Math.sin(aa + 0.05) * R);
                ctx.closePath();
                ctx.fill();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'void') {
              // dark scythe band: violet rim + inner white edge with a hollow gap
              const segs = 9;
              for (let i = 0; i < segs; i++) {
                const f0 = i / segs, f1 = (i + 1) / segs;
                const hN = dirS >= 0 ? f1 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const ab = tail + (head - tail) * f1;
                ctx.globalAlpha = Math.min(1, fade * (0.4 + hN * 0.7));
                // dark core band
                ctx.strokeStyle = 'rgba(20,10,40,0.9)';
                ctx.lineWidth = Math.max(2, thick * 2.6 * (0.3 + hN));
                ctx.beginPath(); ctx.arc(0, 0, R, Math.min(aa, ab), Math.max(aa, ab)); ctx.stroke();
                // violet rim outside + pale edge inside
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, thick * 0.7 * (0.3 + hN));
                ctx.beginPath(); ctx.arc(0, 0, R + thick * 1.5, Math.min(aa, ab), Math.max(aa, ab)); ctx.stroke();
                ctx.strokeStyle = 'rgba(235,225,255,0.9)';
                ctx.lineWidth = Math.max(0.8, thick * 0.4);
                ctx.beginPath(); ctx.arc(0, 0, R - thick * 1.3, Math.min(aa, ab), Math.max(aa, ab)); ctx.stroke();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'gale') {
              // concentric wind arcs (three rings, offset phases)
              for (let ring = 0; ring < 3; ring++) {
                const rr = R - ring * R * 0.16;
                const spanR = span * (1 - ring * 0.12);
                const h0 = p.rot + (spanR / 2) * dirS + ring * 0.2 * dirS;
                const t0 = p.rot - (spanR / 2) * dirS + ring * 0.2 * dirS;
                ctx.globalAlpha = Math.min(1, fade * (0.75 - ring * 0.22));
                ctx.strokeStyle = ring === 0 ? '#ffffff' : p.color;
                ctx.lineWidth = Math.max(1, thick * (1.4 - ring * 0.4) * fade);
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(2, rr), Math.min(t0, h0), Math.max(t0, h0));
                ctx.stroke();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'quake') {
              // chunky heavy band with a hard wedge head
              const segs = 6;
              for (let i = 0; i < segs; i++) {
                const f0 = i / segs, f1 = (i + 1) / segs;
                const hN = dirS >= 0 ? f1 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const ab = tail + (head - tail) * f1;
                const w = thick * 2.6 * (0.4 + hN * 1.3) * fade;
                ctx.globalAlpha = Math.min(1, fade * (0.5 + hN * 0.6));
                ctx.strokeStyle = hN > 0.8 ? '#ffffff' : p.color;
                ctx.lineWidth = Math.max(1.5, w);
                ctx.beginPath();
                ctx.arc(0, 0, R, Math.min(aa, ab), Math.max(aa, ab));
                ctx.stroke();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'light') {
              // radiant band + diverging holy rays
              const segs = 8;
              for (let i = 0; i < segs; i++) {
                const f0 = i / segs, f1 = (i + 1) / segs;
                const hN = dirS >= 0 ? f1 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const ab = tail + (head - tail) * f1;
                const w = thick * (0.34 + hN * 1.1) * fade;
                ctx.globalAlpha = Math.min(1, fade * (0.4 + hN * 0.8));
                ctx.strokeStyle = hN > 0.7 ? '#ffffff' : p.color;
                ctx.lineWidth = Math.max(1, w);
                ctx.beginPath();
                ctx.arc(0, 0, R, Math.min(aa, ab), Math.max(aa, ab));
                ctx.stroke();
              }
              for (let i = 0; i < 4; i++) {
                const aa = tail + (head - tail) * (0.15 + i * 0.24);
                const ray = R * (0.5 + fade * 0.5);
                ctx.globalAlpha = fade * 0.5;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(aa) * R * 0.4, Math.sin(aa) * R * 0.4);
                ctx.lineTo(Math.cos(aa) * (R + ray * 0.35), Math.sin(aa) * (R + ray * 0.35));
                ctx.stroke();
              }
              ctx.restore();
              break;
            }
            if (p.style === 'flame') {
              // fire fan: main band with flickering outer wisps
              const segs = 8;
              for (let pass = 0; pass < 2; pass++) {
                for (let i = 0; i < segs; i++) {
                  const f0 = i / segs, f1 = (i + 1) / segs;
                  const hN = dirS >= 0 ? f1 : 1 - f0;
                  const aa = tail + (head - tail) * f0;
                  const ab = tail + (head - tail) * f1;
                  const flick = Math.sin(f0 * 13 + p.life * 0.9) * thick * 0.5;
                  const w = (thick * (pass === 0 ? 2.6 : 1.1) + Math.max(0, flick)) * (0.3 + hN) * fade;
                  ctx.globalAlpha = Math.min(1, fade * (pass === 0 ? 0.6 : 1) * (0.35 + hN * 0.8));
                  ctx.strokeStyle = pass === 0 ? p.color : (hN > 0.7 ? '#fff3c0' : p.color);
                  ctx.lineWidth = Math.max(1, w);
                  ctx.beginPath();
                  ctx.arc(0, 0, R + (pass === 0 ? flick * 0.6 : 0), Math.min(aa, ab), Math.max(aa, ab));
                  ctx.stroke();
                }
              }
              ctx.restore();
              break;
            }
            // default + 'rift': crisp tapered crescent (rift renders thinner twin bands)
            const segs = 8;
            const riftTw = p.style === 'rift' ? 0.72 : 1;
            for (let pass = 0; pass < 2; pass++) {
              for (let i = 0; i < segs; i++) {
                const f0 = i / segs, f1 = (i + 1) / segs;
                // headness: 1 at the leading edge (bright white), 0 at the tail
                const hN = dirS >= 0 ? f1 : 1 - f0;
                const aa = tail + (head - tail) * f0;
                const ab = tail + (head - tail) * f1;
                const w = thick * riftTw * (pass === 0 ? 2.8 : 1.15) * (0.24 + hN * 1.05);
                ctx.globalAlpha = Math.min(1, fade * (pass === 0 ? 0.62 : 1) * (0.3 + hN * 0.85));
                ctx.strokeStyle = pass === 0 ? p.color : (hN > 0.72 ? '#ffffff' : p.color);
                ctx.lineWidth = Math.max(1, w);
                ctx.beginPath();
                ctx.arc(0, 0, R, Math.min(aa, ab), Math.max(aa, ab));
                ctx.stroke();
              }
            }
            ctx.restore();
            break;
          }
          case 'num': {
            // damage number pop
            const pop = t > 0.8 ? 1 + (t - 0.8) * 2.2 : 1;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(pop, pop);
            ctx.font = `900 ${p.size}px "Arial Black", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(10,8,20,0.85)';
            ctx.strokeText(p.label, 0, 0);
            ctx.fillStyle = p.color;
            ctx.fillText(p.label, 0, 0);
            ctx.restore();
            break;
          }
          case 'streak': {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size * t + 2, p.size * 0.55 * t, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'star': {
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot + p.life * 0.15);
            const s = p.size * (0.5 + t * 0.5);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const a = i * Math.PI / 2;
              ctx.lineTo(Math.cos(a) * s * 2, Math.sin(a) * s * 2);
              ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.6, Math.sin(a + Math.PI / 4) * s * 0.6);
            }
            ctx.closePath(); ctx.fill();
            ctx.restore();
            break;
          }
          case 'shard': case 'icicle_frag': {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot + (p.type === 'icicle_frag' ? p.life * 0.12 : 0));
            ctx.fillStyle = p.color;
            ctx.beginPath();
            if (p.type === 'icicle_frag') {
              ctx.moveTo(0, -p.size * 1.5); ctx.lineTo(p.size * 0.55, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.55, 0);
            } else {
              ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.6); ctx.lineTo(p.size, 0); ctx.lineTo(0, p.size * 0.6);
            }
            ctx.closePath(); ctx.fill();
            ctx.restore();
            break;
          }
          case 'ember': {
            const s = p.size * (0.4 + t * 0.6);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'dust': case 'smoke': {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - t * 0.6), 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'leaf': {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.sin(p.life * 0.08) * 0.8);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha * Math.min(1, t * 3);
            ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            break;
          }
          case 'snow': {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha * Math.min(1, t * 3);
            ctx.beginPath(); ctx.arc(p.x + Math.sin(p.life * 0.05) * 6, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'firefly': {
            const pulse = 0.5 + Math.sin(p.life * 0.25) * 0.5;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha * pulse;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = alpha * pulse * 0.3;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'glow': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            g.addColorStop(0, p.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            break;
          }
          default: {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export const fx = {
  rand, randInt, pick,
};
