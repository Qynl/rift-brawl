// ============ RIFT BRAWL — Constants & Math Utilities ============

// Fixed timestep
export const STEP = 1 / 60;
export const STEP_MS = 1000 / 60;

// Physics tuning (per-frame values at 60fps)
export const PHYS = {
  gravity: 0.52,
  fallCap: 10.5,
  fastFallMul: 1.6,
  airDragX: 0.012,        // fraction of vx lost per frame while airborne
  launchDragX: 0.018,     // extra drag while in hitstun launch
  groundStick: 6.0,       // max snap distance to platform when walking
  coyoteFrames: 5,
  jumpBufferFrames: 5,
  respawnInvuln: 110,
  respawnPlatformTime: 100,
  maxFallDist: 0,
};

// Hitfeel
export const HITSTOP_BASE = 5;
export const HITSTOP_PER_PCT = 0.22;
export const HITSTOP_MAX = 16;

// Knockback constants
export const KB_WEIGHT_REF = 100;   // weight where modifier = 1
export const KB_MAX = 34;

// Blast-zone KO padding handled per stage.

// Camera
export const CAM_MIN_ZOOM = 0.8;
export const CAM_MAX_ZOOM = 1.4;
export const CAM_BASE_VIEW_W = 1180; // design width at zoom 1

// ---------- math utils ----------

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function rand(a = 1, b?: number): number {
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}
export function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}
export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(p: number): boolean { return Math.random() < p; }

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
}
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleToDeg(dx: number, dy: number): number {
  let a = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

export const degToRad = (d: number) => d * Math.PI / 180;

export function fmtTime(frames: number): string {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// tiny seeded RNG for deterministic stage previews
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
