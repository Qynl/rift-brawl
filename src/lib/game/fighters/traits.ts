// ============ RIFT BRAWL — Signature Trait System ============
//
// Before this, the twelve brawlers differed only by numbers and move names:
// same resources (none), same rules, same decision space. Every one of them
// played identically once you learned the frame data.
//
// Each fighter now owns a SIGNATURE RESOURCE with its own generation rule,
// its own spend, its own failure state, and its own passive that changes how
// the base engine treats them. Nothing here is cosmetic — every hook below
// alters damage, knockback, mobility, survivability or option coverage.
//
// The system is deliberately data-driven and side-effect-local so the headless
// simulation (tools/sim) can measure the impact of every kit.

import type { Fighter } from './Fighter';
import type { FighterId, MoveData } from '../core/types';
import { clamp } from '../core/constants';

/** Mutable per-match state owned by a fighter's trait. */
export interface TraitRuntime {
  /** primary 0..1 resource shown on the HUD */
  meter: number;
  /** discrete charges (ammo, pips, wells) */
  charges: number;
  /** generic counter (combo-ish stacks) */
  stacks: number;
  /** generic countdown used by buff windows */
  timer: number;
  /** secondary countdown (cooldowns) */
  cooldown: number;
  /** true while the empowered/spent state is live */
  active: boolean;
  /** HUD pulse driver, decays on its own */
  flash: number;
}

export interface HitContext {
  dmg: number;
  kb: number;
  move: MoveData | null;
  strong: boolean;
}

export interface TraitSpec {
  id: string;
  /** short HUD label */
  label: string;
  /** name shown on the character-select kit card */
  name: string;
  /** what the resource does */
  desc: string;
  /** always-on rule change */
  passive: string;
  color: string;
  /** 0 = smooth bar, >0 = discrete pips */
  segments: number;
  /** starting charges */
  startCharges?: number;
  maxCharges?: number;
  /** start with a full bar */
  startFull?: boolean;

  /** every simulation frame, after hitstop */
  tick?(f: Fighter, t: TraitRuntime): void;
  /** f landed a clean hit on victim */
  onLandHit?(f: Fighter, victim: Fighter, t: TraitRuntime, ctx: HitContext): void;
  /** f was hit cleanly */
  onTakeHit?(f: Fighter, attacker: Fighter | null, t: TraitRuntime, ctx: HitContext): void;
  /** f's shield absorbed a hit */
  onShieldHit?(f: Fighter, t: TraitRuntime, dmg: number): void;
  /** f parried */
  onParry?(f: Fighter, t: TraitRuntime): void;
  /** f grabbed someone */
  onGrab?(f: Fighter, victim: Fighter, t: TraitRuntime): void;
  /** f KO'd victim */
  onKO?(f: Fighter, t: TraitRuntime): void;
  /** f lost a stock / respawned */
  onSpawn?(f: Fighter, t: TraitRuntime): void;
  /** f started a special; return a replacement move to override it */
  onSpecial?(f: Fighter, t: TraitRuntime, slot: 'n' | 's' | 'u' | 'd', move: MoveData): MoveData | null;
  /** scale this fighter's outgoing hit */
  outgoing?(f: Fighter, victim: Fighter, t: TraitRuntime, ctx: HitContext): { dmg?: number; kb?: number };
  /** scale a hit coming at this fighter */
  incoming?(f: Fighter, attacker: Fighter | null, t: TraitRuntime, ctx: HitContext): { dmg?: number; kb?: number; noLaunch?: boolean };
  /** extra mid-air jumps granted */
  extraJumps?(f: Fighter, t: TraitRuntime): number;
  /** movement multiplier (ground & air speed) */
  speedMul?(f: Fighter, t: TraitRuntime): number;
  /** grab hitbox radius multiplier */
  grabRangeMul?(f: Fighter, t: TraitRuntime): number;
  /** right-hand HUD caption */
  hudText?(f: Fighter, t: TraitRuntime): string;
}

export function newTraitRuntime(spec: TraitSpec): TraitRuntime {
  return {
    meter: spec.startFull ? 1 : 0,
    charges: spec.startCharges ?? 0,
    stacks: 0,
    timer: 0,
    cooldown: 0,
    active: false,
    flash: 0,
  };
}

// ---------------------------------------------------------------------------
//  shared helpers
// ---------------------------------------------------------------------------

const add = (t: TraitRuntime, n: number) => {
  const before = t.meter;
  t.meter = clamp(t.meter + n, 0, 1);
  if (t.meter >= 1 && before < 1) t.flash = 30;
};

function burst(f: Fighter, color: string, n: number, size = 5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    f.world.particles.emit({
      type: 'spark', x: f.x + Math.cos(a) * 16, y: f.y + Math.sin(a) * 16,
      maxLife: 16, size, color, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4,
    });
  }
  f.world.particles.emit({ type: 'ring', x: f.x, y: f.y, maxLife: 18, size: 9, color, vx: 0, vy: 0, drag: 1 });
}

/** empower a move in place: bigger, meaner, armoured */
function empower(move: MoveData, dmgMul: number, kbMul: number, color: string): MoveData {
  return {
    ...move,
    damage: move.damage * dmgMul,
    bkb: move.bkb * kbMul,
    kbg: move.kbg * kbMul,
    armor: true,
    strong: true,
    fxColor: color,
    hitboxes: move.hitboxes?.map(h => ({ ...h, r: h.r * 1.3, dmg: h.dmg !== undefined ? h.dmg * dmgMul : undefined })),
    projectile: move.projectile
      ? { ...move.projectile, dmg: move.projectile.dmg * dmgMul, r: move.projectile.r * 1.35, bkb: move.projectile.bkb * kbMul, kbg: move.projectile.kbg * kbMul, color }
      : undefined,
  };
}

// ===========================================================================
//  THE TWELVE KITS
// ===========================================================================

// --------------------------------------------------------------- VANGUARD
// Defensive charge battery. Rewards blocking rather than mashing.
const VANGUARD_TRAIT: TraitSpec = {
  id: 'aegis', label: 'AEGIS', name: 'Aegis Charge', color: '#5cffce', segments: 0,
  desc: 'Blocking, parrying and clean hits charge the Aegis. At full charge the next special becomes empowered: bigger hitbox, +45% power and super armour.',
  passive: 'Parry window is wider and a parry restores a quarter of the shield.',
  onLandHit(f, v, t) { add(t, 0.055); },
  onShieldHit(f, t) { add(t, 0.11); f.world.particles.emit({ type: 'glow', x: f.x, y: f.y, maxLife: 12, size: 7, color: '#5cffce', vx: 0, vy: 0 }); },
  onParry(f, t) { add(t, 0.3); f.shieldHp = Math.min(f.shieldMax, f.shieldHp + f.shieldMax * 0.25); },
  onSpecial(f, t, slot, move) {
    if (t.meter < 1) return null;
    t.meter = 0;
    t.flash = 24;
    burst(f, '#5cffce', 10, 6);
    f.world.emitSfx('charge_release');
    f.world.flash(0.16, '92,255,206');
    return empower(move, 1.45, 1.3, '#d9fff2');
  },
  hudText(f, t) { return t.meter >= 1 ? 'EMPOWERED' : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------ EMBER
// Risk/reward heat engine: melts opponents, melts herself.
const EMBER_TRAIT: TraitSpec = {
  id: 'overheat', label: 'HEAT', name: 'Overheat', color: '#ffb347', segments: 0,
  desc: 'Every special stokes the furnace. Above 70% heat Ember is SUPERHEATED: +32% damage and attacks set foes alight — but she takes 15% more knockback.',
  passive: 'Immune to lava. Fast-falls harder than anyone and cools down when she stops attacking.',
  tick(f, t) {
    if (f.state !== 'attack') add(t, -0.0022);
    t.active = t.meter >= 0.7;
    if (t.active && f.world.tick % 5 === 0) {
      f.world.particles.emit({
        type: 'ember', x: f.x + (Math.random() - 0.5) * 22, y: f.y + (Math.random() - 0.5) * 30,
        maxLife: 22, size: 3.2, color: '#ff8a3c', vx: (Math.random() - 0.5) * 0.6, vy: -0.9,
      });
    }
  },
  onLandHit(f, v, t) {
    add(t, 0.028);
    if (t.active) v.applyBurn(2);
  },
  onSpecial(f, t) { add(t, 0.1); return null; },
  outgoing(f, v, t) { return t.active ? { dmg: 1.32, kb: 1.12 } : {}; },
  incoming(f, a, t) { return t.active ? { kb: 1.15 } : {}; },
  hudText(f, t) { return t.active ? 'SUPERHEATED' : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------- HOOK
// Grapple specialist whose reach grows the more he commits to grabs.
const HOOK_TRAIT: TraitSpec = {
  id: 'tension', label: 'TENSION', name: 'Chain Tension', color: '#c99aff', segments: 0,
  desc: 'Landing grabs and projectiles winds the chain. Above half tension his grab reaches twice as far and throws deal +30%.',
  passive: 'Permanently +40% grab range, and grabs can be thrown out straight from a dash.',
  tick(f, t) { add(t, -0.0012); t.active = t.meter >= 0.5; },
  onGrab(f, v, t) { add(t, 0.18); },
  onLandHit(f, v, t, ctx) { if (ctx.move?.projectile) add(t, 0.12); },
  grabRangeMul(f, t) { return t.active ? 2 : 1.4; },
  outgoing(f, v, t, ctx) {
    return t.active && ctx.move?.kind === 'throw' ? { dmg: 1.3, kb: 1.2 } : {};
  },
  hudText(f, t) { return t.active ? 'CHAIN TAUT' : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------ TITAN
// Not "the heavy one" — a fighter with a second, regenerating health bar that
// converts small hits into nothing at all.
const TITAN_TRAIT: TraitSpec = {
  id: 'bulwark', label: 'BULWARK', name: 'Bulwark Plating', color: '#ffd166', segments: 0, startFull: true,
  desc: 'Plating soaks light blows outright: any hit under 9 damage does no knockback while the Bulwark holds. Each absorbed hit chips the plating.',
  passive: 'Plating repairs itself after 1.5 seconds without being hit. Cannot be knocked out of a grab by weak attacks.',
  tick(f, t) {
    if (t.cooldown > 0) t.cooldown--;
    else add(t, 0.0022);
  },
  onTakeHit(f, a, t, ctx) {
    t.cooldown = 90;
    add(t, -clamp(ctx.dmg * 0.055, 0.04, 0.5));
  },
  incoming(f, a, t, ctx) {
    if (t.meter > 0.02 && ctx.dmg < 9) {
      t.flash = 10;
      f.world.particles.emit({ type: 'ring', x: f.x, y: f.y, maxLife: 12, size: 7, color: '#ffd166', vx: 0, vy: 0, drag: 1 });
      return { kb: 0.12, noLaunch: true };
    }
    return {};
  },
  hudText(f, t) { return t.meter <= 0.02 ? 'BROKEN' : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------- NOVA
// Ammo-gated zoner: her specials are genuinely limited, so she has to earn
// neutral rather than hold a button.
const NOVA_TRAIT: TraitSpec = {
  id: 'starfall', label: 'STARS', name: 'Starfall Charges', color: '#b58cff', segments: 3, startCharges: 3, maxCharges: 3,
  desc: 'Three stars. Every special burns one. With no stars left her specials fizzle to 55% power and cast no projectile.',
  passive: 'Stars regenerate every 4.5 seconds, twice as fast while airborne. Best air acceleration in the game.',
  tick(f, t) {
    if (t.charges >= 3) { t.stacks = 0; t.meter = 1; return; }
    t.stacks += f.grounded ? 1 : 2;
    if (t.stacks >= 270) { t.stacks = 0; t.charges++; t.flash = 20; f.world.emitSfx('ui_move'); }
    t.meter = (t.charges + t.stacks / 270) / 3;
  },
  onSpecial(f, t, slot, move) {
    if (t.charges > 0) {
      t.charges--;
      t.flash = 14;
      return null;
    }
    // out of stars: a visibly weaker, projectile-less version
    return {
      ...move,
      damage: move.damage * 0.55,
      bkb: move.bkb * 0.6,
      kbg: move.kbg * 0.6,
      projectile: undefined,
      fxColor: '#6a5a8a',
      hitboxes: move.hitboxes?.map(h => ({ ...h, r: h.r * 0.8 })),
    };
  },
  hudText(f, t) { return `${t.charges}/3`; },
};

// ------------------------------------------------------------------- VOLT
// Movement is the resource. Standing still is a nerf.
const VOLT_TRAIT: TraitSpec = {
  id: 'static', label: 'STATIC', name: 'Static Build-up', color: '#7cf3ff', segments: 0,
  desc: 'Dashing and flying build static. At full charge the next hit forks lightning into everyone nearby and grants 2 seconds of overclocked speed.',
  passive: 'Hits leave the victim SHOCKED for 3s; every follow-up on a shocked target deals +20%.',
  tick(f, t) {
    if (t.timer > 0) { t.timer--; t.active = true; } else t.active = false;
    const moving = f.state === 'dash' || (!f.grounded && Math.abs(f.vx) > 1.5);
    if (moving) add(t, 0.0085);
    if (t.active && f.world.tick % 3 === 0) {
      f.world.particles.emit({
        type: 'spark', x: f.x + (Math.random() - 0.5) * 26, y: f.y + (Math.random() - 0.5) * 34,
        maxLife: 8, size: 3.4, color: '#7cf3ff', vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
      });
    }
  },
  onLandHit(f, v, t, ctx) {
    v.applyShock(180);
    if (t.meter >= 1) {
      t.meter = 0;
      t.timer = 120;
      t.flash = 30;
      f.world.emitSfx('counter');
      f.world.flash(0.2, '124,243,255');
      f.world.shake(0.4);
      // fork to every other nearby fighter
      for (const other of f.world.fighters) {
        if (other === f || other === v) continue;
        if (other.state === 'ko' || other.state === 'respawn' || other.invuln > 0) continue;
        if (Math.hypot(other.x - v.x, other.y - v.y) > 190) continue;
        other.applyChainLightning(f, ctx.dmg * 0.6);
      }
      burst(f, '#7cf3ff', 12, 5);
    } else {
      add(t, 0.05);
    }
  },
  outgoing(f, v, t) { return v.shock > 0 ? { dmg: 1.2, kb: 1.08 } : {}; },
  speedMul(f, t) { return t.active ? 1.22 : 1; },
  hudText(f, t) { return t.active ? 'OVERCLOCK' : t.meter >= 1 ? 'CHARGED' : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------ FROST
// Applies a debuff that changes how the *opponent* plays, not how Frost hits.
const FROST_TRAIT: TraitSpec = {
  id: 'permafrost', label: 'CHILL', name: 'Permafrost', color: '#9fe8ff', segments: 4,
  desc: 'Every hit chills the victim. Chill slows them 8% per stack; at four stacks they FREEZE solid and have to mash free.',
  passive: 'Never slips on ice, and takes 2% less damage for each chill stack currently on an opponent.',
  tick(f, t) {
    let worst = 0;
    for (const other of f.world.fighters) if (other !== f) worst = Math.max(worst, other.chill);
    t.charges = worst;
    t.meter = worst / 4;
  },
  onLandHit(f, v, t) { v.applyChill(1); },
  incoming(f, a, t) { return { dmg: 1 - t.charges * 0.02 }; },
  hudText(f, t) { return t.charges >= 4 ? 'FROZEN!' : `${t.charges}/4`; },
};

// ----------------------------------------------------------------- WRAITH
// Sustain fighter: converts damage dealt into health and intangibility.
const WRAITH_TRAIT: TraitSpec = {
  id: 'siphon', label: 'SOULS', name: 'Soul Siphon', color: '#b07cff', segments: 0,
  desc: 'Damage dealt feeds the Siphon. At half full, down-special phases him out — 0.5s intangible and heals 10%.',
  passive: 'After being hit he FADES: 12 frames of intangibility, once every 4 seconds.',
  tick(f, t) {
    if (t.cooldown > 0) t.cooldown--;
    if (t.timer > 0) { t.timer--; f.invuln = Math.max(f.invuln, 2); }
    t.active = t.meter >= 0.5;
  },
  onLandHit(f, v, t, ctx) { add(t, ctx.dmg * 0.006); },
  onTakeHit(f, a, t) {
    if (t.cooldown <= 0) {
      t.cooldown = 240;
      t.timer = 12;
      t.flash = 14;
      for (let i = 1; i <= 3; i++) {
        f.world.particles.emit({ type: 'glow', x: f.x - f.facing * 11 * i, y: f.y, maxLife: 16, size: 7 - i, color: '#b07cff', vx: -f.facing * 0.5, vy: 0 });
      }
    }
  },
  onSpecial(f, t, slot, move) {
    if (slot !== 'd' || t.meter < 0.5) return null;
    t.meter -= 0.5;
    t.timer = 30;
    t.flash = 20;
    f.heal(10);
    f.invuln = Math.max(f.invuln, 30);
    burst(f, '#b07cff', 10, 6);
    f.world.emitSfx('teleport');
    return null;
  },
  hudText(f, t) { return t.timer > 0 ? 'PHASED' : `${Math.floor(t.meter * 100)}%`; },
};

// ----------------------------------------------------------------- SERAPH
// Comeback engine: the more she is losing, the more dangerous she becomes.
const SERAPH_TRAIT: TraitSpec = {
  id: 'radiance', label: 'RADIANCE', name: 'Radiance', color: '#ffe08a', segments: 0,
  desc: 'Taking punishment fills the halo. At full she ASCENDS for 6 seconds: an extra jump, +22% damage and a searing aura that burns anyone close.',
  passive: 'Her heavy attacks gain super armour once the opponent is over 100%.',
  tick(f, t) {
    if (t.timer > 0) {
      t.timer--;
      t.active = true;
      if (f.world.tick % 12 === 0) {
        for (const other of f.world.fighters) {
          if (other === f || other.state === 'ko' || other.state === 'respawn' || other.invuln > 0) continue;
          if (Math.hypot(other.x - f.x, other.y - f.y) < 74) other.applyAuraTick(f, 0.9);
        }
      }
      if (f.world.tick % 4 === 0) {
        const a = Math.random() * Math.PI * 2;
        f.world.particles.emit({ type: 'glow', x: f.x + Math.cos(a) * 34, y: f.y + Math.sin(a) * 34, maxLife: 18, size: 4.5, color: '#ffe08a', vx: -Math.cos(a) * 0.5, vy: -Math.sin(a) * 0.5 });
      }
    } else if (t.active) {
      t.active = false;
    }
  },
  onTakeHit(f, a, t, ctx) { if (!t.active) add(t, ctx.dmg * 0.0085); },
  onSpecial(f, t) {
    if (t.meter < 1 || t.active) return null;
    t.meter = 0;
    t.timer = 360;
    t.active = true;
    t.flash = 34;
    f.world.emitSfx('victory');
    f.world.flash(0.24, '255,224,138');
    burst(f, '#ffe08a', 14, 7);
    return null;
  },
  outgoing(f, v, t) { return t.active ? { dmg: 1.22, kb: 1.12 } : {}; },
  extraJumps(f, t) { return t.active ? 1 : 0; },
  hudText(f, t) { return t.active ? `ASCENDED ${Math.ceil(t.timer / 60)}s` : `${Math.floor(t.meter * 100)}%`; },
};

// ------------------------------------------------------------------ VIPER
// Damage-over-time attrition with lifesteal — wins long games, loses fast ones.
const VIPER_TRAIT: TraitSpec = {
  id: 'venom', label: 'VENOM', name: 'Venom Glands', color: '#aef65c', segments: 5,
  desc: 'Hits inject venom, stacking five deep. Venom ticks damage no matter what the victim does, and Viper heals a quarter of everything it deals.',
  passive: 'Deals +25% to anything already poisoned, and is immune to poison and burn.',
  tick(f, t) {
    let worst = 0;
    for (const other of f.world.fighters) if (other !== f) worst = Math.max(worst, other.poison);
    t.charges = worst;
    t.meter = worst / 5;
  },
  onLandHit(f, v, t) { v.applyPoison(1, f); },
  outgoing(f, v, t) { return v.poison > 0 ? { dmg: 1.25 } : {}; },
  hudText(f, t) { return `${t.charges}/5`; },
};

// ---------------------------------------------------------------- TEMPEST
// Pure air-superiority kit: a flight resource instead of raw stats.
const TEMPEST_TRAIT: TraitSpec = {
  id: 'gale', label: 'GALE', name: 'Gale Reserve', color: '#bff3ff', segments: 3, startCharges: 3, maxCharges: 3,
  desc: 'Three gusts, spent with the dash button in mid-air for an instant omnidirectional air dash. They refill only while airborne.',
  passive: 'Four jumps instead of three, and half the landing lag of everyone else.',
  tick(f, t) {
    if (f.grounded) { t.charges = 3; t.stacks = 0; }
    else if (t.charges < 3) {
      t.stacks++;
      if (t.stacks >= 150) { t.stacks = 0; t.charges++; }
    }
    t.meter = (t.charges + (t.charges < 3 ? t.stacks / 150 : 0)) / 3;
  },
  extraJumps() { return 1; },
  hudText(f, t) { return `${t.charges}/3`; },
};

// ----------------------------------------------------------------- JAEGER
// Real ammunition. Running dry is a genuine, readable failure state.
const JAEGER_TRAIT: TraitSpec = {
  id: 'ammo', label: 'BOLTS', name: 'Quiver', color: '#ffc46b', segments: 6, startCharges: 6, maxCharges: 6,
  desc: 'Six bolts. Every projectile special spends one. Dry means melee only — hold shield on the ground for two-thirds of a second to reload the whole quiver.',
  passive: 'Two traps can be live at once and every projectile hits 18% harder.',
  tick(f, t) {
    // reload by holding shield on the ground
    if (f.grounded && (f.state === 'shield' || f.state === 'shieldstun') && t.charges < 6) {
      t.stacks++;
      if (t.stacks % 8 === 0) {
        f.world.particles.emit({ type: 'spark', x: f.x, y: f.y - 10, maxLife: 10, size: 3, color: '#ffc46b', vx: 0, vy: -1.2 });
      }
      if (t.stacks >= 40) {
        t.stacks = 0;
        t.charges = 6;
        t.flash = 24;
        f.world.emitSfx('ui_select');
        burst(f, '#ffc46b', 8, 4);
      }
    } else if (f.state !== 'shield') {
      t.stacks = 0;
      // slow passive trickle so a dry Jaeger is never fully stuck
      t.timer++;
      if (t.timer >= 240 && t.charges < 6) { t.timer = 0; t.charges++; }
    }
    t.meter = t.charges / 6;
  },
  onSpecial(f, t, slot, move) {
    if (!move.projectile) return null;
    if (t.charges > 0) {
      t.charges--;
      t.flash = 10;
      return { ...move, projectile: { ...move.projectile, dmg: move.projectile.dmg * 1.18 } };
    }
    // dry click
    f.world.emitSfx('ui_back');
    return {
      ...move,
      damage: move.damage * 0.5,
      projectile: undefined,
      bkb: move.bkb * 0.7,
      kbg: move.kbg * 0.7,
      fxColor: '#7a6a52',
    };
  },
  outgoing(f, v, t, ctx) { return ctx.move?.projectile ? { dmg: 1.18 } : {}; },
  hudText(f, t) { return t.charges === 0 ? 'DRY — HOLD SHIELD' : `${t.charges}/6`; },
};

// ===========================================================================

export const TRAITS: Record<FighterId, TraitSpec> = {
  vanguard: VANGUARD_TRAIT,
  ember: EMBER_TRAIT,
  hook: HOOK_TRAIT,
  titan: TITAN_TRAIT,
  nova: NOVA_TRAIT,
  volt: VOLT_TRAIT,
  frost: FROST_TRAIT,
  wraith: WRAITH_TRAIT,
  seraph: SERAPH_TRAIT,
  viper: VIPER_TRAIT,
  tempest: TEMPEST_TRAIT,
  jaeger: JAEGER_TRAIT,
};

export function traitFor(id: FighterId): TraitSpec {
  return TRAITS[id] ?? VANGUARD_TRAIT;
}
