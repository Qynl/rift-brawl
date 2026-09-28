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

// ============================================================================
//  COMBAT MODEL  (v5)
// ----------------------------------------------------------------------------
//  Single source of truth for knockback / hitstun / shieldstun. The offline
//  frame-data solver in tools/sim imports these exact functions, so the design
//  numbers in docs can never drift away from what the game actually does.
//
//  Previous model launched the victim clear of the attacker on 77% of moves at
//  0% damage, which made combos mathematically impossible. This one follows the
//  platform-fighter standard: knockback scales hard with accumulated damage,
//  hitstun is a fixed fraction of knockback, and only genuinely strong hits
//  push the victim into the un-actionable tumble state.
// ============================================================================

export const KB = {
  /** growth from the victim's accumulated damage */
  pctTerm: 0.3,
  /** growth from the damage of this specific hit (interaction term) */
  interact: 0.045,
  /** flat floor so weak pokes still move people */
  flat: 9.5,
  /** global output scalar */
  scale: 0.52,
  /** hard ceiling so nothing one-shots from 0 */
  max: KB_MAX,
  /** frames of hitstun per unit of knockback */
  hitstunPerKb: 1.5,
  /** extra hitstun from raw damage */
  hitstunPerDmg: 0.6,
  hitstunMin: 8,
  hitstunMax: 60,
  /** above this knockback the victim tumbles (helpless, no combo follow-up) */
  tumbleThreshold: 15.5,
  /** shieldstun = dmg * mul + flat  (tuned so ~15% of moves are safe on shield) */
  shieldstunMul: 0.82,
  shieldstunFlat: 4,
  /** rage: damaged fighters hit harder */
  rageStart: 60,
  rageMax: 0.18,
};

/**
 * Platform-fighter knockback curve.
 * @param pctAfter victim's damage AFTER the hit is applied
 * @param dmg      damage of this hit
 * @param bkb      base knockback
 * @param kbg      knockback growth
 * @param weight   victim weight (100 = reference)
 */
export function knockbackOf(pctAfter: number, dmg: number, bkb: number, kbg: number, weight: number): number {
  const weightMod = 200 / (weight + 100);
  const growth = (pctAfter * KB.pctTerm + pctAfter * dmg * KB.interact * 0.01) * (kbg / 100);
  const kb = (growth + KB.flat * (bkb / 14)) * weightMod * KB.scale * (1 + kbg / 260);
  return Math.min(kb, KB.max);
}

/** Hitstun frames for a given knockback + damage. */
export function hitstunOf(kb: number, dmg: number): number {
  return Math.round(clamp(kb * KB.hitstunPerKb + dmg * KB.hitstunPerDmg, KB.hitstunMin, KB.hitstunMax));
}

/** Frames the defender is locked in shieldstun. */
export function shieldstunOf(dmg: number, override?: number): number {
  if (override !== undefined) return override;
  return Math.round(dmg * KB.shieldstunMul + KB.shieldstunFlat);
}

/** Does this knockback put the victim into un-actionable tumble? */
export function tumbles(kb: number): boolean {
  return kb > KB.tumbleThreshold;
}

// ---------- shield ----------
export const SHIELD = {
  /** drain per frame while held */
  drain: 0.34,
  /** regen per frame while not shielding */
  regen: 0.22,
  /** damage multiplier taken by the shield on contact */
  dmgMul: 1.15,
  /** frames of lag when dropping shield */
  dropLag: 7,
  /** perfect-shield (parry) window in frames after raising */
  parryWindow: 5,
  /** frames the parried attacker is frozen — this is the punish window */
  parryFreeze: 18,
  /** frames of stagger on shield break */
  breakStun: 90,
  /** fraction of the shield restored after a break */
  breakRefill: 0.3,
};

// ---------- defensive tech ----------
export const TECH = {
  /** frames a tech input stays armed */
  window: 20,
  /** lockout after a failed tech input */
  lockout: 40,
  /** invulnerability granted by a successful tech */
  invuln: 18,
  /** roll distance of a directional tech */
  rollSpeed: 7.2,
};

// ---------- directional influence ----------
export const DI = {
  /** max angle change in degrees */
  maxAngle: 18,
  /** smash DI: per-input positional nudge during hitlag */
  sdiStep: 3.4,
  sdiMax: 5,
};

// ---------- match rules ----------
export const MATCH = {
  /** default clock in seconds; 0 disables */
  defaultTime: 180,
  /** sudden-death starting damage */
  suddenDeathDamage: 150,
};

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
