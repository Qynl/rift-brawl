// ============ RIFT BRAWL — Core Type Definitions ============

export interface Vec2 { x: number; y: number }

export type ActionName =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'attack' | 'special' | 'grab'
  | 'shield' | 'dodge' | 'dash';

export const ALL_ACTIONS: ActionName[] = [
  'left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'grab', 'shield', 'dodge', 'dash',
];

export interface InputState {
  held: Record<ActionName, boolean>;
  pressed: Record<ActionName, boolean>;   // true only on the step the button went down
  released: Record<ActionName, boolean>;
  axisX: number; // -1..1
  axisY: number;
}

export function emptyInput(): InputState {
  return {
    held: { left: false, right: false, up: false, down: false, jump: false, attack: false, special: false, grab: false, shield: false, dodge: false, dash: false },
    pressed: { left: false, right: false, up: false, down: false, jump: false, attack: false, special: false, grab: false, shield: false, dodge: false, dash: false },
    released: { left: false, right: false, up: false, down: false, jump: false, attack: false, special: false, grab: false, shield: false, dodge: false, dash: false },
    axisX: 0, axisY: 0,
  };
}

// ---------- Fighters ----------

export type FighterId = 'vanguard' | 'ember' | 'hook' | 'titan' | 'nova' | 'volt' | 'frost' | 'wraith' | 'seraph' | 'viper' | 'tempest' | 'jaeger';

export type FighterState =
  | 'idle' | 'walk' | 'crouch' | 'dash' | 'jumpsquat' | 'air' | 'land'
  | 'attack' | 'hitstun' | 'launch' | 'shield' | 'shieldstun' | 'shieldbreak'
  | 'dodge' | 'grabbing' | 'grabbed' | 'thrown' | 'respawn' | 'ko' | 'dizzy' | 'taunt' | 'victory'
  | 'ledge';   // hanging from a stage edge (invulnerable, with getup/roll/jump/drop options)

export interface HitboxDef {
  x: number; y: number; r: number;
  dmg?: number; angle?: number; bkb?: number; kbg?: number;
  hitstun?: number;
}

export interface ProjectileDef {
  kind: 'fireball' | 'boomerang' | 'wave' | 'shockwave' | 'hookshot' | 'flare' | 'star' | 'bolt' | 'icicle' | 'shadoworb' | 'beam' | 'dart' | 'gust' | 'arrow' | 'net' | 'scatter';
  speed: number; vy?: number; gravity?: number;
  life: number; r: number;
  dmg: number; angle: number; bkb: number; kbg: number;
  hits?: number;          // boomerang multi-hit
  returns?: boolean;      // boomerang comes back
  groundHug?: boolean;    // shockwave rides platform tops
  pull?: boolean;         // gravity well: drags fighters toward it, re-hits
  venom?: boolean;        // applies poison stacks on hit
  root?: boolean;         // roots the victim in place for a long hitstun (nets)
  pellets?: number;       // scatter volley: number of pellets spawned
  color: string;
  sfx: string;
}

export interface MobilityImpulse { frame: number; vx?: number; vy?: number }

/**
 * Weapon motion spec — makes every fighter's attacks move & feel like their actual weapon.
 * Drives (1) dynamic hitbox paths, (2) character animation, (3) per-motion swing FX.
 */
export interface MotionDef {
  kind:
    | 'slash'     // classic sword arc — hitbox sweeps along the swing path
    | 'thrust'    // spear/stab — hitbox extends outward from body (extend [near, far])
    | 'smash'     // heavy overhead/hammer — big slow arc, heavy FX on connect
    | 'spin'      // full-body orbit — hitbox circles the fighter (turns)
    | 'flurry'    // rapid multi-hit pokes (rehit)
    | 'cross'     // dual weapons X slash — two mirrored crescents
    | 'punch'     // fist straight shot
    | 'kick'      // leg roundhouse/kick arcs
    | 'sweep';    // low crouching leg/blade sweep
  /** hitbox arc over active frames, degrees (0 = forward, 90 = up, 180 = behind, 270 = down) */
  sweep?: [number, number];
  /** hitbox distance multiplier over active frames — thrust extension (start → end) */
  extend?: [number, number];
  /** clear victims every N frames during active windows (multi-hit flurry/spin) */
  rehit?: number;
  /** full rotations for 'spin' kind */
  turns?: number;
  /** visual: arm windup angle in radians (pose space, + = forward/behind per convention) */
  windup?: number;
  /** visual: strike end angle in radians */
  strike?: number;
  /** slash FX scale multiplier */
  fxScale?: number;
}

export interface MoveData {
  id: string;
  name: string;
  kind: 'ground' | 'air' | 'special' | 'grab' | 'throw' | 'dashattack' | 'getup';
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  angle: number;       // degrees, 0 = forward, 90 = straight up, 270 = spike
  bkb: number;         // base knockback (launch speed)
  kbg: number;         // knockback growth per 100% damage
  hitboxes?: HitboxDef[];
  hitstunMul?: number;
  shieldstun?: number;
  shieldDmg?: number;
  mobility?: MobilityImpulse[];   // velocity impulses during the move
  gravityMul?: number;
  landLag?: number;
  projectile?: ProjectileDef;
  projFrame?: number;                // frame (from move start) to spawn projectile
  chargeable?: { minF: number; maxF: number; dmgMul: number; kbMul: number };
  armor?: boolean;                   // super-armor during startup+active
  counter?: { frames: number };      // counter stance during startup
  behavior?: string;                 // custom fighter-specific behavior hook
  fxColor?: string;
  sfx: string;
  hitSfx?: string;
  selfHit?: boolean;                 // behavior moves hit both (explosions etc.)
  strong?: boolean;                  // heavy hit feel flag
  venom?: boolean;                   // applies poison stacks (VIPER)
  sweetspot?: { frames: number; dmgMul: number; kbMul: number };  // early active frames hit harder
  chainTo?: string;                  // move id this cancels into near the end (jab chains)
  chainWindow?: number;              // frames before move end during which the chain can start
  motion?: MotionDef;                // weapon-motion spec: dynamic hitbox path + pose + FX identity
}

export interface ThrowData {
  dmg: number; angle: number; bkb: number; kbg: number; sfx: string;
}

/** Signature weapon every brawler carries — visually drawn AND extends melee hitboxes. */
export interface WeaponDef {
  name: string;
  kind: 'saber' | 'falchion' | 'sickle' | 'maul' | 'staff' | 'tonfa' | 'glacier' | 'scythe' | 'lance' | 'kama' | 'fan' | 'crossbow';
  /** visual length in local units (draw scale) */
  len: number;
  /** extra world-px push on melee hitbox offsets (forward) */
  reach: number;
  /** blade/head color */
  color: string;
  /** energy glow color */
  glow: string;
  /** per-character swing/hit FX language — every brawler's attacks LOOK different */
  fxStyle: string;
}

export interface FighterStats {
  weight: number;
  groundSpeed: number;
  groundAccel: number;
  friction: number;
  airSpeed: number;
  airAccel: number;
  jumpVel: number;
  airJumpVel: number;
  tripleJumpVel: number;
  gravity: number;
  fallCap: number;
  fastFallCap: number;
  dashSpeed: number;
  dashFrames: number;
  dashCooldown: number;
  airDodgeSpeed: number;
  scale: number;
  shieldHp: number;
}

export interface CharacterInfo {
  id: FighterId;
  name: string;
  archetype: string;
  difficulty: 1 | 2 | 3;
  desc: string;
  stats: { speed: number; power: number; weight: number; range: number; recovery: number }; // 1..5
  colors: { primary: string; secondary: string; accent: string; glow: string };
}

// ---------- Stages ----------

export type PlatformType = 'solid' | 'pass' | 'ice' | 'breakable' | 'wrap';

export interface PlatformDef {
  x: number; y: number; w: number; h: number;
  type: PlatformType;
  move?: { bx: number; by: number; period: number; phase?: number }; // moves from (x,y) to (bx,by) and back
}

export interface BlastZones { left: number; right: number; top: number; bottom: number }

export interface SpawnPoint { x: number; y: number }

// ---------- AI ----------

export type AIPersonality = 'rusher' | 'defender' | 'zoner' | 'trickster' | 'grappler' | 'balanced';
export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export type TrainingDummy = 'stand' | 'jump' | 'attack' | 'shield' | 'cpu' | 'walkoff';

// ---------- Match (N-player, 2..4) ----------

export type PlayerKind = 'local' | 'ai' | 'remote';

export interface PlayerSetup {
  char: FighterId;
  label: string;
  kind: PlayerKind;
  personality?: AIPersonality;
  difficulty?: AIDifficulty;
  stocks?: number;          // overrides match default
  netSlot?: number;         // lobby slot for remote players (host mode)
}

export interface MatchConfig {
  players: PlayerSetup[];   // 2..4 fighters
  stocks: number;
  /** match clock in seconds; 0 or undefined = no limit */
  timeLimit?: number;
  stageId: string;
  training?: { dummy: TrainingDummy };
  modifiers?: Partial<ChallengeModifiers>;
}

export interface ChallengeModifiers {
  lowGravity: boolean;
  giant: boolean;
  tinyArena: boolean;
  oneHitKO: boolean;
  highKnockback: boolean;
  infiniteSpecials: boolean;
  movingPlatforms: boolean;
  chaosHazards: boolean;
}

export interface MatchResult {
  winner: number;           // player index or -1 = draw/quit
  chars: FighterId[];
  labels: string[];
  stocksLeft: number[];
  damageDealt: number[];
  kos: number[];
  bestCombo: number[];
  techs: number[];          // successful techs per player (R11)
  durationFrames: number;
  /** true when the clock ran out rather than a fighter losing every stock */
  timeout?: boolean;
}

export interface GameSettings {
  masterVol: number;   // 0..1
  musicVol: number;
  sfxVol: number;
  screenShake: number; // 0..1.5
  particles: 'low' | 'medium' | 'high';
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  reduceFlashing: boolean;
  // ---- accessibility ----
  /** kills camera shake, zoom punch, speed lines and the KO freeze */
  reduceMotion: boolean;
  /** 0.8 … 1.4 multiplier on the in-match HUD */
  hudScale: number;
  /**
   * Draws a distinct SHAPE over each fighter (triangle / square / circle /
   * diamond). Colour alone cannot separate four players for a colour-blind
   * viewer; shape can.
   */
  playerMarkers: boolean;
  keybinds: {
    p1: Partial<Record<ActionName, KeyBindValue>>;
    p2: Partial<Record<ActionName, KeyBindValue>>;
  };
}

/** One action may be bound to a single key or several keys (e.g. dash = Q or E). */
export type KeyBindValue = string | string[];

export interface ProfileData {
  matches: number; wins: number; losses: number; kos: number; falls: number;
  damageDealt: number;
  mastery: Record<FighterId, { games: number; wins: number; kos: number }>;
  challenges: string[]; // completed challenge ids
  arcadeBest: number;   // opponents defeated in one run
  survivalBest: number; // waves survived
  favorite: FighterId | null;
}
