// ============ RIFT BRAWL — Base Stage & Collision ============

import { PlatformDef, PlatformType, BlastZones, SpawnPoint, ChallengeModifiers } from '../core/types';
import { clamp, rand } from '../core/constants';
import { ParticleSystem } from '../effects/Particles';

export interface BodyLike {
  x: number; y: number;     // center
  px?: number; py?: number; // previous center (render interpolation)
  vx: number; vy: number;
  w: number; h: number;     // full box
  grounded: boolean;
  standingOn: Platform | null;
  dropThrough: number;      // timer frames
  onIce: boolean;
  landVel: number;          // set when landing (vy at impact)
  justLanded: boolean;
  stunned?: boolean;        // dizzy etc, used by hazards
  portalCooldown?: number;  // hazard i-frames (Rift portals / lava)
}

export interface Platform extends PlatformDef {
  cx: number; cy: number;         // current pos
  prevX: number; prevY: number;
  broken: number;                 // >0 = broken timer
  cracks: number;                 // damage state 0..2
  id: number;
}

export interface WindZone { x0: number; x1: number; y0: number; y1: number; force: number; cycle: number; period: number; warn: number }
export interface PortalPair { ax: number; ay: number; bx: number; by: number; r: number }

export interface HazardState {
  kind: 'lava' | 'none';
  phase: 'idle' | 'warn' | 'rise' | 'high' | 'fall';
  timer: number;
  level: number; // 0..1 extra intensity (chaos)
  currentY: number;
  baseY: number;
  highY: number;
}

export interface StageHooks {
  init?(s: Stage): void;
  update?(s: Stage, fighters: BodyLike[], particles: ParticleSystem, mods: ChallengeModifiers): void;
  drawBg?(ctx: CanvasRenderingContext2D, s: Stage, tick: number, camX: number, camY: number, quality: string): void;
  drawPlatform?(ctx: CanvasRenderingContext2D, s: Stage, p: Platform, tick: number): void;
  drawFg?(ctx: CanvasRenderingContext2D, s: Stage, tick: number, camX: number, camY: number): void;
  onFighterUpdate?(s: Stage, f: BodyLike, tick: number, mods: ChallengeModifiers): void;
}

let platformIdCounter = 1;

export class Stage {
  id: string;
  name: string;
  desc: string;
  hazardLabel: string | null;
  platforms: Platform[] = [];
  blast: BlastZones;
  spawns: SpawnPoint[];
  camBounds: { minX: number; maxX: number; minY: number; maxY: number };
  tick = 0;
  hooks: StageHooks;
  windZones: WindZone[] = [];
  portals: PortalPair[] = [];
  hazard: HazardState = { kind: 'none', phase: 'idle', timer: 0, level: 1, currentY: 0, baseY: 0, highY: 0 };
  wind: { phase: 'idle' | 'warn' | 'active'; dir: 1 | -1; timer: number } = { phase: 'idle', dir: 1, timer: 0 };
  quality = 'high';

  constructor(data: {
    id: string; name: string; desc: string; hazardLabel?: string | null;
    platforms: PlatformDef[]; blast: BlastZones; spawns: SpawnPoint[];
    camBounds: { minX: number; maxX: number; minY: number; maxY: number };
    hooks?: StageHooks;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.desc = data.desc;
    this.hazardLabel = data.hazardLabel ?? null;
    this.blast = data.blast;
    this.spawns = data.spawns;
    this.camBounds = data.camBounds;
    this.hooks = data.hooks ?? {};
    this.setPlatforms(data.platforms);
    this.hooks.init?.(this);
  }

  setPlatforms(defs: PlatformDef[]) {
    this.platforms = defs.map((d, i) => ({
      ...d, cx: d.x, cy: d.y, prevX: d.x, prevY: d.y, broken: 0, cracks: 0, id: i + 1,
    }));
  }

  reset() {
    this.tick = 0;
    for (const p of this.platforms) { p.cx = p.x; p.cy = p.y; p.broken = 0; p.cracks = 0; }
    this.windZones = [];
    this.portals = [];
    this.wind = { phase: 'idle', dir: 1, timer: 0 };
    this.hazard = { kind: 'none', phase: 'idle', timer: 0, level: this.hazard.level, currentY: 0, baseY: 0, highY: 0 };
    this.hooks.init?.(this);
  }

  update(fighters: BodyLike[], particles: ParticleSystem, mods: ChallengeModifiers) {
    this.tick++;
    // moving platforms
    const forceMove = mods.movingPlatforms;
    for (const p of this.platforms) {
      p.prevX = p.cx; p.prevY = p.cy;
      if (p.move || forceMove) {
        const m = p.move ?? { bx: p.x, by: p.y - 70, period: 240, phase: 0 };
        const per = forceMove && !p.move ? m.period / 2 : m.period;
        const ph = (m.phase ?? 0);
        const t = ((this.tick + ph) % per) / per;
        const s = 0.5 - Math.cos(t * Math.PI * 2) * 0.5; // 0..1..0
        p.cx = p.x + (m.bx - p.x) * s;
        p.cy = p.y + (m.by - p.y) * s;
      }
      if (p.broken > 0) p.broken--;
    }
    this.hooks.update?.(this, fighters, particles, mods);
    // ambient tick handled by hooks
    void this;
  }

  frictionAt(x: number, y: number): number {
    // 1 = normal; 0.35 = slippery (ice)
    const f = this.standingPlatformAt(x, y);
    if (f && (f.type === 'ice' || this.id === 'frozen')) return 0.3;
    return 1;
  }

  standingPlatformAt(x: number, y: number): Platform | null {
    for (const p of this.platforms) {
      if (p.broken > 0) continue;
      if (x >= p.cx - 2 && x <= p.cx + p.w + 2 && Math.abs(y - p.cy) < 6) return p;
    }
    return null;
  }

  /** Resolve an entity against platforms. Mutates entity. */
  collide(e: BodyLike) {
    e.justLanded = false;
    const hw = e.w / 2, hh = e.h / 2;
    const prevBottom = e.y + hh - e.vy; // approx previous bottom
    e.grounded = false;
    e.standingOn = null;
    e.onIce = false;

    for (const p of this.platforms) {
      if (p.broken > 0) continue;
      const top = p.cy, bot = p.cy + p.h, left = p.cx, right = p.cx + p.w;
      const bottom = e.y + hh;
      const overlapX = e.x + hw > left + 1 && e.x - hw < right - 1;

      if (p.type === 'solid') {
        // full AABB resolve
        if (e.x + hw > left && e.x - hw < right && e.y + hh > top && e.y - hh < bot) {
          // push out along smallest axis
          const pushUp = bottom - top;
          const pushDown = bot - (e.y - hh);
          const pushLeft = (e.x + hw) - left;
          const pushRight = right - (e.x - hw);
          const m = Math.min(pushUp, pushDown, pushLeft, pushRight);
          if (m === pushUp && e.vy >= 0) {
            e.y = top - hh;
            if (e.vy > 0) { e.landVel = e.vy; e.justLanded = e.vy > 1; }
            e.vy = 0;
            e.grounded = true; e.standingOn = p;
            e.onIce = false;
          } else if (m === pushDown && e.vy < 0) {
            e.y = bot + hh; e.vy = 0;
          } else if (m === pushLeft) {
            e.x = left - hw; if (e.vx > 0) e.vx = 0;
          } else {
            e.x = right + hw; if (e.vx < 0) e.vx = 0;
          }
        }
      } else {
        // pass-through / ice / breakable: land from above only
        const wasAbove = prevBottom <= top + 8 || (bottom - e.vy) <= top + 8;
        if (overlapX && e.vy >= 0 && bottom >= top && bottom <= top + Math.max(14, e.vy + 8) && wasAbove) {
          if (e.dropThrough > 0) continue;
          e.y = top - hh;
          e.landVel = e.vy;
          e.justLanded = e.vy > 1;
          e.vy = 0;
          e.grounded = true; e.standingOn = p;
          e.onIce = p.type === 'ice' || this.id === 'frozen';
          if (p.type === 'breakable' && e.landVel > 5.5) {
            p.cracks++;
            if (p.cracks >= 2) { p.broken = 300; p.cracks = 0; }
          }
        }
      }
    }

    // carry with moving platform
    if (e.standingOn) {
      e.x += e.standingOn.cx - e.standingOn.prevX;
      e.y += e.standingOn.cy - e.standingOn.prevY;
    }
  }

  /** True if position is outside blast zones */
  outOfBlast(x: number, y: number): 'side' | 'bottom' | 'top' | null {
    if (x < this.blast.left || x > this.blast.right) return 'side';
    if (y > this.blast.bottom) return 'bottom';
    if (y < this.blast.top) return 'top';
    return null;
  }
}
