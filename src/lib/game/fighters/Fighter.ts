// ============ RIFT BRAWL — Fighter Base Class ============
// Full platform-fighter physics + state machine. Data-driven moves per character.

import {
  ChallengeModifiers, FighterId, FighterState, FighterStats, HitboxDef, InputState,
  MoveData, ThrowData, emptyInput,
} from '../core/types';
import { WeaponDef } from '../core/types';
import {
  clamp, HITSTOP_BASE, HITSTOP_PER_PCT, HITSTOP_MAX, PHYS, rand,
  KB, SHIELD, TECH, DI, knockbackOf, hitstunOf, tumbles,
} from '../core/constants';
import { TraitSpec, TraitRuntime, newTraitRuntime, traitFor, HitContext } from './traits';
import { Stage } from '../stages/Stage';
import { ParticleSystem } from '../effects/Particles';
import { AudioManager } from '../audio/AudioManager';
import { CharacterInfo } from '../core/types';
import type { NetFighterState } from '../net/protocol';
import { swingFXSpec } from './combat';

const FIGHTER_STATES: FighterState[] = ['idle', 'walk', 'crouch', 'dash', 'jumpsquat', 'air', 'land', 'attack', 'hitstun', 'launch', 'shield', 'shieldstun', 'shieldbreak', 'dodge', 'grabbing', 'grabbed', 'thrown', 'respawn', 'ko', 'dizzy', 'taunt', 'victory', 'ledge'];

export interface World {
  tick: number;
  gravity: number;
  stage: Stage;
  particles: ParticleSystem;
  audio: AudioManager;
  mods: ChallengeModifiers;
  fighters: Fighter[];
  shake(a: number): void;
  flash(a: number, color?: string): void;
  punchZoom(a: number): void;
  emitSfx(s: string): void;
  spawnProjectile(f: Fighter, move: MoveData, dir: number): void;
  spawnTrap(f: Fighter): void;
  spawnVoidSpikes(f: Fighter): void;
  spawnVenomCloud(x: number, y: number, owner: Fighter): void;
  spawnLightWard(f: Fighter): void;
  spawnBearTrap(f: Fighter): void;
  onSwing?(f: Fighter, m: MoveData): void;
  onHitConnect(attacker: Fighter, victim: Fighter, info: HitInfo): void;
  onCounterSuccess(f: Fighter): void;
  onShieldBreak(f: Fighter): void;
}

export interface HitInfo {
  dmg: number; angle: number; launchSpeed: number; x: number; y: number;
  strong: boolean; move: MoveData | null; hitstun: number; weightMod: number;
}

export interface ActiveHitbox {
  x: number; y: number; r: number;
  /** previous active-frame position — enables swept capsule collision (no tunneling) */
  px: number; py: number;
  dmg: number; angle: number; bkb: number; kbg: number;
  hitstunMul: number; grab: boolean; strong: boolean; sweetspot: boolean; venom: boolean; move: MoveData; hitId: number;
}

// ---------- GLOBAL COMBAT FEEL TUNING (R12) ----------
/** melee active windows get this many extra frames (recovery pays for it — total unchanged) */
export const ACTIVE_LENIENCY = 2;
/** true for moves whose hitboxes are real attacks (grabs/throws excluded) */
export function meleeMove(m: MoveData): boolean {
  return !!m.hitboxes && m.kind !== 'grab' && m.kind !== 'throw';
}
/** effective active window of a move (melee gets the leniency bonus) */
export function moveActive(m: MoveData): number {
  return meleeMove(m) ? m.active + ACTIVE_LENIENCY : m.active;
}
/** effective total duration (active extended, recovery shortened — same pace, bigger windows) */
export function moveTotal(m: MoveData): number {
  return m.startup + moveActive(m)
    + (meleeMove(m) ? Math.max(2, m.recovery - ACTIVE_LENIENCY) : m.recovery);
}
/** global melee hitbox size multiplier — attacks connect when they visually should */
export const HITBOX_BOOST = 1.3;
/** weapon reach share that widens the hitbox radius — weapons really extend reach */
export const WEAPON_REACH_RADIUS = 2.0;
/** weapon reach share that pushes the hitbox CENTER outward — total reach must match the
 *  visual weapon tip (a 38px saber + arm reaches ~65px; hitboxes used to stop at ~45px,
 *  which made swings visually pass through the foe without connecting) */
export const WEAPON_REACH_OFFSET = 2.2;
/** distance from a point to a segment — capsule collision helper */
export function segDist(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

export interface FighterConfig {
  info: CharacterInfo;
  stats: FighterStats;
  weapon: WeaponDef;
  moves: Record<string, MoveData>;
  throws: { f: ThrowData; b: ThrowData; u: ThrowData; d: ThrowData };
}

let MOVE_INSTANCE = 1;

// Synthesized wave moves spawned by Titan behaviors (not part of his move list)
export const TITAN_QUAKE_WAVE: MoveData = {
  id: 'quake_wave', name: 'Quake Wave', kind: 'special', startup: 0, active: 1, recovery: 0,
  damage: 6.5, angle: 28, bkb: 12, kbg: 42,
  projectile: { kind: 'shockwave', speed: 5.2, life: 30, r: 11, dmg: 6.5, angle: 28, bkb: 12, kbg: 42, groundHug: true, color: '#ffd166', sfx: 'hit3' },
  projFrame: 0, sfx: 'hit3', fxColor: '#ffd166',
};
export const TITAN_SLAM_WAVE: MoveData = {
  id: 'slam_wave', name: 'Slam Shockwave', kind: 'special', startup: 0, active: 1, recovery: 0,
  damage: 11, angle: 32, bkb: 15, kbg: 66,
  projectile: { kind: 'shockwave', speed: 6.5, life: 46, r: 13, dmg: 11, angle: 32, bkb: 15, kbg: 66, groundHug: true, color: '#ffd166', sfx: 'hit3' },
  projFrame: 0, sfx: 'hit3', fxColor: '#ffd166', strong: true,
};

export class Fighter {
  cfg: FighterConfig;
  id: FighterId;
  playerIndex: number;
  isAI = false;
  label: string;

  // transform (prev values for render interpolation)
  x = 0; y = 0; px = 0; py = 0;
  vx = 0; vy = 0;
  w = 34; h = 52;
  facing: 1 | -1 = 1;

  // world/physics
  grounded = false;
  standingPlatform: string | null = null;
  dropThrough = 0;
  onIce = false;
  fastFalling = false;
  jumpsUsed = 0;
  coyote = 0;
  jumpBuffer = 0;
  airDodgeUsed = false;
  upSpecialUsed = false;
  landVel = 0;

  // state
  state: FighterState = 'idle';
  stateTimer = 0;
  move: MoveData | null = null;
  moveFrame = 0;
  moveHitId = 0;
  chargeFrames = 0;
  hitstop = 0;
  hitstun = 0;
  invuln = 0;
  damage = 0;          // percent
  stocks = 3;
  dashCooldown = 0;
  hookPull: { x: number; y: number } | null = null;
  respawnLift = false;

  // ledge (edge hang)
  ledge: { x: number; y: number; inward: 1 | -1 } | null = null;
  ledgeTimer = 0;      // frames left hanging
  ledgeCooldown = 0;   // regrab prevention after leaving a ledge

  // shield
  shieldHp = 100;
  shieldMax = 100;
  shielding = false;
  shieldJustUp = false;

  // grab
  grabTarget: Fighter | null = null;
  grabbedBy: Fighter | null = null;
  grabTimer = 0;

  // combat bookkeeping
  damageDealt = 0;
  lastHitTime = -9999;
  kos = 0;
  comboCount = 0;
  comboBest = 0;
  comboable = false;   // currently in a combo (victim side)
  lastHitBy: Fighter | null = null;
  hitVictims = new Set<number>();
  armorActive = false;
  counterWindow = false;
  portalCooldown = 0;
  specialCooldown = 0;

  // skill systems
  attackBuffer = 0;    // input buffering (frames)
  specialBuffer = 0;   // buffered special presses (frames)
  hitFlash = 0;        // white-flash frames after being hit (Smash-style feedback)
  lastDI = 0;          // degrees of DI applied on the last launch (0 = none)
  waveSpawned = false; // per-move guard for behavior-driven projectiles
  shieldUpTimer = 0;   // frames since shield was raised (parry window check)
  poison = 0;          // poison stacks 0..3 (VIPER's venom)
  poisonTimer = 0;     // frames remaining of poison
  parried = 0;         // frames of gold parry flash for render
  techBuffer = 0;      // frames left to land a tech (shield/dodge pressed during launch)
  techFlash = 0;       // render popup timer after a successful tech
  techCount = 0;       // lifetime techs this match (results screen)
  techLockout = 0;     // frames a mistimed tech input locks you out
  sdiBudget = 0;       // smash-DI nudges left during the current hitlag
  shieldDropLag = 0;   // frames of lag after releasing shield

  // ---- signature trait (per-character resource kit) ----
  traitSpec: TraitSpec;
  trait: TraitRuntime;

  // ---- status effects applied BY other fighters' kits ----
  burn = 0;            // EMBER: damage-over-time frames
  shock = 0;           // VOLT: frames marked, follow-ups hit harder
  chill = 0;           // FROST: 0..4 slow stacks
  chillTimer = 0;
  frozen = 0;          // FROST: frames locked solid at 4 stacks
  poisonOwner: Fighter | null = null;  // VIPER: who gets the lifesteal
  statusFlash = 0;

  // fx
  flashTimer = 0;
  justLanded = false;

  input: InputState = emptyInput();
  world: World;

  constructor(cfg: FighterConfig, playerIndex: number, world: World, label?: string) {
    this.cfg = cfg;
    this.id = cfg.info.id;
    this.playerIndex = playerIndex;
    this.world = world;
    this.label = label ?? (playerIndex === 0 ? 'P1' : 'CPU');
    this.w = 34 * cfg.stats.scale;
    this.h = 52 * cfg.stats.scale;
    this.shieldMax = cfg.stats.shieldHp;
    this.shieldHp = this.shieldMax;
    this.traitSpec = traitFor(cfg.info.id);
    this.trait = newTraitRuntime(this.traitSpec);
  }

  get scale() { return this.cfg.stats.scale; }
  get stats() { return this.cfg.stats; }

  /** Movement multiplier contributed by the signature trait + status effects. */
  get mobilityMul(): number {
    const traitMul = this.traitSpec.speedMul?.(this, this.trait) ?? 1;
    const chillMul = 1 - this.chill * 0.08;
    return traitMul * Math.max(0.55, chillMul);
  }
  get groundSpeedNow() { return this.stats.groundSpeed * this.mobilityMul; }
  get airSpeedNow() { return this.stats.airSpeed * this.mobilityMul; }
  /** Total mid-air jumps, including trait bonuses (TEMPEST / ascended SERAPH). */
  get maxJumps() { return 3 + (this.traitSpec.extraJumps?.(this, this.trait) ?? 0); }

  spawnAt(x: number, y: number, facing: 1 | -1) {
    this.x = this.px = x; this.y = this.py = y;
    this.facing = facing;
    this.vx = this.vy = 0;
    this.state = 'idle';
    this.damage = 0;
    this.jumpsUsed = 0;
    this.move = null;
    this.hitstun = 0;
    this.invuln = 0;
    this.shieldHp = this.shieldMax;
    this.comboCount = 0;
    this.comboable = false;
    this.grabTarget = null;
    this.grabbedBy = null;
    this.poison = 0;
    this.poisonTimer = 0;
    this.ledge = null;
    this.ledgeTimer = 0;
    this.techBuffer = 0;
    this.techFlash = 0;
    this.techLockout = 0;
    this.burn = 0;
    this.shock = 0;
    this.chill = 0; this.chillTimer = 0; this.frozen = 0;
    this.poisonOwner = null;
    this.shieldDropLag = 0;
    this.trait = newTraitRuntime(this.traitSpec);
    this.traitSpec.onSpawn?.(this, this.trait);
  }

  respawn(x: number, y: number, facing: 1 | -1) {
    this.spawnAt(x, y, facing);
    this.state = 'respawn';
    this.stateTimer = PHYS.respawnPlatformTime;
    this.respawnLift = true;
    this.invuln = PHYS.respawnInvuln;
    this.world.audio.play('respawn');
    this.world.particles.emit({ type: 'ring', x, y, maxLife: 30, size: 10, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
  }

  // ================= MAIN UPDATE =================

  update(input: InputState) {
    this.px = this.x; this.py = this.y;
    this.input = input;

    // input buffering for attacks (feels responsive, enables chains)
    if (input.pressed.attack) this.attackBuffer = 7;
    else if (this.attackBuffer > 0) this.attackBuffer--;
    if (input.pressed.special) this.specialBuffer = 7;
    else if (this.specialBuffer > 0) this.specialBuffer--;
    // TECH input capture: pressing shield/dodge while launched arms the tech window.
    // Mistiming now costs you: a failed input locks tech out entirely for a while,
    // so teching is a read rather than a mash.
    if (this.state === 'hitstun' || this.state === 'launch') {
      if (input.pressed.shield || input.pressed.dodge) {
        if (this.techLockout > 0) {
          this.techLockout = TECH.lockout;
        } else if (this.techBuffer > 0) {
          this.techBuffer = 0;
          this.techLockout = TECH.lockout;
        } else {
          this.techBuffer = TECH.window;
        }
      }
    }
    if (this.techBuffer > 0) this.techBuffer--;
    if (this.techLockout > 0) this.techLockout--;
    if (this.techFlash > 0) this.techFlash--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.parried > 0) this.parried--;

    if (this.flashTimer > 0) this.flashTimer--;
    if (this.invuln > 0) this.invuln--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.portalCooldown > 0) this.portalCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;

    if (this.hitstop > 0) {
      this.hitstop--;
      // SMASH DI: directional taps during hitlag physically shift you a few pixels.
      // This is what lets a good player escape a true combo, and it only exists
      // during the freeze frames, so it rewards reacting to the hit itself.
      if (this.sdiBudget > 0 && (input.pressed.left || input.pressed.right || input.pressed.up || input.pressed.down)) {
        const dx = (input.pressed.right ? 1 : 0) - (input.pressed.left ? 1 : 0);
        const dy = (input.pressed.down ? 1 : 0) - (input.pressed.up ? 1 : 0);
        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1;
          this.x += (dx / len) * DI.sdiStep;
          this.y += (dy / len) * DI.sdiStep;
          this.sdiBudget--;
          this.world.particles.emit({
            type: 'spark', x: this.x, y: this.y, maxLife: 8, size: 3,
            color: '#bfe9ff', vx: -dx * 2, vy: -dy * 2,
          });
        }
      }
      return; // frozen
    }
    this.updateStatusEffects();
    this.traitSpec.tick?.(this, this.trait);
    if (this.trait.flash > 0) this.trait.flash--;
    if (this.statusFlash > 0) this.statusFlash--;
    // FROZEN (FROST's payoff): locked solid, mash any direction to shatter out early
    if (this.frozen > 0) {
      this.frozen -= 1;
      if (input.pressed.left || input.pressed.right || input.pressed.jump || input.pressed.attack) this.frozen -= 3;
      this.vx *= 0.82;
      if (this.world.tick % 6 === 0) {
        this.world.particles.emit({
          type: 'icicle_frag', x: this.x + rand(-12, 12), y: this.y + rand(-18, 14),
          maxLife: 16, size: rand(2.5, 5), color: '#9fe8ff', vx: rand(-0.6, 0.6), vy: rand(-0.4, 0.6),
        });
      }
      if (this.frozen <= 0) {
        this.chill = 0;
        this.world.particles.emit({ type: 'ring', x: this.x, y: this.y, maxLife: 14, size: 8, color: '#9fe8ff', vx: 0, vy: 0, drag: 1 });
        this.world.emitSfx('crack');
      }
      this.physics();
      return;
    }
    // coyote time bookkeeping
    this.coyote = this.grounded ? PHYS.coyoteFrames : Math.max(0, this.coyote - 1);
    this.updateShieldRegen();
    if (this.oosWindow > 0) this.oosWindow--;

    switch (this.state) {
      case 'shieldbreak': this.updateShieldBreak(); break;
      case 'respawn': this.updateRespawn(input); break;
      case 'ko': return;
      case 'grabbed': this.updateGrabbed(); break;
      case 'hitstun': case 'launch': this.updateHitstun(); break;
      case 'shieldstun': this.updateShieldStun(); break;
      case 'dizzy': this.updateDizzy(); break;
      case 'dodge': this.updateDodge(input); break;
      case 'attack': this.updateAttack(input); break;
      case 'grabbing': this.updateGrabbing(input); break;
      case 'shield': this.updateShield(input); break;
      case 'land': this.updateLand(input); break;
      case 'jumpsquat': this.updateJumpsquat(input); break;
      case 'dash': this.updateDash(input); break;
      case 'ledge': this.updateLedge(input); break;
      case 'victory': this.updateVictory(); break;
      default: this.updateFree(input); break;
    }

    this.physics();

    // ledge grab check (falling offstage near a solid edge)
    if (this.state === 'air' && !this.grounded) this.tryLedgeGrab();

    // world hooks (wind, lava, portals)
    this.world.stage.hooks.onFighterUpdate?.(this.world.stage, this, this.world.tick, this.world.mods);
    if (this.grounded) {
      this.jumpsUsed = 0;
      this.airDodgeUsed = false;
      this.fastFalling = false;
    }
    this.comboable = this.state === 'hitstun' || this.state === 'launch' || (this.hitstun > 0);
  }

  private physics() {
    const g = this.world.gravity * (this.move?.gravityMul ?? 1) * (this.state === 'respawn' || this.state === 'grabbed' || this.state === 'ledge' ? 0 : 1);
    const airborne = !this.grounded && this.state !== 'respawn' && this.state !== 'ledge';

    if (this.state === 'launch' || (this.state === 'hitstun')) {
      this.vx *= (1 - PHYS.launchDragX);
    } else if (airborne) {
      this.vx *= (1 - PHYS.airDragX);
    }

    this.vy += g;
    const cap = this.fastFalling && this.state !== 'attack' ? this.stats.fastFallCap : this.stats.fallCap;
    if (this.state === 'launch' || this.state === 'hitstun') {
      this.vy = clamp(this.vy, -40, 26);
    } else if (airborne) {
      this.vy = Math.min(this.vy, cap);
    }

    this.x += this.vx;
    this.y += this.vy;

    // loose safety clamp (real KO handled by blast zones in Match)
    const b = this.world.stage.camBounds;
    this.x = clamp(this.x, b.minX - 1400, b.maxX + 1400);
    this.y = clamp(this.y, b.minY - 1400, b.maxY + 1600);

    const wasAir = !this.grounded;
    if (this.state !== 'ledge') this.world.stage.collide(this);
    if (wasAir && this.grounded) {
      this.onLanded();
    }
    this.standingPlatform = this.standingOn ? String(this.standingOn.id) : null;
  }
  standingOn: import('../stages/Stage').Platform | null = null;

  private onLanded() {
    const hard = this.landVel > 7;
    if (this.state === 'launch' || this.state === 'hitstun') {
      if (this.hitstun > 8) {
        // ---- TECH: shield/dodge pressed within the window → ride the momentum, no bounce ----
        if (this.techBuffer > 0) {
          this.techBuffer = 0;
          this.techCount++;
          this.techFlash = 26;
          this.hitstun = 0;
          this.endCombo();
          this.state = 'land';
          this.stateTimer = 5;
          // TECH ROLL: hold a direction as you tech to roll clear of the follow-up.
          // Teching in place leaves you next to an attacker who read it.
          const roll = Math.abs(this.input.axisX) > 0.4 ? Math.sign(this.input.axisX) : 0;
          if (roll !== 0) {
            this.vx = roll * TECH.rollSpeed;
            this.stateTimer = 12;
            this.facing = roll > 0 ? 1 : -1;
          } else {
            this.vx *= 0.6;
          }
          this.vy = 0;
          this.invuln = Math.max(this.invuln, TECH.invuln);
          this.fastFalling = false;
          const dir = Math.sign(this.vx) || this.facing;
          this.world.particles.dust(this.x, this.y + this.h / 2, dir, 7, this.qualityN());
          this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + this.h / 2 - 4, maxLife: 14, size: 7, color: '#bfe9ff', vx: 0, vy: 0, drag: 1 });
          for (let i = 0; i < 5; i++) {
            this.world.particles.emit({ type: 'spark', x: this.x + rand(-10, 10), y: this.y + this.h / 2 - rand(0, 8), maxLife: 10, size: 3.4, color: '#d8f4ff', vx: rand(-2.4, 2.4), vy: rand(-2.8, -0.4) });
          }
          this.world.audio.play('tech');
          this.world.shake(0.14);
          return;
        }
        // missed tech: punished bounce (longer floor stun than before — teching matters)
        this.vy = -this.landVel * 0.46;
        this.hitstun = Math.floor(this.hitstun * 0.62) + 5;
        this.world.particles.dust(this.x, this.y + this.h / 2, 0, 7, this.qualityN());
        this.world.audio.play('land');
        return;
      }
      this.hitstun = 0;
      this.endCombo();
    }
    if (this.state === 'attack' && this.move) {
      if (this.move.behavior === 'titan_slam') {
        // slam shockwave triggers on touchdown; let the move finish grounded
        return;
      }
      const lag = Math.max(4, (this.move.landLag ?? 6) - 2);
      if (this.move.kind === 'air' || this.move.kind === 'special') {
        this.cancelMove();
        this.state = 'land'; this.stateTimer = lag;
      }
    } else if (this.state === 'dodge') {
      // ---- WAVEDASH: landing out of an air dodge keeps its momentum as a ground slide ----
      const momentum = Math.abs(this.vx);
      this.state = 'land';
      this.stateTimer = momentum > 4.5 ? 3 : 6;
      if (momentum > 3.2) {
        this.vx *= 0.97; // nearly all momentum preserved → wave-slide movement tech
        const dir = Math.sign(this.vx);
        for (let i = 0; i < 5; i++) {
          this.world.particles.emit({
            type: 'dust', x: this.x - dir * rand(2, 14), y: this.y + this.h / 2 - rand(0, 4),
            vx: -dir * rand(1.2, 3), vy: rand(-1.2, -0.1), maxLife: 14, size: rand(2.5, 4.5),
            color: 'rgba(230,235,250,0.6)', additive: false,
          });
        }
        if (momentum > 5.5) {
          this.world.particles.emit({ type: 'glow', x: this.x, y: this.y, maxLife: 10, size: 6, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 0.92 });
        }
      }
    } else if (this.state === 'respawn') {
      // fine
    } else {
      this.state = 'land';
      this.stateTimer = hard ? 8 : 4;
    }
    if (this.landVel > 3) {
      this.world.particles.dust(this.x, this.y + this.h / 2, 0, hard ? 8 : 4, this.qualityN());
      this.world.emitSfx('land');
    }
    this.airDodgeUsed = false;
    this.fastFalling = false;
  }

  private qualityN() { return this.world.mods.lowGravity ? 0.8 : 1; }

  endCombo() {
    this.comboable = false;
    if (this.lastHitBy && this.lastHitBy.comboCount > 0) {
      this.lastHitBy.comboBest = Math.max(this.lastHitBy.comboBest, this.lastHitBy.comboCount);
      this.lastHitBy.comboCount = 0;
    }
    // NOTE: lastHitBy is kept for KO credit (time-window checked in Match.koFighter)
  }

  // ================= STATE: FREE (idle/walk/crouch/air) =================

  private updateFree(input: InputState) {
    const ax = input.axisX;
    if (this.grounded) {
      // facing & turning
      if (ax !== 0) this.facing = ax > 0 ? 1 : -1;

      // crouch
      if (input.held.down) {
        this.state = 'crouch';
        this.vx *= 0.6;
      } else {
        // walking
        const target = this.groundSpeedNow * ax;
        const accel = this.stats.groundAccel * (this.onIce ? 0.25 : 1);
        // skid: hard direction reversal at speed kicks up dust (readable turn intent)
        if (ax !== 0 && Math.sign(ax) !== Math.sign(this.vx) && Math.abs(this.vx) > 3.1 && this.world.tick % 3 === 0) {
          this.world.particles.dust(this.x, this.y + this.h / 2, ax, 2);
        }
        if (ax !== 0) {
          this.vx += clamp(target - this.vx, -accel, accel);
          this.state = 'walk';
        } else {
          const fric = this.stats.friction * (this.onIce ? 0.06 : 1);
          this.vx -= clamp(this.vx, -fric, fric);
          this.state = 'idle';
        }
      }

      // drop through pass platform
      const onPass = this.standingOn && this.standingOn.type !== 'solid';
      if (input.pressed.down && onPass) {
        this.dropThrough = 14;
        this.y += 6;
        this.grounded = false;
        this.state = 'air';
        return;
      }

      // dash burst (deliberate button press — Q/E by default, never a hold/double-tap)
      if (input.pressed.dash) {
        this.startDash(ax !== 0 ? (ax > 0 ? 1 : -1) : this.facing);
        return;
      }
      // shield
      if (input.held.shield) {
        this.state = 'shield';
        this.shielding = true;
        this.shieldUpTimer = 0; // parry window opens the first frames of a fresh shield
        this.world.audio.play('shield_on');
        return;
      }
      // grab
      if (input.pressed.grab) { this.startMove(this.cfg.moves['grab']); return; }
      if (input.pressed.attack && input.held.shield) { this.startMove(this.cfg.moves['grab']); return; }
      // attacks
      if (this.tryGroundAttack(input)) return;
      // jump
      if (this.tryJump(input)) return;
    } else {
      // airborne
      this.state = 'air';
      if (ax !== 0) {
        const accel = this.stats.airAccel;
        this.vx += clamp(this.airSpeedNow * ax - this.vx, -accel, accel);
        // AERIAL FACING: remember which way we were facing BEFORE the stick turned us.
        // Without this the back-air check below could never be true, which made
        // bair literally unreachable on all twelve characters.
        if (!this.move) {
          this.aerialFacingPrev = this.facing;
          this.aerialTurnFrames = 3;
          this.facing = ax > 0 ? 1 : -1;
        }
      }
      if (this.aerialTurnFrames > 0) this.aerialTurnFrames--;
      // fast fall
      if (input.pressed.down && this.vy > 0.5 && !this.fastFalling) {
        this.fastFalling = true;
      }
      // TEMPEST: gale reserve buys instant omnidirectional air dashes
      if (input.pressed.dash && this.traitSpec.id === 'gale' && this.trait.charges > 0) {
        this.trait.charges--;
        this.trait.flash = 12;
        const len = Math.hypot(ax, input.axisY) || 1;
        const dx = ax === 0 && input.axisY === 0 ? this.facing : ax / len;
        const dy = ax === 0 && input.axisY === 0 ? 0 : input.axisY / len;
        this.vx = dx * 13.5;
        this.vy = dy * 11 - 1.2;
        this.world.emitSfx('gust');
        this.world.particles.dashTrail(this.x, this.y, -this.vx, -this.vy, this.cfg.info.colors.glow);
        for (let i = 0; i < 6; i++) {
          this.world.particles.emit({
            type: 'glow', x: this.x - dx * i * 7, y: this.y - dy * i * 7,
            maxLife: 14, size: 6 - i * 0.6, color: '#bff3ff', vx: -dx, vy: -dy,
          });
        }
        return;
      }
      // air dodge (shield button works in the air too — easier recoveries)
      if ((input.pressed.dodge || input.pressed.shield) && !this.airDodgeUsed) {
        this.startAirDodge();
        return;
      }
      // specials work in the air (up-special recovery!) — this was silently dead before
      if (input.pressed.special || this.specialBuffer > 0) {
        if (this.trySpecial(input)) return;
      }
      if (this.tryJump(input)) return;
      if (this.tryAirAttack(input)) return;
    }

    if (this.grounded) this.state = this.state === 'crouch' ? 'crouch' : (Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
  }

  private tryJump(input: InputState): boolean {
    if (input.pressed.jump) this.jumpBuffer = PHYS.jumpBufferFrames;
    if (this.jumpBuffer > 0) {
      const maxJumps = this.maxJumps;
      if (this.grounded || this.coyote > 0) {
        this.jumpBuffer = 0; this.coyote = 0;
        this.jumpsUsed = 1;
        this.doJump(this.stats.jumpVel, 'jump');
        return true;
      } else if (this.jumpsUsed < maxJumps) {
        this.jumpBuffer = 0;
        this.jumpsUsed++;
        const v = this.jumpsUsed === 2 ? this.stats.airJumpVel : this.stats.tripleJumpVel;
        this.doJump(v, this.jumpsUsed === 2 ? 'doublejump' : 'doublejump');
        return true;
      }
    }
    return false;
  }

  private doJump(v: number, sfx: 'jump' | 'doublejump') {
    this.vy = -v;
    this.grounded = false;
    this.fastFalling = false;
    this.state = 'air';
    // slight horizontal boost with held direction
    if (this.input.axisX !== 0) this.vx += this.input.axisX * 1.2;
    this.world.emitSfx(sfx);
    this.world.particles.dust(this.x, this.y + this.h / 2, 0, sfx === 'jump' ? 5 : 0);
    if (sfx === 'doublejump') {
      this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + this.h * 0.3, maxLife: 12, size: 4, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
    }
  }

  private startDash(dir: 1 | -1) {
    this.state = 'dash';
    this.facing = dir;
    this.stateTimer = this.stats.dashFrames;
    this.vx = this.stats.dashSpeed * this.mobilityMul * dir;
    this.dashCooldown = 0; // dashes are free-flowing movement now
    this.world.emitSfx('dash');
    this.world.particles.dashTrail(this.x, this.y, dir * 4, 0, this.cfg.info.colors.glow);
    this.world.particles.dust(this.x - dir * 8, this.y + this.h / 2, -dir, 3);
  }

  private updateDash(input: InputState) {
    this.stateTimer--;
    const ax = input.axisX;
    // maintain dash speed for the fixed burst duration, then hand back to walk/idle
    this.vx = this.stats.dashSpeed * this.mobilityMul * this.facing * (this.stateTimer / this.stats.dashFrames * 0.4 + 0.6);
    if (this.stateTimer % 3 === 0) this.world.particles.dust(this.x - this.facing * 8, this.y + this.h / 2, this.facing, 2);
    if (this.stateTimer <= 0) {
      this.state = 'idle';
      return;
    }
    // dash → jump keeps momentum
    if (this.tryJump(input)) return;
    if (input.pressed.attack) { this.startMove(this.cfg.moves['dashattack']); return; }
    if (input.pressed.dodge) { this.startGroundDodge(ax); return; }
    if (input.held.shield) { this.state = 'shield'; this.shielding = true; this.shieldUpTimer = 0; return; }
    if (input.pressed.grab) { this.startMove(this.cfg.moves['grab']); return; }
    if (input.pressed.special) { this.trySpecial(input); return; }
    if (ax !== 0 && ax !== this.facing) {
      // turn around dash
      this.facing = ax > 0 ? 1 : -1;
    }
    if (input.pressed.down) {
      this.state = 'crouch';
      this.vx *= 0.5;
    }
  }

  private updateJumpsquat(input: InputState) {
    this.stateTimer--;
    if (this.stateTimer <= 0) {
      this.grounded = false;
      this.doJump(this.pendingJumpVel, this.pendingJumpSfx);
    }
  }
  private pendingJumpVel = 0;
  private pendingJumpSfx: 'jump' | 'doublejump' = 'jump';

  private updateLand(input: InputState) {
    this.stateTimer--;
    this.vx -= clamp(this.vx, -this.stats.friction * 0.6, this.stats.friction * 0.6);
    // LANDING CANCEL LINKS: the last frames of landing lag accept buffered actions —
    // landings flow straight into jabs/tilts/grabs/jumps, so aerial combos can continue.
    if (this.stateTimer <= 2) {
      if (this.tryJump(input)) return;
      if (this.tryGroundAttack(input)) return;
      if (input.pressed.grab) { this.startMove(this.cfg.moves['grab']); return; }
      if (input.pressed.special && this.trySpecial(input)) return;
      if (input.pressed.dash) { this.startDash(input.axisX !== 0 ? (input.axisX > 0 ? 1 : -1) : this.facing); return; }
      if (input.held.shield) { this.state = 'shield'; this.shielding = true; this.shieldUpTimer = 0; return; }
    }
    if (this.stateTimer <= 0) this.state = 'idle';
  }

  private updateVictory() {
    this.vx *= 0.8;
    if (this.world.tick % 9 === 0) {
      this.world.particles.emit({
        type: 'star', x: this.x + rand(-20, 20), y: this.y - rand(10, 40),
        vx: rand(-0.5, 0.5), vy: rand(-1.2, -0.4), maxLife: 40, size: 3, color: this.cfg.info.colors.glow, grav: -0.01, drag: 0.98,
      });
    }
  }

  // ================= SHIELD =================

  private updateShield(input: InputState) {
    this.shielding = true;
    this.shieldUpTimer++;
    this.vx -= clamp(this.vx, -this.stats.friction, this.stats.friction);
    // Shields are a RESOURCE: they shrink while held and shatter if you turtle.
    this.shieldHp -= SHIELD.drain;
    if (this.shieldHp <= 0) { this.breakShield(); return; }
    if (this.shieldStun > 0) {
      // locked in blockstun: shield holds, but no options come out yet
      this.shieldStun--;
      if (!input.held.shield && this.shieldStun <= 0) this.dropShield(SHIELD.dropLag);
      return;
    }
    if (input.held.shield && this.grounded) {
      // ---- OUT OF SHIELD OPTIONS: the whole point of blocking ----
      if (input.pressed.attack || input.pressed.grab) { this.dropShield(0); this.startMove(this.cfg.moves['grab']); return; }
      if (input.pressed.dodge) { this.dropShield(0); this.startGroundDodge(input.axisX); return; }
      if (input.pressed.jump) {
        // OOS jump → instantly cancellable into an aerial, the classic punish
        this.dropShield(0);
        this.grounded = false;
        this.doJump(this.stats.jumpVel, 'jump');
        this.oosWindow = 6;
        return;
      }
      if (input.pressed.special) { this.dropShield(0); if (this.trySpecial(input)) return; }
      if (input.held.up && input.pressed.attack) { this.dropShield(0); this.startMove(this.cfg.moves['uattack']); return; }
    } else {
      this.dropShield(SHIELD.dropLag);
    }
  }

  /** frames after an OOS jump during which an aerial comes out with no jumpsquat */
  oosWindow = 0;

  private dropShield(lag: number) {
    this.shielding = false;
    this.shieldDropLag = lag;
    if (lag > 0) {
      this.state = 'shieldstun';
      this.stateTimer = lag;
    }
  }

  breakShield() {
    this.shielding = false;
    this.shieldHp = 0;
    this.state = 'shieldbreak';
    this.stateTimer = SHIELD.breakStun;
    this.vy = -6;
    this.grounded = false;
    this.world.audio.play('shield_break');
    this.world.onShieldBreak(this);
    this.world.shake(9);
  }

  private updateShieldStun() {
    this.shielding = false;
    this.stateTimer--;
    this.vx -= clamp(this.vx, -this.stats.friction, this.stats.friction);
    if (this.stateTimer <= 0) this.state = 'idle';
  }

  private updateShieldRegen() {
    if (this.shielding) return;
    if (this.shieldHp < this.shieldMax) {
      this.shieldHp = Math.min(this.shieldMax, this.shieldHp + SHIELD.regen);
    }
  }

  private updateShieldBreak() {
    this.shielding = false;
    this.stateTimer--;
    this.vx -= clamp(this.vx, -this.stats.friction * 0.5, this.stats.friction * 0.5);
    if (this.world.tick % 5 === 0) {
      this.world.particles.emit({
        type: 'star', x: this.x + rand(-14, 14), y: this.y - this.h * 0.6,
        vx: rand(-1, 1), vy: rand(-1.2, -0.3), maxLife: 30, size: 3, color: '#ffd166', grav: 0.02, drag: 0.96,
      });
    }
    if (this.stateTimer <= 0) {
      this.state = 'dizzy';
      this.stateTimer = 40;
      this.shieldHp = this.shieldMax * SHIELD.breakRefill;
    }
  }

  private updateDizzy() {
    this.shielding = false;
    this.stateTimer--;
    this.vx -= clamp(this.vx, -this.stats.friction, this.stats.friction);
    if (this.world.tick % 12 === 0) {
      this.world.particles.emit({
        type: 'star', x: this.x + rand(-10, 10), y: this.y - this.h * 0.55, vx: rand(-0.6, 0.6), vy: rand(-0.8, -0.2),
        maxLife: 24, size: 2.5, color: '#ffe066', grav: 0.02, drag: 0.96,
      });
    }
    if (this.stateTimer <= 0) this.state = 'idle';
  }

  // ================= DODGE =================

  private startGroundDodge(ax: number) {
    this.shielding = false;
    this.state = 'dodge';
    this.stateTimer = 24;
    this.dodgeInvulnStart = 3; this.dodgeInvulnEnd = 16;
    this.dodgeRoll = Math.abs(ax) > 0.3;
    if (this.dodgeRoll) {
      this.facing = ax > 0 ? 1 : -1;
      this.vx = 6.2 * this.facing;
    } else {
      this.vx = 0;
    }
    this.world.emitSfx('dodge');
  }
  private dodgeInvulnStart = 0; dodgeInvulnEnd = 0; dodgeRoll = false; dodgeTotal = 0;

  private startAirDodge() {
    this.state = 'dodge';
    this.stateTimer = 26;
    this.dodgeTotal = 26;
    this.dodgeInvulnStart = 3; this.dodgeInvulnEnd = 18;
    this.dodgeRoll = false;
    this.airDodgeUsed = true;
    const ax = this.input.axisX, ay = this.input.axisY;
    const len = Math.hypot(ax, ay) || 1;
    this.vx = (ax / len) * this.stats.airDodgeSpeed;
    this.vy = (ay / len) * this.stats.airDodgeSpeed * 0.85;
    this.world.emitSfx('dodge');
    this.world.particles.dashTrail(this.x, this.y, this.vx, this.vy, this.cfg.info.colors.glow);
  }

  private updateDodge(input: InputState) {
    void input;
    this.stateTimer--;
    const elapsed = (this.dodgeTotal || 24) - this.stateTimer;
    this.invuln = Math.max(this.invuln, elapsed >= this.dodgeInvulnStart && elapsed <= this.dodgeInvulnEnd ? 2 : 0);
    if (this.state === 'dodge' && !this.grounded) {
      // slight float during air dodge
      this.vy *= 0.94;
    }
    if (this.dodgeRoll) this.vx *= 0.9;
    if (this.stateTimer <= 0) {
      this.state = this.grounded ? 'idle' : 'air';
      if (this.grounded) this.stateTimer = 2; else this.stateTimer = 0;
    }
  }

  // ================= LEDGE (edge hang) =================

  /** Falling near a solid stage edge → snap-grab it (Smash-style recovery catch). */
  private tryLedgeGrab() {
    if (this.ledgeCooldown > 0 || this.ledge) return;
    if (this.state !== 'air' || this.grounded || this.hitstun > 0) return;
    if (this.vy < -0.4) return;              // rising: only grab on the way down / at apex
    if (this.input.held.down) return;        // deliberately falling past
    const s = this.scale;
    const feet = this.y + this.h / 2;
    for (const p of this.world.stage.platforms) {
      if (p.type !== 'solid' || p.broken > 0) continue;
      const top = p.cy;
      if (feet < top - 4 || feet > top + 46 * s) continue; // just below the deck (feet-based)
      // left edge — body hangs OUTSIDE the wall (center is left of the lip)
      if (this.x < p.cx - 2 && this.x > p.cx - 52 * s) {
        this.grabLedge(p.cx, top, 1);
        return;
      }
      // right edge — center is right of the lip
      if (this.x > p.cx + p.w + 2 && this.x < p.cx + p.w + 52 * s) {
        this.grabLedge(p.cx + p.w, top, -1);
        return;
      }
    }
  }

  private grabLedge(x: number, y: number, inward: 1 | -1) {
    this.ledge = { x, y, inward };
    this.state = 'ledge';
    this.ledgeTimer = 300;
    this.x = x - inward * 7 * this.scale;
    this.y = y + 30 * this.scale;
    this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0;
    this.facing = inward;
    this.invuln = Math.max(this.invuln, 38);
    this.hitstun = 0;
    this.fastFalling = false;
    this.jumpsUsed = 0;
    this.airDodgeUsed = false;
    this.upSpecialUsed = false;
    this.cancelMove();
    this.shielding = false;
    this.world.audio.play('grab');
    this.world.particles.emit({ type: 'ring', x, y, maxLife: 14, size: 5, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
    for (let i = 0; i < 5; i++) {
      this.world.particles.emit({
        type: 'dust', x: x + rand(-5, 5), y: y + rand(-2, 3),
        vx: -inward * rand(0.4, 1.4), vy: rand(-0.8, 0.2), maxLife: 16, size: rand(2, 3.6), color: 'rgba(220,220,235,0.5)', additive: false,
      });
    }
  }

  private clearLedge(cooldown: number) {
    this.ledge = null;
    this.ledgeCooldown = cooldown;
    this.ledgeTimer = 0;
  }

  private updateLedge(input: InputState) {
    this.ledgeTimer--;
    this.vx = 0; this.vy = 0;
    if (this.ledge) {
      this.x = this.ledge.x - this.ledge.inward * 7 * this.scale;
      this.y = this.ledge.y + 30 * this.scale;
      this.facing = this.ledge.inward;
    }
    if (this.ledgeTimer <= 0) { this.dropFromLedge(); return; }
    if (input.held.down) { this.dropFromLedge(); return; }
    if (input.pressed.jump || input.pressed.up) { this.ledgeJump(); return; }
    if (input.pressed.attack || input.pressed.grab) { this.ledgeGetup(true); return; }
    if (input.pressed.dodge) { this.ledgeRoll(); return; }
    if (input.pressed.shield) { this.ledgeGetup(false); return; }
  }

  private ledgeJump() {
    const inward = this.ledge?.inward ?? this.facing;
    this.clearLedge(26);
    this.state = 'air';
    this.grounded = false;
    this.vy = -this.stats.jumpVel * 1.04;
    this.vx = inward * this.groundSpeedNow * 0.85;
    this.jumpsUsed = 2; // ledge jump costs the first air jump
    this.world.emitSfx('jump');
    this.world.particles.dust(this.x, this.y + this.h / 2, 0, 4);
    this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + this.h * 0.3, maxLife: 12, size: 4, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
  }

  private ledgeGetup(withAttack: boolean) {
    const ledge = this.ledge;
    if (!ledge) { this.state = 'air'; return; }
    this.clearLedge(22);
    this.x = ledge.x + ledge.inward * 22;
    this.y = ledge.y - this.h * 0.5 - 1;
    this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0;
    this.grounded = true;
    this.facing = ledge.inward;
    if (withAttack) {
      this.startMove(this.cfg.moves['jab']);
    } else {
      this.state = 'land';
      this.stateTimer = 3;
    }
    this.world.particles.dust(this.x, this.y + this.h / 2, ledge.inward, 5);
  }

  private ledgeRoll() {
    const ledge = this.ledge;
    if (!ledge) { this.state = 'air'; return; }
    this.clearLedge(26);
    this.x = ledge.x + ledge.inward * 16;
    this.y = ledge.y - this.h * 0.5 - 1;
    this.px = this.x; this.py = this.y;
    this.grounded = true;
    this.startGroundDodge(ledge.inward);
  }

  private dropFromLedge() {
    const inward = this.ledge?.inward ?? 1;
    this.clearLedge(34);
    this.state = 'air';
    this.grounded = false;
    this.vx = -inward * 1.4;   // small push away from the wall
    this.vy = 1;
  }

  // ================= ATTACKS =================

  private tryGroundAttack(input: InputState): boolean {
    if (!input.pressed.attack && this.attackBuffer <= 0 && !input.pressed.special) return false;
    if (input.pressed.special) return this.trySpecial(input);
    const ax = input.axisX;
    if (input.held.up) this.startMove(this.cfg.moves['uattack']);
    else if (input.held.down) this.startMove(this.cfg.moves['dattack']);
    else if (ax !== 0) { this.facing = ax > 0 ? 1 : -1; this.startMove(this.cfg.moves['fattack']); }
    else this.startMove(this.cfg.moves['jab']);
    this.attackBuffer = 0;
    return true;
  }

  /** facing captured before the stick turned us mid-air (enables back-air) */
  aerialFacingPrev: 1 | -1 = 1;
  aerialTurnFrames = 0;

  private tryAirAttack(input: InputState): boolean {
    if (!input.pressed.attack && this.attackBuffer <= 0) return false;
    if (input.held.up) this.startMove(this.cfg.moves['uair']);
    else if (input.held.down) this.startMove(this.cfg.moves['dair']);
    else if (input.axisX !== 0) {
      // Compare the stick against the facing we had BEFORE this turnaround.
      // Holding away from your momentum within a few frames of turning gives
      // you the back-air — the strongest aerial in every character's kit.
      const stick = input.axisX > 0 ? 1 : -1;
      const reference = this.aerialTurnFrames > 0 ? this.aerialFacingPrev : this.facing;
      const fwd = stick === reference;
      const move = this.cfg.moves[fwd ? 'fair' : 'bair'] ?? this.cfg.moves['fair'];
      if (!fwd) this.facing = reference;   // bair: keep facing away, swing behind
      this.startMove(move);
    } else this.startMove(this.cfg.moves['nair']);
    this.attackBuffer = 0;
    return true;
  }

  private trySpecial(input: InputState): boolean {
    if (!input.pressed.special && this.specialBuffer <= 0) return false;
    // one up-special per airtime (restored on landing / when launched)
    if (input.held.up && this.upSpecialUsed && !this.grounded) return false;
    const slot: 'u' | 'd' | 's' | 'n' =
      input.held.up ? 'u' : input.held.down ? 'd' : input.axisX !== 0 ? 's' : 'n';
    const base = this.cfg.moves[`${slot}special`];
    if (!base) return false;
    // The kit gets first refusal: it can spend a resource and hand back a
    // rewritten move (empowered, weakened, or projectile-less when dry).
    const override = this.traitSpec.onSpecial?.(this, this.trait, slot, base);
    if (slot === 's') this.facing = input.axisX > 0 ? 1 : -1;
    if (!this.startMove(override ?? base)) return false;
    this.specialBuffer = 0;
    return true;
  }

  startMove(move: MoveData | undefined): boolean {
    if (!move) return false;
    if (this.state === 'attack' && this.move && this.moveFrame < this.move.startup + moveActive(this.move)) return false;
    this.state = 'attack';
    this.move = move;
    this.moveFrame = 0;
    this.chargeFrames = 0;
    this.moveHitId = MOVE_INSTANCE++;
    this.hitVictims.clear();
    this.shielding = false;
    this.hookPull = null;
    this.waveSpawned = false;
    this.lastDI = 0;
    this.stateTimer = 0;
    if (move.behavior === 'hook_grapple' || move.behavior === 'hook_zip' || move.behavior === 'vanguard_rising' || move.behavior === 'ember_tp' || move.behavior === 'nova_rise' || move.behavior === 'volt_thunder' || move.behavior === 'frost_rise' || move.behavior === 'wraith_ascent' || move.behavior === 'seraph_wings' || move.behavior === 'viper_coil' || move.behavior === 'tempest_twister') {
      this.upSpecialUsed = move.behavior === 'vanguard_rising' || move.behavior === 'ember_tp' || move.behavior === 'hook_zip' || move.behavior === 'nova_rise' || move.behavior === 'volt_thunder' || move.behavior === 'frost_rise' || move.behavior === 'wraith_ascent' || move.behavior === 'seraph_wings' || move.behavior === 'viper_coil' || move.behavior === 'tempest_twister';
    }
    // net: announce the swing/special so remote clients can play its sound
    this.world.emitSfx(move.sfx);
    return true;
  }

  cancelMove() {
    this.move = null;
    this.hookPull = null;
    this.armorActive = false;
    this.counterWindow = false;
  }

  private updateAttack(input: InputState) {
    const m = this.move;
    if (!m) { this.state = this.grounded ? 'idle' : 'air'; return; }
    this.moveFrame++;
    const f = this.moveFrame;

    // AERIAL DRIFT: held direction steers aerial attacks (Smash-style — aerials stay threatening
    // while chasing / escaping). Grounded attacks keep their committed footing.
    if (!this.grounded && !m.mobility && Math.abs(input.axisX) > 0.2) {
      const driftAccel = this.stats.airAccel * 0.55;
      this.vx += clamp(this.stats.airSpeed * input.axisX - this.vx, -driftAccel, driftAccel);
    }

    // charging specials: OPTIONAL — tap fires instantly, holding overcharges, auto-fires at max
    if (m.chargeable) {
      const c = m.chargeable;
      const maxCharge = c.maxF - c.minF;
      if (f >= c.minF && f < c.maxF && input.held.special && this.chargeFrames < maxCharge) {
        this.chargeFrames++;
        if (this.chargeFrames % 10 === 0) {
          this.world.audio.play('charge');
          this.world.particles.emit({
            type: 'glow', x: this.x + this.facing * 14, y: this.y, maxLife: 14,
            size: 8 + this.chargeFrames * 0.3, color: this.cfg.info.colors.glow, vx: 0, vy: 0,
          });
        }
        this.moveFrame = c.minF; // hold
        this.vx *= 0.7;
        return;
      }
    }

    // mobility impulses
    if (m.mobility) {
      for (const imp of m.mobility) {
        if (imp.frame === f) {
          if (imp.vx !== undefined) this.vx = imp.vx * this.facing;
          if (imp.vy !== undefined) this.vy = imp.vy;
        }
      }
    }

    // behaviors
    this.updateMoveBehavior(m, input, f);

    // ---- weapon swing FX: motion-aware (crescent / stab / ring / cross / smash) ----
    if (m.hitboxes && m.kind !== 'grab' && m.kind !== 'throw' && f === m.startup + 1) {
      this.world.onSwing?.(this, m);
      const spec = swingFXSpec(this, m);
      if (spec) this.world.particles.swingFX(spec);
    }
    // sweep/spin trails: spark chase along the moving hitbox path
    if (m.motion && m.hitboxes && m.kind !== 'grab' && m.kind !== 'throw'
        && f > m.startup && f <= m.startup + moveActive(m) && (f - m.startup) % 2 === 0) {
      const hbT = m.hitboxes[0];
      const offT = this.motionOffset(hbT, m, f, this.cfg.weapon?.reach ?? 0);
      const wx = this.x + offT.dx * this.scale * this.facing;
      const wy = this.y + offT.dy * this.scale;
      const col = m.fxColor ?? this.cfg.info.colors.glow;
      this.world.particles.emit({
        type: 'glow', x: wx, y: wy, maxLife: 7, size: 5.5,
        color: col, vx: 0, vy: 0, drag: 0.94,
      });
    }
    // multi-hit windows (flurry / spin): clear victims on each rehit interval
    if (m.motion?.rehit && f > m.startup && f <= m.startup + moveActive(m)
        && (f - m.startup) % m.motion.rehit === 0) {
      this.hitVictims.clear();
    }

    // projectile spawn (incl. behavior-driven hookshot) — charge scales projectile stats
    if ((m.projectile || m.behavior === 'hook_grapple') && m.projFrame === f) {
      let spawnMove = m;
      if (m.projectile && m.chargeable && this.chargeFrames > 0) {
        const c = m.chargeable;
        const ratio = clamp(this.chargeFrames / (c.maxF - c.minF), 0, 1);
        const dmgM = 1 + (c.dmgMul - 1) * ratio;
        const kbM = 1 + (c.kbMul - 1) * ratio;
        spawnMove = {
          ...m,
          projectile: {
            ...m.projectile,
            dmg: m.projectile.dmg * dmgM,
            bkb: m.projectile.bkb * kbM,
            kbg: m.projectile.kbg * kbM,
            r: m.projectile.r * (1 + ratio * 0.9),
            speed: m.projectile.speed * (1 - ratio * 0.22),
          },
        };
      }
      this.world.spawnProjectile(this, spawnMove, this.facing);
    }

    // end of move
    const total = moveTotal(m);
    if (f >= total) {
      // chain cancel (jab combos): buffered attack during the chain window flows into the next move
      if (m.chainTo && this.grounded && this.attackBuffer > 0 && f >= total - ((m.chainWindow ?? 6) + 3)) {
        const next = this.cfg.moves[m.chainTo];
        if (next && this.startMove(next)) return;
      }
      this.cancelMove();
      this.state = this.grounded ? 'idle' : 'air';
      if (!this.grounded && this.state === 'air') { /* keep going */ }
    }
  }

  private updateMoveBehavior(m: MoveData, input: InputState, f: number) {
    this.armorActive = !!m.armor && f <= m.startup + m.active;
    this.counterWindow = !!m.counter && f > 2 && f <= m.counter.frames;
    switch (m.behavior) {
      case 'ember_tp': {
        if (f === m.startup) {
          const dir = input.axisX !== 0 ? (input.axisX > 0 ? 1 : -1) : this.facing;
          this.facing = dir;
          const dx = dir * 170, dy = input.held.up ? -130 : (input.held.down ? 90 : -14);
          // simple obstruction check: step in increments
          const steps = 8;
          let fx = this.x, fy = this.y;
          for (let i = 0; i < steps; i++) {
            const nx = fx + dx / steps, ny = fy + dy / steps;
            // light obstruction check: use stage collision on a temp body
            const tmp: import('../stages/Stage').BodyLike = {
              x: nx, y: ny, vx: 0, vy: 0, w: this.w, h: this.h, grounded: false,
              standingOn: null, dropThrough: 0, onIce: false, landVel: 0, justLanded: false,
            };
            this.world.stage.collide(tmp);
            const blocked = Math.abs(tmp.x - nx) > 2 || (tmp.y - ny) < -2;
            if (blocked) break;
            fx = nx; fy = ny;
          }
          this.world.particles.fire(this.x, this.y, 10);
          this.x = this.px = fx; this.y = this.py = fy;
          this.vx = 0; this.vy = Math.min(this.vy, -1);
          this.world.particles.fire(this.x, this.y, 14);
          this.world.audio.play('teleport');
        }
        break;
      }
      case 'hook_grapple': {
        if (this.hookPull) {
          const dx = this.hookPull.x - this.x, dy = this.hookPull.y - this.y;
          const d = Math.hypot(dx, dy);
          if (d < 26 || f > m.startup + m.active + m.recovery - 4) {
            this.hookPull = null;
            this.vx *= 0.5; this.vy = Math.min(this.vy, 0);
          } else {
            this.vx = dx / d * 13;
            this.vy = dy / d * 13;
            this.vy += 0; // ignore gravity during pull
            if (f % 2 === 0) this.world.particles.dashTrail(this.x, this.y, dx, dy, this.cfg.info.colors.glow);
          }
        }
        break;
      }
      case 'titan_slam': {
        if (f === 4) { this.vy = -8.5; this.grounded = false; }
        // spawn window spans the whole move: the hop lands well after active frames end
        if (this.grounded && f > 6 && f < m.startup + m.active + m.recovery) {
          // slam landed: shockwave fx + long-range ground waves both directions
          this.world.shake(0.6);
          this.world.audio.play('hit3');
          this.world.particles.dust(this.x, this.y + this.h / 2, 0, 14);
          this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + this.h / 2, maxLife: 16, size: 8, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
          if (!this.waveSpawned) {
            this.waveSpawned = true;
            this.world.spawnProjectile(this, TITAN_SLAM_WAVE, this.facing);
            this.world.spawnProjectile(this, TITAN_SLAM_WAVE, (-this.facing) as 1 | -1);
          }
        }
        break;
      }
      case 'titan_quake': {
        if (f === m.startup + 2 && this.grounded && !this.waveSpawned) {
          this.waveSpawned = true;
          this.world.spawnProjectile(this, TITAN_QUAKE_WAVE, this.facing);
        }
        break;
      }
      case 'ember_flare': {
        if (f === m.startup) {
          this.world.particles.fire(this.x, this.y, 20);
          this.world.audio.play('charge_release');
        }
        break;
      }
      case 'hook_trap': {
        if (f === m.startup) {
          this.world.spawnTrap(this);
        }
        break;
      }
      // ---- NOVA ----
      case 'nova_comet': {
        // stardust trail while cometing
        if (f >= m.startup && f <= m.startup + m.active + 4) {
          this.world.particles.emit({ type: 'glow', x: this.x - this.vx * 1.2, y: this.y + rand(-8, 8), maxLife: 18, size: 5.5, color: this.cfg.info.colors.glow, vx: -this.vx * 0.1, vy: rand(-0.4, 0.4) });
        }
        break;
      }
      case 'nova_rise': {
        if (f <= m.startup + m.active + 8 && this.vy < 0) {
          this.world.particles.emit({ type: 'glow', x: this.x + rand(-7, 7), y: this.y + 12, maxLife: 20, size: 6, color: this.cfg.info.colors.glow, vx: rand(-0.5, 0.5), vy: 1.2 });
        }
        break;
      }
      case 'nova_well': {
        if (f === m.startup) this.world.audio.play('trap');
        break;
      }
      // ---- VOLT ----
      case 'volt_dash': {
        if (f >= m.startup && f <= m.startup + m.active) {
          this.world.particles.dashTrail(this.x, this.y, -this.vx, 0, this.cfg.info.colors.glow);
          if (f % 3 === 0) {
            this.world.particles.emit({ type: 'spark', x: this.x + rand(-9, 9), y: this.y + rand(-14, 14), maxLife: 9, size: 4, color: this.cfg.info.colors.glow, vx: -this.vx * 0.15, vy: rand(-0.5, 0.5) });
          }
        }
        break;
      }
      case 'volt_thunder': {
        if (f === m.startup + 1) {
          this.world.shake(0.3);
          for (let i = 0; i < 5; i++) {
            this.world.particles.emit({ type: 'spark', x: this.x + rand(-16, 16), y: this.y - rand(0, 30), maxLife: 12, size: 5, color: this.cfg.info.colors.glow, vx: rand(-1, 1), vy: rand(-2.5, -0.5) });
          }
        }
        break;
      }
      case 'volt_field': {
        if (f === m.startup + 2) {
          this.world.shake(0.28);
          this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + 6, maxLife: 16, size: 30, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.world.particles.emit({ type: 'spark', x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20, maxLife: 12, size: 4, color: this.cfg.info.colors.glow, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2 });
          }
        }
        break;
      }
      // ---- FROST ----
      case 'frost_slide': {
        if (f >= m.startup && f <= m.startup + m.active && this.grounded && f % 2 === 0) {
          this.world.particles.emit({ type: 'dust', x: this.x, y: this.y + this.h / 2 - 2, vx: -this.facing * rand(0.5, 1.5), vy: rand(-1.2, -0.2), maxLife: 16, size: rand(2.5, 4.5), color: 'rgba(190,240,255,0.9)' });
        }
        break;
      }
      case 'frost_rise': {
        if (f <= m.startup + m.active + 8 && this.vy < 0 && f % 2 === 0) {
          this.world.particles.emit({ type: 'icicle_frag', x: this.x + rand(-8, 8), y: this.y + 14, vx: rand(-0.5, 0.5), vy: rand(0.5, 1.6), maxLife: 18, size: rand(3, 6), color: this.cfg.info.colors.glow });
        }
        break;
      }
      case 'frost_nova': {
        if (f === m.startup) {
          this.world.shake(0.45);
          this.world.audio.play('charge_release');
          this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + 4, maxLife: 20, size: 36, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.world.particles.emit({ type: 'icicle_frag', x: this.x + Math.cos(a) * 18, y: this.y + Math.sin(a) * 16, vx: Math.cos(a) * 2.6, vy: Math.sin(a) * 2.2 - 0.6, maxLife: 20, size: rand(4, 7), color: this.cfg.info.colors.glow });
          }
        }
        break;
      }
      // ---- WRAITH ----
      case 'wraith_phase': {
        if (f === Math.max(1, m.startup - 1)) {
          // afterimage blink burst
          for (let i = 1; i <= 3; i++) {
            this.world.particles.emit({ type: 'glow', x: this.x - this.facing * 10 * i, y: this.y + rand(-10, 10), maxLife: 16, size: 7 - i, color: this.cfg.info.colors.glow, vx: -this.facing * 0.6, vy: rand(-0.3, 0.3) });
          }
          this.world.audio.play('teleport');
        }
        break;
      }
      case 'wraith_ascent': {
        if (this.vy < 0 && f % 2 === 0) {
          this.world.particles.emit({ type: 'glow', x: this.x + rand(-8, 8), y: this.y + 14, maxLife: 18, size: 6, color: this.cfg.info.colors.glow, vx: rand(-0.4, 0.4), vy: 0.8 });
        }
        break;
      }
      case 'wraith_spikes': {
        if (f === m.startup) {
          this.world.spawnVoidSpikes(this);
        }
        break;
      }
    // ---- SERAPH ----
      case 'seraph_charge': {
        if (f >= m.startup && f <= m.startup + m.active) {
          // golden light streak behind the charge
          this.world.particles.emit({ type: 'glow', x: this.x - this.facing * 10, y: this.y + rand(-6, 6), maxLife: 16, size: 6, color: '#ffe08a', vx: -this.facing * 1.2, vy: rand(-0.3, 0.3) });
        }
        break;
      }
      case 'seraph_beam': {
        if (f === m.startup) {
          this.world.shake(0.2);
          for (let i = 0; i < 6; i++) {
            this.world.particles.emit({ type: 'spark', x: this.x + this.facing * rand(10, 24), y: this.y + rand(-8, 8), maxLife: 9, size: 4, color: '#ffe08a', vx: this.facing * rand(1.5, 3.5), vy: rand(-0.8, 0.8) });
          }
        }
        break;
      }
      case 'seraph_wings': {
        if (this.vy < 0 && f % 2 === 0) {
          // falling golden feathers
          this.world.particles.emit({ type: 'glow', x: this.x + rand(-16, 16), y: this.y + 10, maxLife: 26, size: 3.4, color: '#fff6d9', vx: rand(-0.6, 0.6), vy: rand(0.4, 1.1), drag: 0.98 });
        }
        break;
      }
      case 'seraph_ward': {
        if (f === m.startup) this.world.spawnLightWard(this);
        break;
      }
      // ---- VIPER ----
      case 'viper_pounce': {
        if (f >= m.startup && f <= m.startup + m.active) {
          this.world.particles.emit({ type: 'glow', x: this.x - this.facing * 8, y: this.y + rand(-4, 8), maxLife: 14, size: 5, color: '#aef65c', vx: -this.facing * 0.8, vy: rand(-0.4, 0.2) });
        }
        break;
      }
      case 'viper_dash': {
        if (f >= m.startup && f <= m.startup + m.active) {
          this.world.particles.dashTrail(this.x, this.y, -this.vx, 0, '#aef65c');
          if (f % 2 === 0) {
            this.world.particles.emit({ type: 'glow', x: this.x, y: this.y + rand(-6, 10), maxLife: 12, size: 4, color: '#aef65c', vx: -this.facing * 1.4, vy: rand(-0.3, 0.3) });
          }
        }
        break;
      }
      case 'viper_coil': {
        if (this.vy < 0 && f % 2 === 0) {
          this.world.particles.emit({ type: 'glow', x: this.x + rand(-10, 10), y: this.y + 14, maxLife: 16, size: 5, color: '#aef65c', vx: rand(-0.4, 0.4), vy: 0.9 });
        }
        break;
      }
      case 'viper_snare': {
        if (f === m.startup) {
          this.world.spawnTrap(this); // viper-owner traps auto-style as venom pools
        }
        break;
      }
      // ---- TEMPEST ----
      case 'tempest_twister': {
        // rising twin-spiral: swirling wind trail + lift gusts
        if (this.vy < 0 && f % 2 === 0) {
          const a = f * 0.55;
          this.world.particles.emit({ type: 'glow', x: this.x + Math.cos(a) * 13, y: this.y + 10 + (f % 6), maxLife: 18, size: 5, color: this.cfg.info.colors.glow, vx: Math.cos(a) * 0.7, vy: 0.9, drag: 0.96 });
          this.world.particles.emit({ type: 'glow', x: this.x - Math.cos(a) * 13, y: this.y + 14 - (f % 6), maxLife: 18, size: 4.5, color: '#eafaff', vx: -Math.cos(a) * 0.7, vy: 0.8, drag: 0.96 });
        }
        break;
      }
      case 'tempest_dive': {
        // Zephyr Dive: steep dive kick — heavy shock dust on touchdown
        if (f === m.startup) {
          this.vy = 7.4;
          this.vx = this.facing * 5.6;
          this.grounded = false;
          this.world.emitSfx('gust');
        }
        if (f > m.startup && !this.grounded && f % 2 === 0) {
          this.world.particles.emit({ type: 'glow', x: this.x, y: this.y + 12, maxLife: 12, size: 4.5, color: this.cfg.info.colors.glow, vx: -this.facing * 0.5, vy: -0.6 });
        }
        if (this.grounded && f > m.startup + 2) {
          // landed: wind shock ring, end the dive early
          this.world.shake(0.3);
          this.world.particles.dust(this.x, this.y + this.h / 2, 0, 10);
          this.world.particles.emit({ type: 'ring', x: this.x, y: this.y + this.h / 2 - 2, maxLife: 15, size: 8, color: this.cfg.info.colors.glow, vx: 0, vy: 0, drag: 1 });
          this.cancelMove();
          this.state = 'land';
          this.stateTimer = 8;
        }
        break;
      }
      case 'tempest_gale': {
        // Gale Burst muzzle swirl
        if (f === m.startup + 1) {
          for (let i = 0; i < 6; i++) {
            this.world.particles.emit({ type: 'glow', x: this.x + this.facing * rand(6, 18), y: this.y + rand(-10, 10), maxLife: 12, size: rand(3.5, 6), color: '#eafaff', vx: this.facing * rand(1.5, 3.4), vy: rand(-0.8, 0.8) });
          }
        }
        break;
      }
      // ---- JAEGER ----
      case 'jaeger_scatter': {
        if (f === m.startup + 1) {
          this.world.shake(0.22);
          this.world.particles.hitBurst(this.x + this.facing * 20, this.y, this.facing > 0 ? 0 : 180, 0.7, '#ffb347', 0.8);
        }
        break;
      }
      case 'jaeger_snare': {
        if (f === m.startup) {
          this.world.spawnBearTrap(this);
        }
        break;
      }
      case 'jaeger_bolts': {
        if (f === m.startup + 1) {
          this.world.particles.emit({ type: 'spark', x: this.x + this.facing * 16, y: this.y - 4, maxLife: 8, size: 3.4, color: '#ffe9c2', vx: this.facing * 2.2, vy: 0 });
        }
        break;
      }
      default: break;
    }
    void input;
  }

  // ================= GRAB =================

  private updateGrabbing(input: InputState) {
    const victim = this.grabTarget;
    if (!victim || victim.grabbedBy !== this || victim.state !== 'grabbed') {
      this.grabTarget = null;
      this.state = 'idle';
      this.stateTimer = 10;
      return;
    }
    this.grabTimer--;
    this.vx -= clamp(this.vx, -this.stats.friction, this.stats.friction);
    // hold victim
    victim.x = this.x + this.facing * 26 * this.scale;
    victim.y = this.y - 4;
    victim.vx = 0; victim.vy = 0;
    victim.facing = (-this.facing) as 1 | -1;

    if (this.grabTimer <= 0) {
      this.releaseGrab(true);
      return;
    }
    // throws
    const ax = input.axisX, ay = input.axisY;
    if (input.pressed.attack || input.pressed.grab) {
      this.performThrow('f');
      return;
    }
    if (ax > 0.4 || ax < -0.4) {
      const fwd = (ax > 0 ? 1 : -1) === this.facing;
      this.performThrow(fwd ? 'f' : 'b');
      return;
    }
    if (ay < -0.4) { this.performThrow('u'); return; }
    if (ay > 0.4) { this.performThrow('d'); return; }
  }

  performThrow(dir: 'f' | 'b' | 'u' | 'd') {
    const victim = this.grabTarget;
    if (!victim) return;
    const t = this.cfg.throws[dir];
    this.grabTarget = null;
    this.state = 'attack';
    this.stateTimer = 0;
    this.move = { ...this.cfg.moves['grab'], id: 'throw_' + dir, kind: 'throw', startup: 6, active: 2, recovery: 16 };
    this.moveFrame = 0;
    this.moveHitId = MOVE_INSTANCE++;
    this.world.emitSfx('throw');
    victim.grabbedBy = null;
    victim.state = 'launch';
    victim.comboable = false;
    const dirSign = dir === 'b' ? -this.facing : this.facing;
    const angle = dir === 'u' ? 88 : dir === 'd' ? 70 : dir === 'f' ? 42 : 40;
    victim.applyKnockback(t.dmg, angle, t.bkb, t.kbg, dirSign, this, null);
    victim.grabTimer = 0;
    this.world.particles.hitBurst(victim.x, victim.y, dir === 'u' ? 90 : dir === 'd' ? -60 : (dirSign > 0 ? 20 : 160), 0.5, this.cfg.info.colors.glow, 0.7);
  }

  releaseGrab(penalty: boolean) {
    const victim = this.grabTarget;
    if (victim) {
      victim.grabbedBy = null;
      victim.state = 'air';
      victim.vy = -3;
      victim.vx = -this.facing * 2;
      victim.hitstun = 0;
    }
    this.grabTarget = null;
    this.state = penalty ? 'land' : 'idle';
    this.stateTimer = penalty ? 14 : 4;
  }

  private updateGrabbed() {
    // mashing shortens
    if (this.input.pressed.attack || this.input.pressed.jump || this.input.axisX !== 0 || this.input.axisY !== 0) {
      this.grabTimer -= 3;
    }
    this.grabTimer--;
    if (this.grabTimer <= 0 && this.grabbedBy) {
      this.grabbedBy.releaseGrab(true);
      this.grabbedBy = null;
      this.state = 'air';
    }
  }

  // ================= HITSTUN / KNOCKBACK =================

  applyKnockback(dmg: number, angleDeg: number, bkb: number, kbg: number, dirSign: number, attacker: Fighter | null, move: MoveData | null): number {
    const ctx: HitContext = { dmg, kb: 0, move, strong: !!move?.strong };

    // ---- trait modifiers: attacker's kit scales output, victim's kit scales input ----
    let dmgMul = 1, kbMul = 1, noLaunch = false;
    if (attacker) {
      const out = attacker.traitSpec.outgoing?.(attacker, this, attacker.trait, ctx);
      if (out) { dmgMul *= out.dmg ?? 1; kbMul *= out.kb ?? 1; }
    }
    const inc = this.traitSpec.incoming?.(this, attacker, this.trait, { ...ctx, dmg: dmg * dmgMul });
    if (inc) { dmgMul *= inc.dmg ?? 1; kbMul *= inc.kb ?? 1; noLaunch = !!inc.noLaunch; }

    const finalDmg = dmg * dmgMul;
    this.damage = Math.min(999, this.damage + finalDmg);

    // ---- knockback (see core/constants: knockbackOf) ----
    let kb = knockbackOf(this.damage, finalDmg, bkb, kbg, this.stats.weight) * kbMul;
    if (this.armorActive) kb *= 0.35;
    // RAGE: a damaged fighter hits harder — built-in comeback pressure
    if (attacker) kb *= 1 + clamp((attacker.damage - KB.rageStart) / 320, 0, KB.rageMax);
    if (noLaunch) kb = Math.min(kb, 3.2);
    kb = Math.min(kb, KB.max);
    ctx.kb = kb;

    // being launched releases a ledge hang
    if (this.ledge) this.clearLedge(20);

    // ---- DI: held input bends the launch angle up to DI.maxAngle degrees ----
    let angle = angleDeg;
    const rad0 = angleDeg * Math.PI / 180;
    if (Math.abs(Math.cos(rad0)) >= 0.6) {
      const di = clamp(this.input.axisY, -1, 1) * -DI.maxAngle;
      angle = clamp(angleDeg + di, 4, 88);
      this.lastDI = Math.abs(di);
    } else {
      const di = clamp(this.input.axisX * dirSign, -1, 1) * DI.maxAngle;
      angle = clamp(angleDeg - di, 18, 90);
      this.lastDI = Math.abs(di);
    }

    const rad = angle * Math.PI / 180;
    this.vx = Math.cos(rad) * kb * dirSign;
    this.vy = -Math.sin(rad) * kb;
    if (!noLaunch) this.grounded = false;

    this.hitstun = hitstunOf(kb, finalDmg);
    // Only genuinely strong hits tumble. Everything below the threshold leaves
    // the victim in plain hitstun near the attacker — that is the combo game.
    this.state = tumbles(kb) ? 'launch' : 'hitstun';
    this.sdiBudget = DI.sdiMax;
    this.hitFlash = 5;
    this.cancelMove();
    this.shielding = false;
    this.fastFalling = false;
    // NOTE: recovery resources are deliberately NOT refunded here. Getting hit
    // offstage has to be dangerous or edgeguarding is worthless.
    if (this.grounded === false && this.jumpsUsed === 0 && kb > 6) this.jumpsUsed = 1;

    if (attacker) {
      this.lastHitBy = attacker;
      this.lastHitTime = this.world.tick;
      if (this.comboable) attacker.comboCount++; else attacker.comboCount = 1;
      attacker.comboBest = Math.max(attacker.comboBest, attacker.comboCount);
      attacker.damageDealt += finalDmg;
      attacker.traitSpec.onLandHit?.(attacker, this, attacker.trait, { ...ctx, dmg: finalDmg });
      this.traitSpec.onTakeHit?.(this, attacker, this.trait, { ...ctx, dmg: finalDmg });
    }
    return kb;
  }

  private updateHitstun() {
    this.hitstun--;
    this.stateTimer++;
    // continuous DI drift: held perpendicular input bends the flight path (smash-style drift DI)
    if (this.state === 'launch' && this.hitstun > 6) {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 5) {
        const horiz = Math.abs(this.vx) > Math.abs(this.vy);
        const steerAmt = (horiz ? this.input.axisY * -0.013 : this.input.axisX * 0.011) * Math.min(1, speed / 14);
        if (steerAmt !== 0) {
          const nx = this.vx / speed, ny = this.vy / speed;
          this.vx += -ny * steerAmt * speed;
          this.vy += nx * steerAmt * speed;
          this.lastDI = Math.max(this.lastDI, Math.abs(steerAmt) * 57);
        }
      }
    }
    if (this.state === 'launch' && this.world.tick % 2 === 0 && Math.hypot(this.vx, this.vy) > 7) {
      this.world.particles.launchTrail(this.x, this.y, this.lastHitBy?.cfg.info.colors.glow ?? '#ffffff');
    }
    if (this.hitstun <= 0) {
      this.endCombo();
      this.state = this.grounded ? 'idle' : 'air';
      this.hitstun = 0;
      // tech-ish: brief leniency
      this.stateTimer = 0;
    }
  }

  // ================= RESPAWN =================

  private updateRespawn(input: InputState) {
    this.stateTimer--;
    // hover at spawn
    this.vy = 0; this.vx = 0;
    if (input.axisX !== 0) { this.x += input.axisX * 3; this.facing = input.axisX > 0 ? 1 : -1; }
    if (input.held.down || input.pressed.jump || input.pressed.attack || this.stateTimer <= 0) {
      this.state = 'air';
      this.respawnLift = false;
      this.dropThrough = 8;
    }
  }

  // ================= COMBAT ENTRY POINTS (called by Match) =================

  getHurtboxes(): { x: number; y: number; r: number }[] {
    const s = this.scale;
    if (this.state === 'crouch') {
      return [
        { x: this.x, y: this.y + 8 * s, r: 16 * s },
        { x: this.x, y: this.y - 4 * s, r: 13 * s },
      ];
    }
    // three stacked circles close the old torso/head gap — hits that LOOK connected always connect
    return [
      { x: this.x, y: this.y + 12 * s, r: 12.5 * s },   // legs
      { x: this.x, y: this.y - 1 * s, r: 16 * s },      // torso
      { x: this.x, y: this.y - 18 * s, r: 11.5 * s },   // head
    ];
  }

  getShieldRadius(): number {
    return (13 + 15 * (this.shieldHp / this.shieldMax)) * this.scale;
  }

  /**
   * Weapon-motion hitbox path: where is hitbox `hb` of move `m` at frame `f`?
   * Returns local (pre-facing) offsets + local swing angle at this instant.
   * - sweep: hitbox travels along an arc (degrees 0=fwd 90=up 180=behind 270=down)
   * - thrust/extend: hitbox distance grows from near to far (real spear reach)
   * - spin: hitbox orbits the body (turns)
   * Public: also used by combat.swingFXSpec for net-replicated FX.
   */
  motionOffset(hb: HitboxDef, m: MoveData, f: number, wreach: number): { dx: number; dy: number; ang: number } {
    const mo = m.motion;
    const woff = wreach * WEAPON_REACH_OFFSET;   // center push — matches visual weapon length
    const baseAng = Math.atan2(-hb.y, hb.x); // local angle of this hitbox (screen-y down → negate)
    const dist = Math.hypot(hb.x, hb.y);
    let dx = hb.x, dy = hb.y, ang = baseAng;
    if (mo) {
      const t = clamp((f - m.startup - 1) / Math.max(1, m.active - 1), 0, 1); // 0..1 across active
      if (mo.kind === 'spin') {
        const a = baseAng + t * Math.PI * 2 * (mo.turns ?? 1);
        const d = Math.max(dist, hb.r) + woff;
        dx = Math.cos(a) * d; dy = -Math.sin(a) * d;
        ang = a;
      } else if (mo.sweep) {
        const deg = mo.sweep[0] + (mo.sweep[1] - mo.sweep[0]) * t;
        const a = (deg * Math.PI) / 180;
        const d = Math.max(dist, hb.r * 0.55) + woff;
        dx = Math.cos(a) * d; dy = -Math.sin(a) * d;
        ang = a;
      } else if (mo.extend) {
        const mm = mo.extend[0] + (mo.extend[1] - mo.extend[0]) * t;
        dx = Math.cos(baseAng) * (dist + woff) * mm;
        dy = -Math.sin(baseAng) * (dist + woff) * mm;
        ang = baseAng;
      } else {
        dx = Math.cos(baseAng) * (dist + woff);
        dy = -Math.sin(baseAng) * (dist + woff);
      }
    } else {
      dx = Math.cos(baseAng) * (dist + woff);
      dy = -Math.sin(baseAng) * (dist + woff);
    }
    return { dx, dy, ang };
  }

  getActiveHitboxes(): ActiveHitbox[] {
    if (this.state !== 'attack' || !this.move || this.hitstop > 0) return [];
    const m = this.move;
    const f = this.moveFrame;
    if (f <= m.startup || f > m.startup + moveActive(m)) return [];
    const s = this.scale;
    // charge scaling
    let dmgMul = 1, kbMul = 1;
    if (m.chargeable) {
      const c = m.chargeable;
      const ratio = clamp(this.chargeFrames / (c.maxF - c.minF), 0, 1);
      dmgMul = 1 + (c.dmgMul - 1) * ratio;
      kbMul = 1 + (c.kbMul - 1) * ratio;
    }
    // sweetspot: the earliest active frames land harder (skill: time the tip/first frames)
    const sweet = !!m.sweetspot && f <= m.startup + m.sweetspot.frames;
    if (sweet && m.sweetspot) { dmgMul *= m.sweetspot.dmgMul; kbMul *= m.sweetspot.kbMul; }
    const out: ActiveHitbox[] = [];
    if (m.hitboxes) {
      // signature weapon extends melee reach (grabs stay honest but +3 keeps them usable)
      const isGrab = m.kind === 'grab' || m.kind === 'throw';
      const wreach = isGrab ? 0 : (this.cfg.weapon?.reach ?? 0);
      // kits can extend grab reach (HOOK's chain) — grabs were used in 0.3% of
      // all move starts before this, largely because they whiffed at any range
      const grabMul = isGrab ? (this.traitSpec.grabRangeMul?.(this, this.trait) ?? 1) : 1;
      for (const hb of m.hitboxes) {
        // weapon-motion path: sweep arcs / thrust extensions / spins move the hitbox each frame
        const off = isGrab
          ? { dx: (hb.x + wreach + 3) * grabMul, dy: hb.y, ang: 0 }
          : this.motionOffset(hb, m, f, wreach);
        // previous-frame path point → swept capsule (fast swings can no longer tunnel past a body)
        const prev = isGrab
          ? { dx: (hb.x + wreach + 3) * grabMul, dy: hb.y }
          : this.motionOffset(hb, m, f - 1, wreach);
        const px = this.px + prev.dx * s * this.facing;
        const py = this.py + prev.dy * s;
        out.push({
          x: this.x + off.dx * s * this.facing,
          y: this.y + off.dy * s,
          r: (hb.r * HITBOX_BOOST + wreach * WEAPON_REACH_RADIUS) * s * grabMul,
          px, py,
          dmg: (hb.dmg ?? m.damage) * dmgMul,
          angle: hb.angle ?? m.angle,
          bkb: (hb.bkb ?? m.bkb) * kbMul,
          kbg: (hb.kbg ?? m.kbg) * kbMul,
          hitstunMul: m.hitstunMul ?? 1,
          grab: m.kind === 'grab',
          strong: !!m.strong || sweet,
          sweetspot: sweet,
          venom: !!m.venom,
          move: m,
          hitId: this.moveHitId,
        });
      }
    }
    return out;
  }

  takeShieldHit(dmg: number, shieldstunF: number, dirSign: number) {
    this.shieldHp -= dmg * SHIELD.dmgMul;
    // Crucially the shield STAYS UP. Holding block through a multi-hit string is
    // how blockstrings work; dropping it on frame one made shielding pointless.
    this.state = 'shield';
    this.shielding = true;
    this.stateTimer = shieldstunF;
    this.shieldStun = shieldstunF;
    this.vx += dirSign * Math.min(4, dmg * 0.35);
    this.hitstop = Math.min(8, 2 + dmg * 0.3);
    this.world.audio.play('shield_hit');
    this.world.particles.shieldHit(this.x + dirSign * 16, this.y, this.cfg.info.colors.glow);
    this.traitSpec.onShieldHit?.(this, this.trait, dmg);
    if (this.shieldHp <= 0) this.breakShield();
  }

  /** frames of shieldstun remaining — blocks OOS actions but keeps the shield up */
  shieldStun = 0;

  onParry(attacker: Fighter | null) {
    this.shieldStun = 0;
    this.stateTimer = 0;
    void attacker;
    this.traitSpec.onParry?.(this, this.trait);
  }

  hitstopFor(dmg: number, strong: boolean): number {
    return Math.round(clamp(HITSTOP_BASE + dmg * HITSTOP_PER_PCT, 4, HITSTOP_MAX) * (strong ? 1.25 : 1));
  }

  applyHitstop(frames: number) { this.hitstop = Math.max(this.hitstop, frames); }

  /** CLIENT NETPLAY: snap this fighter to a host snapshot (no simulation). */
  applyNetState(s: NetFighterState) {
    this.px = this.x; this.py = this.y;
    this.x = s.x; this.y = s.y;
    this.vx = s.vx; this.vy = s.vy;
    this.facing = s.fc >= 0 ? 1 : -1;
    const st = FIGHTER_STATES[s.st] ?? 'idle';
    if (s.mv) {
      const mv = this.cfg.moves[s.mv] ?? (s.mv.startsWith('throw_')
        ? { ...this.cfg.moves['grab'], id: s.mv, kind: 'throw' as const, startup: 6, active: 2, recovery: 16 }
        : null);
      if (mv) {
        if (this.move?.id !== mv.id) {
          this.move = mv;
          this.moveFrame = s.mf;
          this.chargeFrames = s.ch;
          this.hitVictims.clear();
        } else {
          this.moveFrame = s.mf;
          this.chargeFrames = s.ch;
        }
      }
    } else if (this.move) {
      this.move = null;
      this.armorActive = false;
      this.counterWindow = false;
    }
    if (this.state !== st) {
      this.state = st;
    }
    this.damage = s.dm;
    this.stocks = s.sk;
    this.shieldHp = s.sh;
    this.hitFlash = Math.max(this.hitFlash, s.hf);
    this.grounded = s.gr > 0;
    this.jumpsUsed = s.jw;
    this.invuln = s.iv;
    this.poison = s.po;
    if (s.po > 0) this.poisonTimer = Math.max(this.poisonTimer, 60);
    this.armorActive = s.arm > 0;
    this.counterWindow = s.cw > 0;
    if (s.tc !== undefined) this.techCount = s.tc;
  }

  // ================= STATUS EFFECTS (applied by other fighters' kits) =================

  /** Poison stacks up to five and lifesteals back to whoever applied it (VIPER). */
  applyPoison(stacks: number, owner?: Fighter | null) {
    if (this.id === 'viper') return;                    // VIPER passive: immune
    this.poison = Math.min(4, this.poison + stacks);
    this.poisonTimer = Math.max(this.poisonTimer, 330);
    if (owner) this.poisonOwner = owner;
    this.statusFlash = 12;
  }

  /** Burn is a short, hot DoT with no lifesteal (EMBER). */
  applyBurn(seconds: number) {
    if (this.id === 'ember' || this.id === 'viper') return;
    this.burn = Math.max(this.burn, Math.round(seconds * 60));
    this.statusFlash = 12;
  }

  /** Shocked targets take more from the fighter who marked them (VOLT). */
  applyShock(frames: number) {
    if (this.id === 'volt') return;
    this.shock = Math.max(this.shock, frames);
  }

  /** Chill slows, and the fourth stack freezes the victim solid (FROST). */
  applyChill(stacks: number) {
    if (this.id === 'frost') return;
    this.chill = Math.min(4, this.chill + stacks);
    this.chillTimer = 360;
    this.statusFlash = 12;
    if (this.chill >= 4 && this.frozen <= 0 && this.state !== 'ko' && this.state !== 'respawn') {
      this.frozen = 36;
      this.cancelMove();
      this.state = 'dizzy';
      this.stateTimer = 36;
      this.world.emitSfx('shield_break');
      this.world.particles.emit({ type: 'ring', x: this.x, y: this.y, maxLife: 18, size: 11, color: '#9fe8ff', vx: 0, vy: 0, drag: 1 });
    }
  }

  /** VOLT's chain lightning fork — damage without a full launch. */
  applyChainLightning(source: Fighter, dmg: number) {
    this.damage = Math.min(999, this.damage + dmg);
    this.applyShock(180);
    this.hitstun = Math.max(this.hitstun, 12);
    this.state = 'hitstun';
    this.hitFlash = 4;
    this.vy = Math.min(this.vy, -2);
    source.damageDealt += dmg;
    this.world.particles.hitBurst(this.x, this.y, 90, 0.4, '#7cf3ff', 1);
    for (let i = 0; i < 5; i++) {
      this.world.particles.emit({
        type: 'spark', x: this.x + rand(-14, 14), y: this.y + rand(-20, 16),
        maxLife: 10, size: 3.6, color: '#7cf3ff', vx: rand(-2.5, 2.5), vy: rand(-2.5, 2.5),
      });
    }
  }

  /** SERAPH's ascended aura — chip damage, no knockback, no hitstun. */
  applyAuraTick(source: Fighter, dmg: number) {
    this.damage = Math.min(999, this.damage + dmg);
    source.damageDealt += dmg;
    this.world.particles.emit({
      type: 'glow', x: this.x + rand(-10, 10), y: this.y + rand(-16, 10),
      maxLife: 16, size: 4, color: '#ffe08a', vx: 0, vy: -0.7,
    });
  }

  private updateStatusEffects() {
    if (this.state === 'ko' || this.state === 'respawn') {
      this.burn = 0; this.poison = 0; this.chill = 0; this.shock = 0; this.frozen = 0;
      return;
    }
    // poison: slow attrition, lifesteals to the applier
    if (this.poison > 0 && this.poisonTimer > 0) {
      this.poisonTimer--;
      if (this.poisonTimer <= 0) { this.poison = 0; this.poisonOwner = null; }
      if (this.poisonTimer % 20 === 0) {
        const tick = this.poison * 0.22;
        this.damage = Math.min(999, this.damage + tick);
        if (this.poisonOwner && this.poisonOwner !== this) {
          this.poisonOwner.damageDealt += tick;
          this.poisonOwner.heal(tick * 0.2);
        }
        this.world.particles.emit({
          type: 'glow', x: this.x + rand(-8, 8), y: this.y + rand(-14, 6),
          maxLife: 22, size: rand(2.5, 4.5), color: '#aef65c', vx: rand(-0.2, 0.2), vy: rand(-1.4, -0.6), drag: 0.97,
        });
        if (this.poisonTimer % 60 === 0) this.world.audio.play('poison');
      }
    }
    // burn: fast, hot, short
    if (this.burn > 0) {
      this.burn--;
      if (this.burn % 10 === 0) {
        this.damage = Math.min(999, this.damage + 0.45);
        this.world.particles.emit({
          type: 'ember', x: this.x + rand(-9, 9), y: this.y + rand(-16, 8),
          maxLife: 18, size: rand(2.5, 4), color: '#ff8a3c', vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.7),
        });
      }
    }
    if (this.shock > 0) {
      this.shock--;
      if (this.shock % 16 === 0) {
        this.world.particles.emit({
          type: 'spark', x: this.x + rand(-12, 12), y: this.y + rand(-18, 12),
          maxLife: 7, size: 2.6, color: '#7cf3ff', vx: rand(-1, 1), vy: rand(-1, 1),
        });
      }
    }
    if (this.chill > 0 && this.frozen <= 0) {
      this.chillTimer--;
      if (this.chillTimer <= 0) { this.chill = Math.max(0, this.chill - 1); this.chillTimer = 200; }
    }
  }

  heal(amount: number) { this.damage = Math.max(0, this.damage - amount); }

  resetForRound(x: number, y: number, facing: 1 | -1) {
    this.spawnAt(x, y, facing);
  }
}

export function makeHitstop(attacker: Fighter, victim: Fighter, dmg: number, strong: boolean) {
  const f = attacker.hitstopFor(dmg, strong);
  attacker.applyHitstop(f);
  victim.applyHitstop(Math.round(f * 1.05));
}

export { HITSTOP_MAX };
