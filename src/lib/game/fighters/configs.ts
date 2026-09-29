// ============ RIFT BRAWL — Fighter Configurations ============
// Four original fighters with unique stats, move data, and specials.

import { MoveData, CharacterInfo, ThrowData, WeaponDef } from '../core/types';
import type { FighterConfig } from './Fighter';

const M = (m: MoveData): MoveData => m;

const throwSet = (f: ThrowData, b: ThrowData, u: ThrowData, d: ThrowData) => ({ f, b, u, d });

// ------------------------------------------------------------------ VANGUARD
const vanguardInfo: CharacterInfo = {
  id: 'vanguard',
  name: 'VANGUARD',
  archetype: 'Balanced Blade',
  difficulty: 1,
  desc: 'A rift-guardian wielding the Rift Saber, a pure-energy blade. Three-hit sword combos with real slash arcs, a chargeable Rift Wave that flies across the stage, and a punishing counter.',
  stats: { speed: 4, power: 3, weight: 3, range: 4, recovery: 4 },
  colors: { primary: '#2ee6a8', secondary: '#0d3f33', accent: '#d9fff2', glow: '#5cffce' },
};

const vanguardWeapon: WeaponDef = { name: 'Rift Saber', kind: 'saber', len: 38, reach: 6, color: '#d9fff2', glow: '#5cffce' , fxStyle: 'rift' };

const vanguardMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Rift Jab', kind: 'ground', startup: 3, active: 3, recovery: 6, damage: 3.5, angle: 20, bkb: 10, kbg: 15, hitboxes: [{ x: 18, y: 0, r: 13 }], chainTo: 'jab2', chainWindow: 9, motion: { kind: 'punch', windup: -0.7, strike: 1.35 }, sfx: 'swing', hitSfx: 'hit1' }),
  jab2: M({ id: 'jab2', name: 'Rift Jab II', kind: 'ground', startup: 3, active: 3, recovery: 7, damage: 4.5, angle: 26, bkb: 11, kbg: 22, hitboxes: [{ x: 19, y: 0, r: 13 }], chainTo: 'jab3', chainWindow: 9, motion: { kind: 'punch', windup: 1.25, strike: 1.5 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#5cffce' }),
  jab3: M({ id: 'jab3', name: 'Rift Finisher', kind: 'ground', startup: 5, active: 4, recovery: 16, damage: 7.5, angle: 40, bkb: 16, kbg: 68, hitboxes: [{ x: 22, y: 0, r: 15 }], strong: true, motion: { kind: 'thrust', extend: [0.65, 1.4], windup: -0.9, strike: 1.62 }, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#5cffce' }),
  fattack: M({ id: 'fattack', name: 'Blade Slash', kind: 'ground', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 30, bkb: 14, kbg: 58, hitboxes: [{ x: 24, y: -2, r: 15 }], motion: { kind: 'slash', sweep: [150, -25] }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#5cffce' }),
  uattack: M({ id: 'uattack', name: 'Upward Arc', kind: 'ground', startup: 6, active: 5, recovery: 12, damage: 8.5, angle: 85, bkb: 13, kbg: 62, hitboxes: [{ x: 6, y: -24, r: 15 }], motion: { kind: 'slash', sweep: [25, 100], windup: 0.55, strike: -2.35 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#5cffce' }),
  dattack: M({ id: 'dattack', name: 'Low Cut', kind: 'ground', startup: 6, active: 4, recovery: 14, damage: 7.5, angle: 25, bkb: 11, kbg: 42, hitboxes: [{ x: 16, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -35] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Rush Slash', kind: 'dashattack', startup: 6, active: 6, recovery: 16, damage: 9.5, angle: 32, bkb: 16, kbg: 52, hitboxes: [{ x: 20, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 8 }], motion: { kind: 'slash', sweep: [125, 10] }, sfx: 'swing', hitSfx: 'hit2' }),
  nair: M({ id: 'nair', name: 'Spin Blade', kind: 'air', startup: 4, active: 12, recovery: 10, damage: 7, angle: 42, bkb: 12, kbg: 42, hitboxes: [{ x: 0, y: 0, r: 18 }], landLag: 8, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1' }),
  fair: M({ id: 'fair', name: 'Forward Arc', kind: 'air', startup: 6, active: 5, recovery: 12, damage: 10, angle: 35, bkb: 14, kbg: 60, hitboxes: [{ x: 20, y: -2, r: 15 }], landLag: 9, motion: { kind: 'slash', sweep: [140, -5] }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#5cffce' }),
  bair: M({ id: 'bair', name: 'Backhand Edge', kind: 'air', startup: 7, active: 5, recovery: 13, damage: 12, angle: 32, bkb: 15, kbg: 72, hitboxes: [{ x: -20, y: -2, r: 15 }], landLag: 10, motion: { kind: 'slash', sweep: [95, 185], windup: 0.9, strike: -1.5 }, sfx: 'swing_air', hitSfx: 'hit3', strong: true, fxColor: '#5cffce' }),
  uair: M({ id: 'uair', name: 'Sky Cutter', kind: 'air', startup: 6, active: 6, recovery: 11, damage: 9, angle: 80, bkb: 13, kbg: 64, hitboxes: [{ x: 4, y: -24, r: 15 }], landLag: 8, motion: { kind: 'slash', sweep: [20, 95], windup: 0.6, strike: -2.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  dair: M({ id: 'dair', name: 'Falling Edge', kind: 'air', startup: 8, active: 5, recovery: 14, damage: 11, angle: 275, bkb: 12, kbg: 58, hitboxes: [{ x: 6, y: 22, r: 13 }], landLag: 12, sweetspot: { frames: 2, dmgMul: 1.35, kbMul: 1.3 }, motion: { kind: 'thrust', extend: [0.55, 1.35], windup: -1.2, strike: 0.35 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#5cffce' }),
  nspecial: M({ id: 'nspecial', name: 'Charged Slash', kind: 'special', startup: 8, active: 5, recovery: 16, damage: 10, angle: 38, bkb: 17, kbg: 78, hitboxes: [{ x: 24, y: 0, r: 17 }], chargeable: { minF: 8, maxF: 42, dmgMul: 1.9, kbMul: 1.75 }, projectile: { kind: 'wave', speed: 5.8, life: 58, r: 12, dmg: 7, angle: 38, bkb: 13, kbg: 64, color: '#5cffce', sfx: 'proj_fire' }, projFrame: 10, strong: true, motion: { kind: 'slash', sweep: [145, -10] }, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#5cffce' }),
  sspecial: M({ id: 'sspecial', name: 'Dash Slash', kind: 'special', startup: 8, active: 8, recovery: 16, damage: 10, angle: 30, bkb: 15, kbg: 55, hitboxes: [{ x: 22, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 9 }, { frame: 8, vx: 5.5 }], motion: { kind: 'slash', sweep: [130, 5] }, sfx: 'dash', hitSfx: 'hit2', behavior: 'vanguard_dashslash', fxColor: '#5cffce' }),
  uspecial: M({ id: 'uspecial', name: 'Rising Blade', kind: 'special', startup: 5, active: 10, recovery: 18, damage: 8, angle: 80, bkb: 13, kbg: 48, hitboxes: [{ x: 4, y: -18, r: 17 }], mobility: [{ frame: 1, vy: -13.4 }], gravityMul: 0.35, motion: { kind: 'slash', sweep: [30, 105], windup: 0.7, strike: -2.4 }, behavior: 'vanguard_rising', sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#5cffce' }),
  dspecial: M({ id: 'dspecial', name: 'Aegis Counter', kind: 'special', startup: 4, active: 18, recovery: 14, damage: 0, angle: 40, bkb: 0, kbg: 0, counter: { frames: 22 }, behavior: 'vanguard_counter', sfx: 'shield_on' }),
  counterattack: M({ id: 'counterattack', name: 'Punish Cut', kind: 'special', startup: 2, active: 4, recovery: 14, damage: 11, angle: 40, bkb: 16, kbg: 70, hitboxes: [{ x: 22, y: 0, r: 16 }], strong: true, motion: { kind: 'slash', sweep: [150, -15] }, sfx: 'counter', hitSfx: 'hit3', fxColor: '#5cffce' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 6, active: 3, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 16, y: 0, r: 12 }], sfx: 'grab' }),
};

const vanguardThrows = throwSet(
  { dmg: 8, angle: 42, bkb: 14, kbg: 58, sfx: 'throw' },
  { dmg: 10.5, angle: 40, bkb: 15, kbg: 72, sfx: 'throw' },
  { dmg: 8, angle: 88, bkb: 14, kbg: 62, sfx: 'throw' },
  { dmg: 7, angle: 70, bkb: 12, kbg: 40, sfx: 'throw' },
);

export const VANGUARD: FighterConfig = {
  info: vanguardInfo,
  weapon: vanguardWeapon,
  stats: {
    weight: 100, groundSpeed: 4.1, groundAccel: 0.85, friction: 0.5, airSpeed: 3.9, airAccel: 0.38,
    jumpVel: 13.2, airJumpVel: 12.6, tripleJumpVel: 13.4, gravity: 0.52, fallCap: 10.5, fastFallCap: 16,
    dashSpeed: 10, dashFrames: 15, dashCooldown: 26, airDodgeSpeed: 8.5, scale: 1, shieldHp: 100,
  },
  moves: vanguardMoves,
  throws: vanguardThrows,
};

// ------------------------------------------------------------------ EMBER
const emberInfo: CharacterInfo = {
  id: 'ember',
  name: 'EMBER',
  archetype: 'Mobile Pyromancer',
  difficulty: 2,
  desc: 'A cinder-sprite that bends flame. Swings the Cinder Falchion, a curved burning blade, charges fireballs into meteors, and incinerates with rising flame pillars and a teleport recovery — as light as a matchstick.',
  stats: { speed: 5, power: 2, weight: 2, range: 5, recovery: 5 },
  colors: { primary: '#ff7a45', secondary: '#571f10', accent: '#ffe0b3', glow: '#ffb347' },
};

const emberWeapon: WeaponDef = { name: 'Cinder Falchion', kind: 'falchion', len: 28, reach: 5, color: '#ff9a52', glow: '#ffb347' , fxStyle: 'flame' };

const emberMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Cinder Jab', kind: 'ground', startup: 3, active: 2, recovery: 7, damage: 3, angle: 20, bkb: 9, kbg: 12, hitboxes: [{ x: 15, y: 0, r: 12 }], motion: { kind: 'punch', windup: -0.7, strike: 1.45 }, sfx: 'swing', hitSfx: 'hit1' }),
  fattack: M({ id: 'fattack', name: 'Flame Kick', kind: 'ground', startup: 6, active: 4, recovery: 11, damage: 8, angle: 28, bkb: 13, kbg: 52, hitboxes: [{ x: 20, y: -2, r: 13 }], motion: { kind: 'kick', strike: 1.5 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#ffb347' }),
  uattack: M({ id: 'uattack', name: 'Rising Flare', kind: 'ground', startup: 5, active: 6, recovery: 12, damage: 7.5, angle: 82, bkb: 12, kbg: 58, hitboxes: [{ x: 5, y: -24, r: 15 }, { x: 2, y: -38, r: 13 }], motion: { kind: 'kick', strike: 2.15 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#ffb347' }),
  dattack: M({ id: 'dattack', name: 'Ash Sweep', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 26, bkb: 10, kbg: 38, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [50, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Blaze Tackle', kind: 'dashattack', startup: 5, active: 6, recovery: 14, damage: 8.5, angle: 30, bkb: 15, kbg: 50, hitboxes: [{ x: 16, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 8.5 }], motion: { kind: 'punch', windup: -1.0, strike: 1.6 }, sfx: 'dash', hitSfx: 'hit2' }),
  nair: M({ id: 'nair', name: 'Fire Spin', kind: 'air', startup: 4, active: 12, recovery: 9, damage: 6, angle: 42, bkb: 11, kbg: 40, hitboxes: [{ x: 0, y: 0, r: 16 }], landLag: 7, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#ffb347' }),
  fair: M({ id: 'fair', name: 'Ember Kick', kind: 'air', startup: 5, active: 5, recovery: 11, damage: 8.5, angle: 34, bkb: 13, kbg: 55, hitboxes: [{ x: 18, y: -2, r: 14 }], landLag: 8, motion: { kind: 'kick', strike: 1.55 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#ffb347' }),
  bair: M({ id: 'bair', name: 'Backdraft', kind: 'air', startup: 6, active: 4, recovery: 11, damage: 10, angle: 32, bkb: 14, kbg: 64, hitboxes: [{ x: -18, y: -2, r: 14 }], landLag: 9, motion: { kind: 'punch', windup: 0.8, strike: -1.55 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#ffb347' }),
  uair: M({ id: 'uair', name: 'Flame Lash', kind: 'air', startup: 5, active: 6, recovery: 10, damage: 8, angle: 82, bkb: 12, kbg: 58, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 7, motion: { kind: 'slash', sweep: [30, 105], windup: 0.5, strike: -2.25 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  dair: M({ id: 'dair', name: 'Meteor Stomp', kind: 'air', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 278, bkb: 11, kbg: 50, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 11, motion: { kind: 'kick', strike: 0.35 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Fireball', kind: 'special', startup: 10, active: 2, recovery: 14, damage: 6, angle: 30, bkb: 10, kbg: 38, projectile: { kind: 'fireball', speed: 6.2, life: 90, r: 9, dmg: 6, angle: 30, bkb: 10, kbg: 38, color: '#ff8a3c', sfx: 'proj_fire' }, projFrame: 10, chargeable: { minF: 8, maxF: 36, dmgMul: 2.0, kbMul: 1.95 }, sfx: 'proj_fire' }),
  sspecial: M({ id: 'sspecial', name: 'Flame Dash', kind: 'special', startup: 6, active: 12, recovery: 14, damage: 8, angle: 34, bkb: 13, kbg: 48, hitboxes: [{ x: 6, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 10 }, { frame: 6, vx: 8 }], motion: { kind: 'slash', sweep: [135, 0] }, behavior: 'ember_fdash', sfx: 'dash', hitSfx: 'hit2', fxColor: '#ffb347' }),
  uspecial: M({ id: 'uspecial', name: 'Blaze Step', kind: 'special', startup: 8, active: 4, recovery: 12, damage: 5, angle: 60, bkb: 11, kbg: 30, hitboxes: [{ x: 0, y: 0, r: 16 }], behavior: 'ember_tp', sfx: 'teleport', fxColor: '#ffb347' }),
  dspecial: M({ id: 'dspecial', name: 'Flare Burst', kind: 'special', startup: 14, active: 6, recovery: 18, damage: 12, angle: 55, bkb: 16, kbg: 66, hitboxes: [{ x: 16, y: 0, r: 18 }, { x: -16, y: 0, r: 18 }], behavior: 'ember_flare', strong: true, sfx: 'charge_release', hitSfx: 'hit3', fxColor: '#ffb347' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 7, active: 3, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 15, y: 0, r: 12 }], sfx: 'grab' }),
};

const emberThrows = throwSet(
  { dmg: 7.5, angle: 44, bkb: 13, kbg: 50, sfx: 'throw' },
  { dmg: 9.5, angle: 40, bkb: 14, kbg: 62, sfx: 'throw' },
  { dmg: 7.5, angle: 88, bkb: 13, kbg: 55, sfx: 'throw' },
  { dmg: 6.5, angle: 70, bkb: 11, kbg: 36, sfx: 'throw' },
);

export const EMBER: FighterConfig = {
  info: emberInfo,
  weapon: emberWeapon,
  stats: {
    weight: 84, groundSpeed: 4.6, groundAccel: 0.95, friction: 0.55, airSpeed: 4.3, airAccel: 0.44,
    jumpVel: 13.6, airJumpVel: 13, tripleJumpVel: 13.8, gravity: 0.5, fallCap: 10, fastFallCap: 15.5,
    dashSpeed: 10.5, dashFrames: 14, dashCooldown: 24, airDodgeSpeed: 9, scale: 0.94, shieldHp: 88,
  },
  moves: emberMoves,
  throws: emberThrows,
};

// ------------------------------------------------------------------ HOOK
const hookInfo: CharacterInfo = {
  id: 'hook',
  name: 'HOOK',
  archetype: 'Rift Scavenger',
  difficulty: 3,
  desc: 'A grapple-slinging scavenger from the Rift. Chain lashes and the long Rift Sickle with huge reach, returning boomerangs, grapples that yank foes in and sneaky rift snares.',
  stats: { speed: 5, power: 2, weight: 2, range: 5, recovery: 5 },
  colors: { primary: '#b47aff', secondary: '#2a1b4d', accent: '#efe6ff', glow: '#c99aff' },
};

const hookWeapon: WeaponDef = { name: 'Rift Sickle', kind: 'sickle', len: 32, reach: 8, color: '#e5d5ff', glow: '#c99aff' , fxStyle: 'chain' };

const hookMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Snap Jab', kind: 'ground', startup: 3, active: 2, recovery: 7, damage: 3, angle: 20, bkb: 9, kbg: 12, hitboxes: [{ x: 15, y: 0, r: 12 }], motion: { kind: 'slash', windup: -1.1, strike: 1.15 }, sfx: 'swing', hitSfx: 'hit1' }),
  fattack: M({ id: 'fattack', name: 'Chain Lash', kind: 'ground', startup: 9, active: 4, recovery: 15, damage: 8.5, angle: 28, bkb: 13, kbg: 54, hitboxes: [{ x: 26, y: -2, r: 10 }], motion: { kind: 'thrust', extend: [0.5, 1.5], windup: -1.0, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#c99aff' }),
  uattack: M({ id: 'uattack', name: 'Sky Hook', kind: 'ground', startup: 5, active: 5, recovery: 11, damage: 7.5, angle: 84, bkb: 12, kbg: 58, hitboxes: [{ x: 5, y: -22, r: 14 }], motion: { kind: 'slash', sweep: [35, 110], windup: 0.5, strike: -2.3 }, sfx: 'swing', hitSfx: 'hit2' }),
  dattack: M({ id: 'dattack', name: 'Trip Wire', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 25, bkb: 10, kbg: 38, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Slider', kind: 'dashattack', startup: 5, active: 8, recovery: 15, damage: 8.5, angle: 28, bkb: 14, kbg: 48, hitboxes: [{ x: 14, y: 10, r: 13 }], mobility: [{ frame: 1, vx: 9 }], motion: { kind: 'sweep', sweep: [95, 15] }, sfx: 'dash', hitSfx: 'hit2' }),
  nair: M({ id: 'nair', name: 'Orbit Spin', kind: 'air', startup: 4, active: 12, recovery: 9, damage: 6, angle: 44, bkb: 11, kbg: 40, hitboxes: [{ x: 0, y: 0, r: 16 }], landLag: 7, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1' }),
  fair: M({ id: 'fair', name: 'Swing Hook', kind: 'air', startup: 5, active: 5, recovery: 11, damage: 9, angle: 36, bkb: 13, kbg: 54, hitboxes: [{ x: 20, y: -2, r: 13 }], landLag: 8, motion: { kind: 'slash', sweep: [135, -10] }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#c99aff' }),
  bair: M({ id: 'bair', name: 'Reverse Yank', kind: 'air', startup: 6, active: 4, recovery: 11, damage: 10.5, angle: 30, bkb: 14, kbg: 62, hitboxes: [{ x: -19, y: -2, r: 14 }], landLag: 9, motion: { kind: 'slash', sweep: [95, 185], windup: 0.9, strike: -1.5 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Lift Hook', kind: 'air', startup: 5, active: 6, recovery: 10, damage: 8, angle: 80, bkb: 12, kbg: 56, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 7, motion: { kind: 'slash', sweep: [30, 100], windup: 0.55, strike: -2.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  dair: M({ id: 'dair', name: 'Stake Drop', kind: 'air', startup: 8, active: 6, recovery: 14, damage: 10.5, angle: 272, bkb: 12, kbg: 55, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 12, motion: { kind: 'thrust', extend: [0.6, 1.3], windup: -1.1, strike: 0.35 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Boomerang', kind: 'special', startup: 9, active: 2, recovery: 13, damage: 4.5, angle: 30, bkb: 8, kbg: 30, projectile: { kind: 'boomerang', speed: 7.5, life: 100, r: 10, dmg: 5, angle: 35, bkb: 9, kbg: 32, hits: 3, returns: true, color: '#c99aff', sfx: 'proj_boomer' }, projFrame: 9, sfx: 'proj_boomer' }),
  sspecial: M({ id: 'sspecial', name: 'Grapple Shot', kind: 'special', startup: 8, active: 26, recovery: 10, damage: 4, angle: 40, bkb: 10, kbg: 20, behavior: 'hook_grapple', projFrame: 8, sfx: 'proj_boomer' }),
  uspecial: M({ id: 'uspecial', name: 'Hook Zip', kind: 'special', startup: 6, active: 8, recovery: 14, damage: 5, angle: 75, bkb: 10, kbg: 24, hitboxes: [{ x: 2, y: -8, r: 13 }], mobility: [{ frame: 2, vx: 6.5, vy: -13 }], gravityMul: 0.3, behavior: 'hook_zip', sfx: 'dash', hitSfx: 'hit1' }),
  dspecial: M({ id: 'dspecial', name: 'Rift Snare', kind: 'special', startup: 10, active: 2, recovery: 12, damage: 0, angle: 0, bkb: 0, kbg: 0, behavior: 'hook_trap', sfx: 'trap' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 7, active: 3, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 15, y: 0, r: 12 }], sfx: 'grab' }),
};

const hookThrows = throwSet(
  { dmg: 7, angle: 45, bkb: 12, kbg: 48, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 13, kbg: 60, sfx: 'throw' },
  { dmg: 7, angle: 88, bkb: 12, kbg: 54, sfx: 'throw' },
  { dmg: 6, angle: 70, bkb: 10, kbg: 34, sfx: 'throw' },
);

export const HOOK: FighterConfig = {
  info: hookInfo,
  weapon: hookWeapon,
  stats: {
    weight: 90, groundSpeed: 4.4, groundAccel: 0.9, friction: 0.5, airSpeed: 4.1, airAccel: 0.5,
    jumpVel: 13, airJumpVel: 12.8, tripleJumpVel: 14, gravity: 0.51, fallCap: 10.2, fastFallCap: 16,
    dashSpeed: 10.2, dashFrames: 14, dashCooldown: 22, airDodgeSpeed: 9.2, scale: 0.96, shieldHp: 92,
  },
  moves: hookMoves,
  throws: hookThrows,
};

// ------------------------------------------------------------------ TITAN
const titanInfo: CharacterInfo = {
  id: 'titan',
  name: 'TITAN',
  archetype: 'Gravity Colossus',
  difficulty: 2,
  desc: 'A living siege engine swinging the Star-Iron Maul. Armor-plated hammer blows, grab throws that end stocks and ground shockwaves that rumble across the whole stage.',
  stats: { speed: 2, power: 5, weight: 5, range: 4, recovery: 2 },
  colors: { primary: '#f2b632', secondary: '#4d3208', accent: '#fff3d6', glow: '#ffd166' },
};

const titanWeapon: WeaponDef = { name: 'Star-Iron Maul', kind: 'maul', len: 34, reach: 7, color: '#f2b632', glow: '#ffd166' , fxStyle: 'quake' };

const titanMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Iron Punch', kind: 'ground', startup: 6, active: 4, recovery: 12, damage: 5.5, angle: 25, bkb: 12, kbg: 30, hitboxes: [{ x: 20, y: 0, r: 14 }], motion: { kind: 'punch', windup: -1.1, strike: 1.5 }, sfx: 'swing_heavy', hitSfx: 'hit1' }),
  fattack: M({ id: 'fattack', name: 'Haymaker', kind: 'ground', startup: 14, active: 5, recovery: 19, damage: 14, angle: 32, bkb: 17, kbg: 74, hitboxes: [{ x: 24, y: 0, r: 16 }], armor: true, sweetspot: { frames: 3, dmgMul: 1.3, kbMul: 1.25 }, strong: true, motion: { kind: 'smash', sweep: [155, -25], fxScale: 1.15 }, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#ffd166' }),
  uattack: M({ id: 'uattack', name: 'Uppercut', kind: 'ground', startup: 9, active: 6, recovery: 16, damage: 11.5, angle: 86, bkb: 15, kbg: 70, hitboxes: [{ x: 6, y: -22, r: 15 }], motion: { kind: 'punch', windup: -1.3, strike: 2.3 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffd166' }),
  dattack: M({ id: 'dattack', name: 'Quake Wave', kind: 'ground', startup: 8, active: 6, recovery: 17, damage: 10, angle: 24, bkb: 13, kbg: 52, hitboxes: [{ x: 18, y: 14, r: 14 }], motion: { kind: 'smash', sweep: [125, 55], fxScale: 1.1 }, behavior: 'titan_quake', sfx: 'swing_heavy', hitSfx: 'hit2' }),
  dashattack: M({ id: 'dashattack', name: 'Shoulder Rush', kind: 'dashattack', startup: 8, active: 8, recovery: 18, damage: 11, angle: 30, bkb: 16, kbg: 58, hitboxes: [{ x: 14, y: 0, r: 16 }], mobility: [{ frame: 1, vx: 8.5 }], armor: true, motion: { kind: 'punch', windup: -1.2, strike: 1.65 }, sfx: 'dash', hitSfx: 'hit3' }),
  nair: M({ id: 'nair', name: 'Colossus Spin', kind: 'air', startup: 6, active: 12, recovery: 12, damage: 8.5, angle: 42, bkb: 13, kbg: 46, hitboxes: [{ x: 0, y: 0, r: 20 }], landLag: 10, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  fair: M({ id: 'fair', name: 'Smash Fist', kind: 'air', startup: 12, active: 5, recovery: 15, damage: 13.5, angle: 34, bkb: 16, kbg: 68, hitboxes: [{ x: 20, y: 0, r: 16 }], landLag: 11, armor: true, strong: true, motion: { kind: 'smash', sweep: [145, 20], fxScale: 1.15 }, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#ffd166' }),
  bair: M({ id: 'bair', name: 'Backhand', kind: 'air', startup: 8, active: 4, recovery: 14, damage: 12, angle: 30, bkb: 15, kbg: 64, hitboxes: [{ x: -20, y: -2, r: 16 }], landLag: 10, motion: { kind: 'punch', windup: 0.9, strike: -1.5 }, sfx: 'swing_heavy', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Sky Punch', kind: 'air', startup: 7, active: 6, recovery: 13, damage: 11.5, angle: 84, bkb: 14, kbg: 64, hitboxes: [{ x: 4, y: -22, r: 15 }], landLag: 9, motion: { kind: 'punch', windup: -1.2, strike: 2.35 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffd166' }),
  dair: M({ id: 'dair', name: 'Seismic Stomp', kind: 'air', startup: 10, active: 6, recovery: 16, damage: 12.5, angle: 275, bkb: 13, kbg: 58, hitboxes: [{ x: 5, y: 22, r: 15 }], landLag: 14, strong: true, motion: { kind: 'smash', sweep: [-50, -130], fxScale: 1.1 }, sfx: 'swing_heavy', hitSfx: 'hit3' }),
  nspecial: M({ id: 'nspecial', name: 'Gauntlet Charge', kind: 'special', startup: 10, active: 5, recovery: 18, damage: 13, angle: 34, bkb: 18, kbg: 82, hitboxes: [{ x: 24, y: 0, r: 17 }], chargeable: { minF: 10, maxF: 52, dmgMul: 1.8, kbMul: 1.8 }, armor: true, strong: true, motion: { kind: 'smash', sweep: [150, 15] }, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#ffd166' }),
  sspecial: M({ id: 'sspecial', name: 'Charge Tackle', kind: 'special', startup: 10, active: 14, recovery: 20, damage: 11, angle: 30, bkb: 16, kbg: 60, hitboxes: [{ x: 8, y: 0, r: 17 }], mobility: [{ frame: 1, vx: 9.5 }, { frame: 10, vx: 8 }], armor: true, sfx: 'dash', hitSfx: 'hit3', fxColor: '#ffd166' }),
  uspecial: M({ id: 'uspecial', name: 'Rocket Uppercut', kind: 'special', startup: 6, active: 10, recovery: 20, damage: 9, angle: 84, bkb: 14, kbg: 52, hitboxes: [{ x: 2, y: -14, r: 16 }], mobility: [{ frame: 1, vy: -12.6 }], gravityMul: 0.42, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffd166' }),
  dspecial: M({ id: 'dspecial', name: 'Titan Slam', kind: 'special', startup: 8, active: 10, recovery: 22, damage: 12, angle: 40, bkb: 15, kbg: 68, hitboxes: [{ x: 20, y: 16, r: 16 }, { x: -20, y: 16, r: 16 }], motion: { kind: 'smash', sweep: [140, 40], fxScale: 1.2 }, behavior: 'titan_slam', strong: true, sfx: 'swing_heavy', hitSfx: 'hit3', fxColor: '#ffd166' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 9, active: 3, recovery: 18, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 17, y: 0, r: 13 }], sfx: 'grab' }),
};

const titanThrows = throwSet(
  { dmg: 12, angle: 42, bkb: 16, kbg: 64, sfx: 'throw' },
  { dmg: 11, angle: 40, bkb: 15, kbg: 60, sfx: 'throw' },
  { dmg: 10, angle: 88, bkb: 15, kbg: 62, sfx: 'throw' },
  { dmg: 9, angle: 72, bkb: 13, kbg: 48, sfx: 'throw' },
);

export const TITAN: FighterConfig = {
  info: titanInfo,
  weapon: titanWeapon,
  stats: {
    weight: 128, groundSpeed: 3.3, groundAccel: 0.6, friction: 0.6, airSpeed: 3.2, airAccel: 0.26,
    jumpVel: 12.2, airJumpVel: 11.4, tripleJumpVel: 11.8, gravity: 0.56, fallCap: 11.5, fastFallCap: 18,
    dashSpeed: 8.8, dashFrames: 17, dashCooldown: 30, airDodgeSpeed: 7.8, scale: 1.22, shieldHp: 116,
  },
  moves: titanMoves,
  throws: titanThrows,
};

// ------------------------------------------------------------------ NOVA
const novaInfo: CharacterInfo = {
  id: 'nova',
  name: 'NOVA',
  archetype: 'Stellar Cartographer',
  difficulty: 2,
  desc: 'An astronomer fused with a dying star. The Astral Staff steers homing star bolts, bends gravity wells that drag foes in, and rides comets — as fragile as stardust.',
  stats: { speed: 3, power: 3, weight: 1, range: 5, recovery: 4 },
  colors: { primary: '#7aa8ff', secondary: '#1b2a5e', accent: '#e8f2ff', glow: '#a9c6ff' },
};

const novaWeapon: WeaponDef = { name: 'Astral Staff', kind: 'staff', len: 34, reach: 6, color: '#e8f2ff', glow: '#a9c6ff' , fxStyle: 'star' };

const novaMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Star Jab', kind: 'ground', startup: 3, active: 2, recovery: 7, damage: 3, angle: 20, bkb: 9, kbg: 12, hitboxes: [{ x: 15, y: 0, r: 12 }], motion: { kind: 'thrust', extend: [0.75, 1.2], windup: -0.5, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit1' }),
  fattack: M({ id: 'fattack', name: 'Comet Palm', kind: 'ground', startup: 7, active: 4, recovery: 12, damage: 8, angle: 30, bkb: 13, kbg: 52, hitboxes: [{ x: 19, y: -2, r: 13 }], motion: { kind: 'thrust', extend: [0.65, 1.35], windup: -0.6, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  uattack: M({ id: 'uattack', name: 'Zenith Flick', kind: 'ground', startup: 5, active: 5, recovery: 11, damage: 7.5, angle: 84, bkb: 12, kbg: 58, hitboxes: [{ x: 5, y: -23, r: 14 }], motion: { kind: 'thrust', extend: [0.7, 1.25], windup: 0.5, strike: 3.0 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  dattack: M({ id: 'dattack', name: 'Starlit Sweep', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 26, bkb: 10, kbg: 38, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Meteor Slide', kind: 'dashattack', startup: 5, active: 7, recovery: 15, damage: 8.5, angle: 30, bkb: 14, kbg: 50, hitboxes: [{ x: 15, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 8.5 }], motion: { kind: 'slash', sweep: [120, 15] }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  nair: M({ id: 'nair', name: 'Orbit Ring', kind: 'air', startup: 4, active: 14, recovery: 9, damage: 6.5, angle: 42, bkb: 11, kbg: 42, hitboxes: [{ x: 0, y: 0, r: 17 }], landLag: 7, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#a9c6ff' }),
  fair: M({ id: 'fair', name: 'Star Kick', kind: 'air', startup: 5, active: 5, recovery: 11, damage: 8.5, angle: 34, bkb: 13, kbg: 55, hitboxes: [{ x: 18, y: -2, r: 14 }], landLag: 8, motion: { kind: 'kick', strike: 1.5 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  bair: M({ id: 'bair', name: 'Pulsar Palm', kind: 'air', startup: 6, active: 4, recovery: 11, damage: 10, angle: 32, bkb: 14, kbg: 64, hitboxes: [{ x: -18, y: -2, r: 14 }], landLag: 9, motion: { kind: 'thrust', extend: [0.75, 1.3], windup: 0.8, strike: -1.6 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Nebula Arc', kind: 'air', startup: 5, active: 6, recovery: 10, damage: 8, angle: 82, bkb: 12, kbg: 58, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 7, motion: { kind: 'slash', sweep: [30, 100], windup: 0.55, strike: -2.5 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  dair: M({ id: 'dair', name: 'Falling Star', kind: 'air', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 278, bkb: 11, kbg: 52, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 11, motion: { kind: 'thrust', extend: [0.55, 1.3], windup: -1.1, strike: 0.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Star Bolt', kind: 'special', startup: 9, active: 2, recovery: 13, damage: 5, angle: 30, bkb: 9, kbg: 30, projectile: { kind: 'star', speed: 5.4, life: 110, r: 10, dmg: 6.5, angle: 32, bkb: 10, kbg: 40, color: '#a9c6ff', sfx: 'proj_fire' }, projFrame: 9, sfx: 'proj_fire' }),
  sspecial: M({ id: 'sspecial', name: 'Comet Ride', kind: 'special', startup: 7, active: 10, recovery: 14, damage: 8, angle: 34, bkb: 13, kbg: 50, hitboxes: [{ x: 4, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 9.5 }, { frame: 7, vx: 7 }], gravityMul: 0.45, behavior: 'nova_comet', sfx: 'dash', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  uspecial: M({ id: 'uspecial', name: 'Stellar Rise', kind: 'special', startup: 6, active: 9, recovery: 16, damage: 7.5, angle: 82, bkb: 13, kbg: 50, hitboxes: [{ x: 2, y: -14, r: 16 }], mobility: [{ frame: 1, vy: -13.2 }], gravityMul: 0.4, behavior: 'nova_rise', sfx: 'teleport', hitSfx: 'hit2', fxColor: '#a9c6ff' }),
  dspecial: M({ id: 'dspecial', name: 'Gravity Well', kind: 'special', startup: 12, active: 2, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, projectile: { kind: 'star', speed: 2.6, life: 150, r: 16, dmg: 3, angle: 55, bkb: 8, kbg: 14, hits: 99, pull: true, color: '#8fb0ff', sfx: 'trap' }, projFrame: 12, behavior: 'nova_well', sfx: 'trap' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 7, active: 3, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 15, y: 0, r: 12 }], sfx: 'grab' }),
};

const novaThrows = throwSet(
  { dmg: 7.5, angle: 44, bkb: 13, kbg: 50, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 14, kbg: 60, sfx: 'throw' },
  { dmg: 7.5, angle: 88, bkb: 13, kbg: 55, sfx: 'throw' },
  { dmg: 6.5, angle: 70, bkb: 11, kbg: 36, sfx: 'throw' },
);

export const NOVA: FighterConfig = {
  info: novaInfo,
  weapon: novaWeapon,
  stats: {
    weight: 82, groundSpeed: 4.0, groundAccel: 0.8, friction: 0.5, airSpeed: 4.2, airAccel: 0.46,
    jumpVel: 13.4, airJumpVel: 12.8, tripleJumpVel: 14.2, gravity: 0.48, fallCap: 9.6, fastFallCap: 15,
    dashSpeed: 10, dashFrames: 15, dashCooldown: 25, airDodgeSpeed: 9, scale: 0.95, shieldHp: 86,
  },
  moves: novaMoves,
  throws: novaThrows,
};

// ------------------------------------------------------------------ VOLT
const voltInfo: CharacterInfo = {
  id: 'volt',
  name: 'VOLT',
  archetype: 'Storm Runner',
  difficulty: 3,
  desc: 'A courier struck by living lightning. Fastest feet in the rift wielding storm tonfas, chain-lightning dashes, a paralysing static field and thunder in both fists.',
  stats: { speed: 5, power: 2, weight: 2, range: 2, recovery: 4 },
  colors: { primary: '#ffe94d', secondary: '#4a3c08', accent: '#fffbe0', glow: '#fff36b' },
};

const voltWeapon: WeaponDef = { name: 'Storm Tonfa', kind: 'tonfa', len: 24, reach: 4, color: '#fffbe0', glow: '#fff36b' , fxStyle: 'volt' };

const voltMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Buzz Jab', kind: 'ground', startup: 2, active: 2, recovery: 5, damage: 2.8, angle: 20, bkb: 8, kbg: 10, hitboxes: [{ x: 14, y: 0, r: 11 }], chainTo: 'jab2', chainWindow: 8, motion: { kind: 'punch', windup: -0.5, strike: 1.4 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#fff36b' }),
  jab2: M({ id: 'jab2', name: 'Buzz Jab II', kind: 'ground', startup: 2, active: 2, recovery: 6, damage: 3.4, angle: 24, bkb: 9, kbg: 16, hitboxes: [{ x: 14, y: 0, r: 11 }], chainTo: 'jab3', chainWindow: 8, motion: { kind: 'punch', windup: 1.2, strike: 1.45 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#fff36b' }),
  jab3: M({ id: 'jab3', name: 'Static Snap', kind: 'ground', startup: 4, active: 3, recovery: 13, damage: 6, angle: 40, bkb: 14, kbg: 60, hitboxes: [{ x: 17, y: 0, r: 13 }], strong: true, motion: { kind: 'punch', windup: -0.9, strike: 1.55 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#fff36b' }),
  fattack: M({ id: 'fattack', name: 'Live Wire Kick', kind: 'ground', startup: 4, active: 7, recovery: 11, damage: 3.4, angle: 28, bkb: 9, kbg: 30, hitboxes: [{ x: 18, y: -2, r: 12 }], motion: { kind: 'flurry', rehit: 2, windup: -0.6, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#fff36b' }),
  uattack: M({ id: 'uattack', name: 'Arc Upper', kind: 'ground', startup: 4, active: 5, recovery: 11, damage: 7, angle: 84, bkb: 12, kbg: 56, hitboxes: [{ x: 5, y: -22, r: 14 }], motion: { kind: 'kick', strike: 2.1 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#fff36b' }),
  dattack: M({ id: 'dattack', name: 'Ground Spark', kind: 'ground', startup: 5, active: 4, recovery: 12, damage: 6, angle: 26, bkb: 10, kbg: 38, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [50, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Overdrive Tackle', kind: 'dashattack', startup: 4, active: 6, recovery: 13, damage: 8, angle: 30, bkb: 14, kbg: 50, hitboxes: [{ x: 14, y: 0, r: 13 }], mobility: [{ frame: 1, vx: 9.5 }], motion: { kind: 'punch', windup: -1.0, strike: 1.6 }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#fff36b' }),
  nair: M({ id: 'nair', name: 'Coil Spin', kind: 'air', startup: 3, active: 12, recovery: 8, damage: 5.5, angle: 42, bkb: 10, kbg: 40, hitboxes: [{ x: 0, y: 0, r: 15 }], landLag: 6, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#fff36b' }),
  fair: M({ id: 'fair', name: 'Thunder Heel', kind: 'air', startup: 4, active: 4, recovery: 10, damage: 8, angle: 34, bkb: 13, kbg: 55, hitboxes: [{ x: 17, y: -2, r: 13 }], landLag: 7, motion: { kind: 'kick', strike: 1.55 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#fff36b' }),
  bair: M({ id: 'bair', name: 'Reverse Shock', kind: 'air', startup: 5, active: 4, recovery: 10, damage: 9.5, angle: 32, bkb: 14, kbg: 64, hitboxes: [{ x: -17, y: -2, r: 13 }], landLag: 8, motion: { kind: 'punch', windup: 0.75, strike: -1.5 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#fff36b' }),
  uair: M({ id: 'uair', name: 'Sky Bolt', kind: 'air', startup: 4, active: 6, recovery: 9, damage: 7.5, angle: 82, bkb: 12, kbg: 58, hitboxes: [{ x: 4, y: -21, r: 14 }], landLag: 6, motion: { kind: 'thrust', extend: [0.7, 1.3], windup: 0.5, strike: 3.0 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#fff36b' }),
  dair: M({ id: 'dair', name: 'Lightning Drop', kind: 'air', startup: 6, active: 5, recovery: 12, damage: 9, angle: 278, bkb: 11, kbg: 52, hitboxes: [{ x: 5, y: 19, r: 13 }], landLag: 10, motion: { kind: 'kick', strike: 0.35 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#fff36b' }),
  nspecial: M({ id: 'nspecial', name: 'Bolt Shot', kind: 'special', startup: 6, active: 2, recovery: 10, damage: 4, angle: 30, bkb: 8, kbg: 24, projectile: { kind: 'bolt', speed: 8.6, life: 46, r: 7, dmg: 4.5, angle: 30, bkb: 8, kbg: 26, color: '#fff36b', sfx: 'proj_fire' }, projFrame: 6, sfx: 'proj_fire' }),
  sspecial: M({ id: 'sspecial', name: 'Lightning Dash', kind: 'special', startup: 5, active: 12, recovery: 13, damage: 7.5, angle: 55, bkb: 12, kbg: 44, hitboxes: [{ x: 6, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 13 }, { frame: 5, vx: 12 }], behavior: 'volt_dash', sfx: 'dash', hitSfx: 'hit1', fxColor: '#fff36b' }),
  uspecial: M({ id: 'uspecial', name: 'Thunder Clap', kind: 'special', startup: 5, active: 9, recovery: 15, damage: 8, angle: 84, bkb: 13, kbg: 52, hitboxes: [{ x: 2, y: -13, r: 16 }], mobility: [{ frame: 1, vy: -13.8 }], gravityMul: 0.38, behavior: 'volt_thunder', sfx: 'charge_release', hitSfx: 'hit2', fxColor: '#fff36b' }),
  dspecial: M({ id: 'dspecial', name: 'Static Field', kind: 'special', startup: 10, active: 8, recovery: 17, damage: 7, angle: 46, bkb: 12, kbg: 40, hitboxes: [{ x: 0, y: 6, r: 34 }], behavior: 'volt_field', sfx: 'charge_release', hitSfx: 'hit2', fxColor: '#fff36b' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 6, active: 3, recovery: 14, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 14, y: 0, r: 12 }], sfx: 'grab' }),
};

const voltThrows = throwSet(
  { dmg: 6.5, angle: 45, bkb: 12, kbg: 46, sfx: 'throw' },
  { dmg: 8.5, angle: 40, bkb: 13, kbg: 58, sfx: 'throw' },
  { dmg: 7, angle: 88, bkb: 13, kbg: 54, sfx: 'throw' },
  { dmg: 6, angle: 70, bkb: 10, kbg: 34, sfx: 'throw' },
);

export const VOLT: FighterConfig = {
  info: voltInfo,
  weapon: voltWeapon,
  stats: {
    weight: 86, groundSpeed: 5.2, groundAccel: 1.15, friction: 0.45, airSpeed: 4.6, airAccel: 0.56,
    jumpVel: 13.9, airJumpVel: 13.2, tripleJumpVel: 14.4, gravity: 0.5, fallCap: 10.4, fastFallCap: 16.4,
    dashSpeed: 12, dashFrames: 12, dashCooldown: 18, airDodgeSpeed: 9.6, scale: 0.92, shieldHp: 84,
  },
  moves: voltMoves,
  throws: voltThrows,
};

// ------------------------------------------------------------------ FROST
const frostInfo: CharacterInfo = {
  id: 'frost',
  name: 'FROST',
  archetype: 'Glacier Knight',
  difficulty: 2,
  desc: 'The last warden of the frozen north, sealed in star-ice. Swings the Glacier Maul, a massive crystal hammer, lobs icicles that chill on hit and freezes the ground itself around her.',
  stats: { speed: 2, power: 4, weight: 4, range: 4, recovery: 2 },
  colors: { primary: '#6fd8f2', secondary: '#123a4d', accent: '#e6fbff', glow: '#9fe8ff' },
};

const frostWeapon: WeaponDef = { name: 'Glacier Maul', kind: 'glacier', len: 30, reach: 7, color: '#e6fbff', glow: '#9fe8ff' , fxStyle: 'frost' };

const frostMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Frost Jab', kind: 'ground', startup: 4, active: 3, recovery: 8, damage: 4, angle: 20, bkb: 10, kbg: 14, hitboxes: [{ x: 16, y: 0, r: 12 }], motion: { kind: 'smash', windup: -1.3, strike: 1.25 }, sfx: 'swing', hitSfx: 'hit1' }),
  fattack: M({ id: 'fattack', name: 'Glacial Arc', kind: 'ground', startup: 10, active: 5, recovery: 16, damage: 11, angle: 30, bkb: 15, kbg: 62, hitboxes: [{ x: 22, y: -2, r: 14 }, { x: 33, y: -1, r: 11 }], sweetspot: { frames: 2, dmgMul: 1.3, kbMul: 1.28 }, motion: { kind: 'smash', sweep: [150, -20], fxScale: 1.1 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  uattack: M({ id: 'uattack', name: 'Icicle Pop', kind: 'ground', startup: 7, active: 6, recovery: 14, damage: 9, angle: 86, bkb: 13, kbg: 60, hitboxes: [{ x: 5, y: -23, r: 15 }], motion: { kind: 'smash', sweep: [30, 95], windup: 0.6, strike: -2.5 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  dattack: M({ id: 'dattack', name: 'Permafrost Sweep', kind: 'ground', startup: 6, active: 5, recovery: 14, damage: 7.5, angle: 25, bkb: 11, kbg: 40, hitboxes: [{ x: 16, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Avalanche Rush', kind: 'dashattack', startup: 7, active: 7, recovery: 16, damage: 9.5, angle: 30, bkb: 15, kbg: 52, hitboxes: [{ x: 14, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 8 }], armor: true, motion: { kind: 'smash', sweep: [125, 20] }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  nair: M({ id: 'nair', name: 'Hailstorm Spin', kind: 'air', startup: 5, active: 12, recovery: 10, damage: 7, angle: 42, bkb: 12, kbg: 42, hitboxes: [{ x: 0, y: 0, r: 18 }], landLag: 9, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#9fe8ff' }),
  fair: M({ id: 'fair', name: 'Rime Maul', kind: 'air', startup: 8, active: 5, recovery: 13, damage: 11, angle: 34, bkb: 15, kbg: 62, hitboxes: [{ x: 19, y: -2, r: 14 }], landLag: 10, motion: { kind: 'smash', sweep: [145, 15], fxScale: 1.1 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  bair: M({ id: 'bair', name: 'Backdraft Chill', kind: 'air', startup: 7, active: 4, recovery: 12, damage: 10.5, angle: 32, bkb: 14, kbg: 64, hitboxes: [{ x: -19, y: -2, r: 14 }], landLag: 9, motion: { kind: 'smash', sweep: [100, 190], windup: 1.0, strike: -1.6 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Frost Lance', kind: 'air', startup: 6, active: 6, recovery: 11, damage: 9.5, angle: 82, bkb: 13, kbg: 60, hitboxes: [{ x: 4, y: -23, r: 15 }], landLag: 8, motion: { kind: 'thrust', extend: [0.65, 1.3], windup: 0.5, strike: 3.0 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  dair: M({ id: 'dair', name: 'Glacier Drop', kind: 'air', startup: 9, active: 6, recovery: 15, damage: 11.5, angle: 275, bkb: 13, kbg: 58, hitboxes: [{ x: 5, y: 21, r: 14 }], landLag: 13, strong: true, motion: { kind: 'smash', sweep: [-45, -135], fxScale: 1.1 }, sfx: 'swing_air', hitSfx: 'hit3' }),
  nspecial: M({ id: 'nspecial', name: 'Icicle Lob', kind: 'special', startup: 10, active: 2, recovery: 15, damage: 5, angle: 30, bkb: 9, kbg: 30, projectile: { kind: 'icicle', speed: 5.6, vy: -3.4, life: 120, r: 9, dmg: 7.5, angle: 40, bkb: 11, kbg: 44, color: '#9fe8ff', sfx: 'proj_fire' }, projFrame: 10, sfx: 'proj_fire' }),
  sspecial: M({ id: 'sspecial', name: 'Glacier Slide', kind: 'special', startup: 7, active: 13, recovery: 16, damage: 10, angle: 30, bkb: 14, kbg: 52, hitboxes: [{ x: 7, y: 6, r: 15 }], mobility: [{ frame: 1, vx: 10.5 }, { frame: 8, vx: 8.5 }], armor: true, behavior: 'frost_slide', sfx: 'dash', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  uspecial: M({ id: 'uspecial', name: 'Icicle Ascension', kind: 'special', startup: 6, active: 10, recovery: 18, damage: 8.5, angle: 84, bkb: 13, kbg: 52, hitboxes: [{ x: 2, y: -15, r: 16 }], mobility: [{ frame: 1, vy: -12.6 }], gravityMul: 0.42, behavior: 'frost_rise', sfx: 'charge_release', hitSfx: 'hit2', fxColor: '#9fe8ff' }),
  dspecial: M({ id: 'dspecial', name: 'Frost Nova', kind: 'special', startup: 13, active: 7, recovery: 19, damage: 10, angle: 55, bkb: 15, kbg: 58, hitboxes: [{ x: 0, y: 4, r: 38 }, { x: 24, y: 0, r: 20 }, { x: -24, y: 0, r: 20 }], strong: true, behavior: 'frost_nova', sfx: 'charge_release', hitSfx: 'hit3', fxColor: '#9fe8ff' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 8, active: 3, recovery: 17, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 16, y: 0, r: 12 }], sfx: 'grab' }),
};

const frostThrows = throwSet(
  { dmg: 10, angle: 42, bkb: 15, kbg: 58, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 14, kbg: 56, sfx: 'throw' },
  { dmg: 9, angle: 88, bkb: 14, kbg: 58, sfx: 'throw' },
  { dmg: 8, angle: 72, bkb: 12, kbg: 44, sfx: 'throw' },
);

export const FROST: FighterConfig = {
  info: frostInfo,
  weapon: frostWeapon,
  stats: {
    weight: 118, groundSpeed: 3.6, groundAccel: 0.62, friction: 0.62, airSpeed: 3.4, airAccel: 0.3,
    jumpVel: 12.6, airJumpVel: 11.8, tripleJumpVel: 12.2, gravity: 0.55, fallCap: 11, fastFallCap: 17.5,
    dashSpeed: 9.2, dashFrames: 16, dashCooldown: 28, airDodgeSpeed: 8.2, scale: 1.12, shieldHp: 110,
  },
  moves: frostMoves,
  throws: frostThrows,
};

// ------------------------------------------------------------------ WRAITH
const wraithInfo: CharacterInfo = {
  id: 'wraith',
  name: 'WRAITH',
  archetype: 'Void Duelist',
  difficulty: 3,
  desc: 'A duelist who lost a bet with the void. Blinks through shadows, harvests foes with the Void Scythe, fires creeping dark orbs — the lightest body, the sharpest intent.',
  stats: { speed: 4, power: 3, weight: 1, range: 3, recovery: 5 },
  colors: { primary: '#8f7aff', secondary: '#221a3d', accent: '#d9ccff', glow: '#b9a6ff' },
};

const wraithWeapon: WeaponDef = { name: 'Void Scythe', kind: 'scythe', len: 32, reach: 5, color: '#d9ccff', glow: '#b9a6ff' , fxStyle: 'void' };

const wraithMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Claw Flick', kind: 'ground', startup: 2, active: 2, recovery: 6, damage: 2.6, angle: 20, bkb: 8, kbg: 10, hitboxes: [{ x: 14, y: 0, r: 11 }], chainTo: 'jab2', chainWindow: 8, motion: { kind: 'slash', windup: -1.0, strike: 1.2 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#b9a6ff' }),
  jab2: M({ id: 'jab2', name: 'Claw Flick II', kind: 'ground', startup: 2, active: 2, recovery: 6, damage: 3.2, angle: 24, bkb: 9, kbg: 14, hitboxes: [{ x: 14, y: 0, r: 11 }], chainTo: 'jab3', chainWindow: 8, motion: { kind: 'slash', windup: 1.3, strike: 1.1 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#b9a6ff' }),
  jab3: M({ id: 'jab3', name: 'Triple Rend', kind: 'ground', startup: 4, active: 4, recovery: 14, damage: 7, angle: 40, bkb: 15, kbg: 62, hitboxes: [{ x: 17, y: 0, r: 13 }], strong: true, motion: { kind: 'cross', fxScale: 1.05 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  fattack: M({ id: 'fattack', name: 'Void Rend', kind: 'ground', startup: 6, active: 4, recovery: 12, damage: 8.5, angle: 30, bkb: 13, kbg: 54, hitboxes: [{ x: 18, y: -2, r: 13 }], sweetspot: { frames: 2, dmgMul: 1.32, kbMul: 1.3 }, motion: { kind: 'slash', sweep: [160, -40], fxScale: 1.2 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  uattack: M({ id: 'uattack', name: 'Shadow Talon', kind: 'ground', startup: 5, active: 5, recovery: 11, damage: 7.5, angle: 84, bkb: 12, kbg: 58, hitboxes: [{ x: 5, y: -23, r: 14 }], motion: { kind: 'slash', sweep: [35, 105], windup: 0.5, strike: -2.4 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  dattack: M({ id: 'dattack', name: 'Low Scythe', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 26, bkb: 10, kbg: 38, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Phase Rush', kind: 'dashattack', startup: 5, active: 6, recovery: 14, damage: 8.5, angle: 30, bkb: 14, kbg: 50, hitboxes: [{ x: 14, y: 0, r: 13 }], mobility: [{ frame: 1, vx: 9 }], motion: { kind: 'slash', sweep: [125, 10] }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  nair: M({ id: 'nair', name: 'Umbra Spin', kind: 'air', startup: 3, active: 12, recovery: 9, damage: 6, angle: 42, bkb: 11, kbg: 40, hitboxes: [{ x: 0, y: 0, r: 16 }], landLag: 7, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#b9a6ff' }),
  fair: M({ id: 'fair', name: 'Dusk Claw', kind: 'air', startup: 4, active: 5, recovery: 10, damage: 8.5, angle: 34, bkb: 13, kbg: 56, hitboxes: [{ x: 17, y: -2, r: 13 }], landLag: 8, motion: { kind: 'cross', fxScale: 1.1 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  bair: M({ id: 'bair', name: 'Eclipse Fang', kind: 'air', startup: 5, active: 4, recovery: 11, damage: 10, angle: 32, bkb: 14, kbg: 66, hitboxes: [{ x: -18, y: -2, r: 14 }], landLag: 9, motion: { kind: 'slash', sweep: [95, 185], windup: 0.9, strike: -1.5 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  uair: M({ id: 'uair', name: 'Night Slash', kind: 'air', startup: 4, active: 6, recovery: 10, damage: 8, angle: 82, bkb: 12, kbg: 58, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 7, motion: { kind: 'slash', sweep: [30, 100], windup: 0.55, strike: -2.35 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  dair: M({ id: 'dair', name: 'Abyss Drop', kind: 'air', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 276, bkb: 11, kbg: 54, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 11, motion: { kind: 'thrust', extend: [0.55, 1.3], windup: -1.1, strike: 0.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Dusk Orb', kind: 'special', startup: 9, active: 2, recovery: 14, damage: 5, angle: 30, bkb: 9, kbg: 30, projectile: { kind: 'shadoworb', speed: 3.6, life: 120, r: 11, dmg: 7, angle: 34, bkb: 11, kbg: 42, color: '#b9a6ff', sfx: 'proj_fire' }, projFrame: 9, sfx: 'proj_fire' }),
  sspecial: M({ id: 'sspecial', name: 'Phase Strike', kind: 'special', startup: 6, active: 8, recovery: 14, damage: 9.5, angle: 32, bkb: 14, kbg: 56, hitboxes: [{ x: 16, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 11 }], behavior: 'wraith_phase', sfx: 'teleport', hitSfx: 'hit2', fxColor: '#b9a6ff' }),
  uspecial: M({ id: 'uspecial', name: 'Shadow Ascent', kind: 'special', startup: 5, active: 6, recovery: 14, damage: 6, angle: 76, bkb: 12, kbg: 44, hitboxes: [{ x: 0, y: -6, r: 15 }], mobility: [{ frame: 1, vy: -13.6, vx: 3.5 }], gravityMul: 0.3, behavior: 'wraith_ascent', sfx: 'teleport', hitSfx: 'hit1', fxColor: '#b9a6ff' }),
  dspecial: M({ id: 'dspecial', name: 'Abyss Spikes', kind: 'special', startup: 11, active: 2, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, behavior: 'wraith_spikes', sfx: 'trap' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 6, active: 3, recovery: 15, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 14, y: 0, r: 12 }], sfx: 'grab' }),
};

const wraithThrows = throwSet(
  { dmg: 7, angle: 44, bkb: 12, kbg: 50, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 13, kbg: 60, sfx: 'throw' },
  { dmg: 7, angle: 88, bkb: 12, kbg: 54, sfx: 'throw' },
  { dmg: 6, angle: 70, bkb: 10, kbg: 34, sfx: 'throw' },
);

export const WRAITH: FighterConfig = {
  info: wraithInfo,
  weapon: wraithWeapon,
  stats: {
    weight: 80, groundSpeed: 4.5, groundAccel: 0.98, friction: 0.5, airSpeed: 4.4, airAccel: 0.5,
    jumpVel: 13.7, airJumpVel: 13.4, tripleJumpVel: 14.6, gravity: 0.47, fallCap: 9.8, fastFallCap: 15.4,
    dashSpeed: 10.8, dashFrames: 13, dashCooldown: 21, airDodgeSpeed: 9.8, scale: 0.94, shieldHp: 80,
  },
  moves: wraithMoves,
  throws: wraithThrows,
};

// ------------------------------------------------------------------ SERAPH
const seraphInfo: CharacterInfo = {
  id: 'seraph',
  name: 'SERAPH',
  archetype: 'Celestial Lancer',
  difficulty: 2,
  desc: 'A vault-knight of the dawn litany. Her Dawn Lance is the longest weapon in the rift — grand thrusts skewer from safety, Solar Beam scorches lanes, and Sunspot Wards deny whole zones.',
  stats: { speed: 3, power: 4, weight: 4, range: 5, recovery: 3 },
  colors: { primary: '#f2c94c', secondary: '#4a3410', accent: '#fff6d9', glow: '#ffe08a' },
};

const seraphWeapon: WeaponDef = { name: 'Dawn Lance', kind: 'lance', len: 46, reach: 9, color: '#fff6d9', glow: '#ffe08a' , fxStyle: 'light' };

const seraphMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Lance Poke', kind: 'ground', startup: 4, active: 3, recovery: 7, damage: 3.5, angle: 22, bkb: 10, kbg: 16, hitboxes: [{ x: 24, y: 0, r: 12 }], chainTo: 'jab2', chainWindow: 9, motion: { kind: 'thrust', extend: [0.7, 1.2], windup: -0.6, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit1' }),
  jab2: M({ id: 'jab2', name: 'Lance Poke II', kind: 'ground', startup: 3, active: 3, recovery: 8, damage: 4.5, angle: 26, bkb: 11, kbg: 22, hitboxes: [{ x: 25, y: 0, r: 12 }], chainTo: 'jab3', chainWindow: 9, motion: { kind: 'thrust', extend: [0.7, 1.25], windup: -0.7, strike: 1.62 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#ffe08a' }),
  jab3: M({ id: 'jab3', name: 'Dawn Piercer', kind: 'ground', startup: 6, active: 4, recovery: 17, damage: 8, angle: 34, bkb: 15, kbg: 62, hitboxes: [{ x: 28, y: 0, r: 13 }], strong: true, motion: { kind: 'thrust', extend: [0.5, 1.5], windup: -0.9, strike: 1.62 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  fattack: M({ id: 'fattack', name: 'Grand Thrust', kind: 'ground', startup: 11, active: 4, recovery: 17, damage: 12, angle: 28, bkb: 16, kbg: 64, hitboxes: [{ x: 30, y: 0, r: 14 }, { x: 44, y: -1, r: 11 }], mobility: [{ frame: 4, vx: 7 }], sweetspot: { frames: 2, dmgMul: 1.28, kbMul: 1.3 }, motion: { kind: 'thrust', extend: [0.45, 1.6], windup: -1.0, strike: 1.62, fxScale: 1.15 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  uattack: M({ id: 'uattack', name: 'Sky Piercer', kind: 'ground', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 86, bkb: 13, kbg: 60, hitboxes: [{ x: 6, y: -26, r: 15 }], motion: { kind: 'thrust', extend: [0.55, 1.45], windup: 0.5, strike: 3.05 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  dattack: M({ id: 'dattack', name: 'Halo Sweep', kind: 'ground', startup: 6, active: 5, recovery: 14, damage: 7.5, angle: 24, bkb: 11, kbg: 40, hitboxes: [{ x: 18, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [45, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Cavalier Rush', kind: 'dashattack', startup: 8, active: 6, recovery: 17, damage: 10.5, angle: 30, bkb: 15, kbg: 55, hitboxes: [{ x: 20, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 9 }], armor: true, behavior: 'seraph_charge', motion: { kind: 'thrust', extend: [0.6, 1.35], windup: -0.8, strike: 1.62 }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  nair: M({ id: 'nair', name: 'Halo Spin', kind: 'air', startup: 5, active: 12, recovery: 10, damage: 7, angle: 42, bkb: 12, kbg: 42, hitboxes: [{ x: 0, y: 0, r: 19 }], landLag: 8, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#ffe08a' }),
  fair: M({ id: 'fair', name: 'Skewer', kind: 'air', startup: 7, active: 5, recovery: 12, damage: 11, angle: 32, bkb: 15, kbg: 62, hitboxes: [{ x: 26, y: -2, r: 13 }], landLag: 9, motion: { kind: 'thrust', extend: [0.5, 1.5], windup: -0.8, strike: 1.62 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  bair: M({ id: 'bair', name: 'Rear Guard', kind: 'air', startup: 6, active: 4, recovery: 12, damage: 10.5, angle: 32, bkb: 14, kbg: 64, hitboxes: [{ x: -24, y: -2, r: 13 }], landLag: 9, motion: { kind: 'thrust', extend: [0.7, 1.3], windup: 0.8, strike: -1.62 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Ascension Arc', kind: 'air', startup: 6, active: 6, recovery: 11, damage: 9.5, angle: 84, bkb: 13, kbg: 58, hitboxes: [{ x: 6, y: -25, r: 14 }], landLag: 8, motion: { kind: 'thrust', extend: [0.55, 1.4], windup: 0.5, strike: 3.05 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  dair: M({ id: 'dair', name: 'Judgment Drop', kind: 'air', startup: 9, active: 6, recovery: 15, damage: 12, angle: 275, bkb: 14, kbg: 60, hitboxes: [{ x: 6, y: 22, r: 14 }], landLag: 13, strong: true, motion: { kind: 'thrust', extend: [0.5, 1.4], windup: -1.0, strike: 0.3 }, sfx: 'swing_air', hitSfx: 'hit3' }),
  nspecial: M({ id: 'nspecial', name: 'Solar Beam', kind: 'special', startup: 9, active: 2, recovery: 16, damage: 8, angle: 24, bkb: 13, kbg: 48, projectile: { kind: 'beam', speed: 15, life: 50, r: 9, dmg: 8, angle: 24, bkb: 13, kbg: 48, color: '#ffe08a', sfx: 'proj_fire' }, projFrame: 9, chargeable: { minF: 9, maxF: 34, dmgMul: 1.9, kbMul: 1.7 }, behavior: 'seraph_beam', sfx: 'proj_fire', fxColor: '#ffe08a' }),
  sspecial: M({ id: 'sspecial', name: 'Sacred Charge', kind: 'special', startup: 8, active: 12, recovery: 17, damage: 12, angle: 30, bkb: 16, kbg: 58, hitboxes: [{ x: 22, y: 0, r: 15 }], mobility: [{ frame: 1, vx: 10 }, { frame: 8, vx: 8 }], armor: true, behavior: 'seraph_charge', motion: { kind: 'thrust', extend: [0.6, 1.3], windup: -0.9, strike: 1.62 }, sfx: 'dash', hitSfx: 'hit3', fxColor: '#ffe08a' }),
  uspecial: M({ id: 'uspecial', name: 'Winged Ascension', kind: 'special', startup: 6, active: 10, recovery: 18, damage: 9, angle: 82, bkb: 13, kbg: 52, hitboxes: [{ x: 0, y: -16, r: 17 }], mobility: [{ frame: 1, vy: -13.2 }], gravityMul: 0.4, behavior: 'seraph_wings', sfx: 'charge_release', hitSfx: 'hit2', fxColor: '#ffe08a' }),
  dspecial: M({ id: 'dspecial', name: 'Sunspot Ward', kind: 'special', startup: 12, active: 2, recovery: 18, damage: 0, angle: 0, bkb: 0, kbg: 0, behavior: 'seraph_ward', sfx: 'trap' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 8, active: 3, recovery: 17, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 16, y: 0, r: 12 }], sfx: 'grab' }),
};

const seraphThrows = throwSet(
  { dmg: 11, angle: 44, bkb: 15, kbg: 58, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 14, kbg: 56, sfx: 'throw' },
  { dmg: 10, angle: 88, bkb: 14, kbg: 58, sfx: 'throw' },
  { dmg: 8, angle: 72, bkb: 12, kbg: 44, sfx: 'throw' },
);

export const SERAPH: FighterConfig = {
  info: seraphInfo,
  weapon: seraphWeapon,
  stats: {
    weight: 112, groundSpeed: 3.5, groundAccel: 0.6, friction: 0.6, airSpeed: 3.3, airAccel: 0.32,
    jumpVel: 12.4, airJumpVel: 11.6, tripleJumpVel: 12.6, gravity: 0.53, fallCap: 10.6, fastFallCap: 16.8,
    dashSpeed: 8.8, dashFrames: 15, dashCooldown: 26, airDodgeSpeed: 8.4, scale: 1.1, shieldHp: 108,
  },
  moves: seraphMoves,
  throws: seraphThrows,
};

// ------------------------------------------------------------------ VIPER
const viperInfo: CharacterInfo = {
  id: 'viper',
  name: 'VIPER',
  archetype: 'Toxin Stalker',
  difficulty: 3,
  desc: 'A hooded assassin from the sulfur pits. Her Venom Kamas land faster than any blade in the rift — every cut leaves poison eating at your percent while you scramble for an answer.',
  stats: { speed: 5, power: 2, weight: 2, range: 2, recovery: 4 },
  colors: { primary: '#8ce83c', secondary: '#173318', accent: '#eaffd0', glow: '#aef65c' },
};

const viperWeapon: WeaponDef = { name: 'Venom Kamas', kind: 'kama', len: 24, reach: 4, color: '#eaffd0', glow: '#aef65c' , fxStyle: 'venom' };

const viperMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Kama Flick', kind: 'ground', startup: 2, active: 2, recovery: 5, damage: 2.4, angle: 20, bkb: 8, kbg: 10, hitboxes: [{ x: 15, y: 0, r: 11 }], chainTo: 'jab2', chainWindow: 9, motion: { kind: 'punch', windup: -0.6, strike: 1.35 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#aef65c' }),
  jab2: M({ id: 'jab2', name: 'Kama Flick II', kind: 'ground', startup: 2, active: 2, recovery: 5, damage: 3, angle: 22, bkb: 9, kbg: 14, hitboxes: [{ x: 15, y: 0, r: 11 }], chainTo: 'jab3', chainWindow: 9, motion: { kind: 'punch', windup: 1.2, strike: 1.4 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#aef65c' }),
  jab3: M({ id: 'jab3', name: 'Kama Flick III', kind: 'ground', startup: 2, active: 2, recovery: 6, damage: 3.6, angle: 24, bkb: 9, kbg: 18, hitboxes: [{ x: 16, y: 0, r: 11 }], chainTo: 'jab4', chainWindow: 9, motion: { kind: 'punch', windup: -0.8, strike: 1.45 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#aef65c' }),
  jab4: M({ id: 'jab4', name: 'Fang Flurry', kind: 'ground', startup: 4, active: 4, recovery: 14, damage: 7, angle: 40, bkb: 14, kbg: 60, hitboxes: [{ x: 18, y: 0, r: 13 }], strong: true, venom: true, motion: { kind: 'cross', fxScale: 1.05 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#aef65c' }),
  fattack: M({ id: 'fattack', name: 'Cross Slash', kind: 'ground', startup: 6, active: 4, recovery: 12, damage: 8, angle: 30, bkb: 13, kbg: 52, hitboxes: [{ x: 18, y: -2, r: 13 }], venom: true, motion: { kind: 'cross', fxScale: 1.1 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#aef65c' }),
  uattack: M({ id: 'uattack', name: 'Fang Rack', kind: 'ground', startup: 5, active: 5, recovery: 11, damage: 7.5, angle: 84, bkb: 12, kbg: 56, hitboxes: [{ x: 5, y: -23, r: 14 }], motion: { kind: 'slash', sweep: [35, 105], windup: 0.5, strike: -2.35 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#aef65c' }),
  dattack: M({ id: 'dattack', name: 'Tail Sweep', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 26, bkb: 10, kbg: 38, hitboxes: [{ x: 16, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [50, -30] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Pounce', kind: 'dashattack', startup: 5, active: 6, recovery: 14, damage: 8.5, angle: 30, bkb: 14, kbg: 48, hitboxes: [{ x: 14, y: 0, r: 13 }], mobility: [{ frame: 1, vx: 9.5 }], venom: true, behavior: 'viper_pounce', motion: { kind: 'punch', windup: -1.0, strike: 1.55 }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#aef65c' }),
  nair: M({ id: 'nair', name: 'Coil Spin', kind: 'air', startup: 3, active: 12, recovery: 9, damage: 6, angle: 42, bkb: 11, kbg: 40, hitboxes: [{ x: 0, y: 0, r: 17 }], landLag: 7, motion: { kind: 'spin', turns: 1 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#aef65c' }),
  fair: M({ id: 'fair', name: 'Venom Fang', kind: 'air', startup: 4, active: 5, recovery: 10, damage: 8.5, angle: 34, bkb: 13, kbg: 54, hitboxes: [{ x: 18, y: -2, r: 13 }], landLag: 8, venom: true, motion: { kind: 'cross' }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#aef65c' }),
  bair: M({ id: 'bair', name: 'Tail Lash', kind: 'air', startup: 5, active: 4, recovery: 11, damage: 9.5, angle: 32, bkb: 14, kbg: 62, hitboxes: [{ x: -18, y: -2, r: 13 }], landLag: 9, motion: { kind: 'slash', sweep: [95, 185], windup: 0.9, strike: -1.5 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Rising Bite', kind: 'air', startup: 4, active: 6, recovery: 10, damage: 8, angle: 82, bkb: 12, kbg: 56, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 7, motion: { kind: 'slash', sweep: [30, 100], windup: 0.55, strike: -2.3 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#aef65c' }),
  dair: M({ id: 'dair', name: 'Dive Fang', kind: 'air', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 276, bkb: 11, kbg: 52, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 11, venom: true, motion: { kind: 'thrust', extend: [0.55, 1.3], windup: -1.0, strike: 0.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Venom Dart', kind: 'special', startup: 9, active: 2, recovery: 14, damage: 5, angle: 35, bkb: 10, kbg: 30, projectile: { kind: 'dart', speed: 8.5, vy: -1.2, life: 90, r: 7, dmg: 5, angle: 35, bkb: 10, kbg: 30, venom: true, color: '#aef65c', sfx: 'proj_fire' }, projFrame: 9, sfx: 'proj_fire', fxColor: '#aef65c' }),
  sspecial: M({ id: 'sspecial', name: 'Serpent Dash', kind: 'special', startup: 6, active: 10, recovery: 15, damage: 9, angle: 28, bkb: 13, kbg: 46, hitboxes: [{ x: 14, y: 4, r: 13 }], mobility: [{ frame: 1, vx: 11.5 }], venom: true, behavior: 'viper_dash', sfx: 'dash', hitSfx: 'hit2', fxColor: '#aef65c' }),
  uspecial: M({ id: 'uspecial', name: 'Coil Spring', kind: 'special', startup: 5, active: 8, recovery: 14, damage: 8, angle: 80, bkb: 12, kbg: 48, hitboxes: [{ x: 0, y: -10, r: 15 }], mobility: [{ frame: 1, vy: -13.8, vx: 3 }], gravityMul: 0.32, behavior: 'viper_coil', sfx: 'dash', hitSfx: 'hit1', fxColor: '#aef65c' }),
  dspecial: M({ id: 'dspecial', name: 'Toxic Snare', kind: 'special', startup: 11, active: 2, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, behavior: 'viper_snare', sfx: 'trap' }),
  grab: M({ id: 'grab', name: 'Grab', kind: 'grab', startup: 6, active: 3, recovery: 15, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 14, y: 0, r: 12 }], sfx: 'grab' }),
};

const viperThrows = throwSet(
  { dmg: 7, angle: 44, bkb: 12, kbg: 48, sfx: 'throw' },
  { dmg: 8, angle: 40, bkb: 13, kbg: 56, sfx: 'throw' },
  { dmg: 7, angle: 88, bkb: 12, kbg: 52, sfx: 'throw' },
  { dmg: 6, angle: 70, bkb: 10, kbg: 34, sfx: 'throw' },
);

export const VIPER: FighterConfig = {
  info: viperInfo,
  weapon: viperWeapon,
  stats: {
    weight: 86, groundSpeed: 4.7, groundAccel: 1.0, friction: 0.5, airSpeed: 4.5, airAccel: 0.52,
    jumpVel: 13.6, airJumpVel: 13.2, tripleJumpVel: 14.4, gravity: 0.47, fallCap: 9.9, fastFallCap: 15.6,
    dashSpeed: 10.9, dashFrames: 12, dashCooldown: 20, airDodgeSpeed: 9.8, scale: 0.95, shieldHp: 80,
  },
  moves: viperMoves,
  throws: viperThrows,
};

// ------------------------------------------------------------------ TEMPEST
const tempestInfo: CharacterInfo = {
  id: 'tempest',
  name: 'TEMPEST',
  archetype: 'Zephyr Acrobat',
  difficulty: 3,
  desc: 'A storm-dancer fighting with twin steel war fans. Huge arcing sweeps, a wind gust that shoves even shielded foes, a rising twister recovery, and a meteor Zephyr Dive built for edge-guards.',
  stats: { speed: 5, power: 2, weight: 2, range: 3, recovery: 5 },
  colors: { primary: '#7fd8ff', secondary: '#16324a', accent: '#eafaff', glow: '#6fd6ff' },
};

const tempestWeapon: WeaponDef = { name: 'Gale Fans', kind: 'fan', len: 26, reach: 5, color: '#eafaff', glow: '#6fd6ff' , fxStyle: 'gale' };

const tempestMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Fan Flick', kind: 'ground', startup: 2, active: 3, recovery: 5, damage: 3, angle: 20, bkb: 9, kbg: 12, hitboxes: [{ x: 15, y: 0, r: 12 }], chainTo: 'jab2', chainWindow: 8, motion: { kind: 'slash', windup: -1.1, strike: 1.3 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#6fd6ff' }),
  jab2: M({ id: 'jab2', name: 'Fan Flick II', kind: 'ground', startup: 2, active: 3, recovery: 6, damage: 3.6, angle: 24, bkb: 10, kbg: 16, hitboxes: [{ x: 16, y: 0, r: 12 }], chainTo: 'jab3', chainWindow: 8, motion: { kind: 'slash', windup: 1.35, strike: 1.15 }, sfx: 'swing', hitSfx: 'hit1', fxColor: '#6fd6ff' }),
  jab3: M({ id: 'jab3', name: 'Crosswind Snap', kind: 'ground', startup: 5, active: 4, recovery: 13, damage: 6.5, angle: 42, bkb: 15, kbg: 60, hitboxes: [{ x: 19, y: -2, r: 14 }], strong: true, motion: { kind: 'cross', fxScale: 1.1 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  fattack: M({ id: 'fattack', name: 'Cross Gale', kind: 'ground', startup: 7, active: 5, recovery: 13, damage: 9.5, angle: 32, bkb: 13, kbg: 55, hitboxes: [{ x: 21, y: -3, r: 15 }, { x: 15, y: -15, r: 12 }], motion: { kind: 'cross', fxScale: 1.25 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  uattack: M({ id: 'uattack', name: 'Updraft Arc', kind: 'ground', startup: 5, active: 5, recovery: 11, damage: 8.5, angle: 86, bkb: 12, kbg: 62, hitboxes: [{ x: 5, y: -23, r: 14 }], motion: { kind: 'slash', sweep: [20, 115], windup: 0.5, strike: -2.4 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  dattack: M({ id: 'dattack', name: 'Low Whisk', kind: 'ground', startup: 5, active: 4, recovery: 12, damage: 7.5, angle: 26, bkb: 10, kbg: 40, hitboxes: [{ x: 15, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [55, -40] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Wind Runner', kind: 'dashattack', startup: 5, active: 6, recovery: 14, damage: 9, angle: 30, bkb: 14, kbg: 50, hitboxes: [{ x: 17, y: 0, r: 13 }], mobility: [{ frame: 1, vx: 9.5 }], motion: { kind: 'slash', sweep: [140, 20] }, sfx: 'dash', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  nair: M({ id: 'nair', name: 'Fan Orbit', kind: 'air', startup: 3, active: 14, recovery: 9, damage: 2.8, angle: 40, bkb: 8, kbg: 26, hitboxes: [{ x: 0, y: 0, r: 15 }], landLag: 6, motion: { kind: 'spin', turns: 1, rehit: 8 }, sfx: 'swing_air', hitSfx: 'hit1', fxColor: '#6fd6ff' }),
  fair: M({ id: 'fair', name: 'Gale Cutter', kind: 'air', startup: 6, active: 5, recovery: 11, damage: 9.5, angle: 38, bkb: 13, kbg: 58, hitboxes: [{ x: 18, y: -2, r: 14 }], landLag: 8, sweetspot: { frames: 2, dmgMul: 1.3, kbMul: 1.3 }, motion: { kind: 'slash', sweep: [150, -30], fxScale: 1.15 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  bair: M({ id: 'bair', name: 'Backdraft', kind: 'air', startup: 5, active: 4, recovery: 11, damage: 8.5, angle: 30, bkb: 13, kbg: 58, hitboxes: [{ x: -17, y: -2, r: 14 }], landLag: 8, motion: { kind: 'slash', sweep: [200, 285], windup: 0.9, strike: -1.6 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  uair: M({ id: 'uair', name: 'Sky Whisk', kind: 'air', startup: 4, active: 6, recovery: 9, damage: 7.5, angle: 88, bkb: 10, kbg: 52, hitboxes: [{ x: 4, y: -22, r: 14 }], landLag: 6, motion: { kind: 'slash', sweep: [10, 120], windup: 0.55, strike: -2.35 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#6fd6ff' }),
  dair: M({ id: 'dair', name: 'Plummet Fan', kind: 'air', startup: 8, active: 5, recovery: 13, damage: 10, angle: 278, bkb: 10, kbg: 50, hitboxes: [{ x: 4, y: 20, r: 13 }], landLag: 12, sweetspot: { frames: 2, dmgMul: 1.25, kbMul: 1.3 }, motion: { kind: 'thrust', extend: [0.6, 1.3], windup: -1.15, strike: 0.3 }, sfx: 'swing_air', hitSfx: 'hit2' }),
  nspecial: M({ id: 'nspecial', name: 'Gale Burst', kind: 'special', startup: 9, active: 2, recovery: 16, damage: 2, angle: 30, bkb: 10.5, kbg: 3, behavior: 'tempest_gale', projectile: { kind: 'gust', speed: 6.2, life: 36, r: 15, dmg: 2, angle: 30, bkb: 10.5, kbg: 3, color: '#bfeaff', sfx: 'gust' }, projFrame: 9, sfx: 'gust', fxColor: '#bfeaff' }),
  sspecial: M({ id: 'sspecial', name: 'Cyclone Rush', kind: 'special', startup: 6, active: 14, recovery: 16, damage: 1.8, angle: 55, bkb: 7, kbg: 30, hitboxes: [{ x: 0, y: 0, r: 17 }], mobility: [{ frame: 1, vx: 10.5 }], motion: { kind: 'spin', turns: 2, rehit: 6, fxScale: 1.05 }, sfx: 'gust', hitSfx: 'hit1', fxColor: '#6fd6ff' }),
  uspecial: M({ id: 'uspecial', name: 'Tempest Twister', kind: 'special', startup: 5, active: 18, recovery: 10, damage: 1.7, angle: 80, bkb: 7.5, kbg: 34, behavior: 'tempest_twister', hitboxes: [{ x: 0, y: 0, r: 16 }], mobility: [{ frame: 1, vy: -13.6 }, { frame: 8, vy: -11.8 }, { frame: 14, vy: -9.8 }], motion: { kind: 'spin', turns: 2, rehit: 5, fxScale: 1.1 }, sfx: 'gust', hitSfx: 'hit1', fxColor: '#6fd6ff' }),
  dspecial: M({ id: 'dspecial', name: 'Zephyr Dive', kind: 'special', startup: 5, active: 22, recovery: 6, damage: 11, angle: 280, bkb: 9, kbg: 46, behavior: 'tempest_dive', hitboxes: [{ x: 8, y: 14, r: 14 }], sweetspot: { frames: 4, dmgMul: 1.25, kbMul: 1.32 }, gravityMul: 1.15, sfx: 'swing_air', hitSfx: 'hit3', fxColor: '#6fd6ff', strong: true }),
  grab: M({ id: 'grab', name: 'Snatch', kind: 'grab', startup: 6, active: 3, recovery: 14, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 14, y: 0, r: 12 }], sfx: 'grab' }),
};

const tempestThrows = throwSet(
  { dmg: 7, angle: 44, bkb: 12, kbg: 48, sfx: 'throw' },
  { dmg: 8, angle: 40, bkb: 13, kbg: 56, sfx: 'throw' },
  { dmg: 7, angle: 88, bkb: 12, kbg: 52, sfx: 'throw' },
  { dmg: 6, angle: 70, bkb: 10, kbg: 34, sfx: 'throw' },
);

export const TEMPEST: FighterConfig = {
  info: tempestInfo,
  weapon: tempestWeapon,
  stats: {
    weight: 78, groundSpeed: 5.1, groundAccel: 1.15, friction: 0.42, airSpeed: 4.9, airAccel: 0.6,
    jumpVel: 14.2, airJumpVel: 13.8, tripleJumpVel: 15.2, gravity: 0.44, fallCap: 9.4, fastFallCap: 15,
    dashSpeed: 11.8, dashFrames: 11, dashCooldown: 18, airDodgeSpeed: 10.6, scale: 0.95, shieldHp: 82,
  },
  moves: tempestMoves,
  throws: tempestThrows,
};

// ------------------------------------------------------------------ JAEGER
const jaegerInfo: CharacterInfo = {
  id: 'jaeger',
  name: 'JAEGER',
  archetype: 'Apex Hunter',
  difficulty: 2,
  desc: 'A beast-hunter with a wrist-mounted crossbow. Kill-power Power Bolts, a point-blank Scatter Volley, a weighted net that roots its mark, bear-trap snares, and a grapnel that yanks him across the stage.',
  stats: { speed: 2, power: 4, weight: 4, range: 5, recovery: 3 },
  colors: { primary: '#a3b18a', secondary: '#26301f', accent: '#f1fae6', glow: '#ffb347' },
};

const jaegerWeapon: WeaponDef = { name: 'Longshot Crossbow', kind: 'crossbow', len: 30, reach: 6, color: '#d8d2c2', glow: '#ffb347' , fxStyle: 'hunter' };

const jaegerMoves: Record<string, MoveData> = {
  jab: M({ id: 'jab', name: 'Stock Jab', kind: 'ground', startup: 4, active: 3, recovery: 7, damage: 4, angle: 20, bkb: 10, kbg: 14, hitboxes: [{ x: 16, y: 0, r: 12 }], chainTo: 'jab2', chainWindow: 9, motion: { kind: 'punch', windup: -0.75, strike: 1.35 }, sfx: 'swing', hitSfx: 'hit1' }),
  jab2: M({ id: 'jab2', name: 'Pump Strike', kind: 'ground', startup: 4, active: 3, recovery: 8, damage: 5, angle: 26, bkb: 11, kbg: 20, hitboxes: [{ x: 17, y: 0, r: 13 }], chainTo: 'jab3', chainWindow: 9, motion: { kind: 'punch', windup: 1.3, strike: 1.5 }, sfx: 'swing', hitSfx: 'hit1' }),
  jab3: M({ id: 'jab3', name: 'Crossbow Crash', kind: 'ground', startup: 9, active: 5, recovery: 17, damage: 8.5, angle: 40, bkb: 16, kbg: 64, hitboxes: [{ x: 20, y: 0, r: 15 }], strong: true, motion: { kind: 'smash', sweep: [120, -15], windup: -1.5, strike: 1.35 }, sfx: 'swing_heavy', hitSfx: 'hit3' }),
  fattack: M({ id: 'fattack', name: 'Hunter Blade', kind: 'ground', startup: 9, active: 5, recovery: 15, damage: 10.5, angle: 30, bkb: 14, kbg: 58, hitboxes: [{ x: 22, y: -2, r: 14 }], strong: true, motion: { kind: 'slash', sweep: [155, -20], windup: -1.2, strike: 1.3 }, sfx: 'swing_heavy', hitSfx: 'hit2', fxColor: '#ffb347' }),
  uattack: M({ id: 'uattack', name: 'Sky Bolt Thrust', kind: 'ground', startup: 8, active: 5, recovery: 13, damage: 8.5, angle: 88, bkb: 12, kbg: 60, hitboxes: [{ x: 5, y: -22, r: 12 }], motion: { kind: 'thrust', extend: [0.5, 1.3], windup: 0.6, strike: 3.0 }, sfx: 'swing', hitSfx: 'hit2', fxColor: '#ffb347' }),
  dattack: M({ id: 'dattack', name: 'Low Trip', kind: 'ground', startup: 7, active: 4, recovery: 14, damage: 7.5, angle: 25, bkb: 11, kbg: 40, hitboxes: [{ x: 16, y: 14, r: 12 }], motion: { kind: 'sweep', sweep: [50, -40] }, sfx: 'swing', hitSfx: 'hit1' }),
  dashattack: M({ id: 'dashattack', name: 'Ram Charge', kind: 'dashattack', startup: 8, active: 6, recovery: 17, damage: 10, angle: 32, bkb: 15, kbg: 52, hitboxes: [{ x: 18, y: 0, r: 14 }], mobility: [{ frame: 1, vx: 8.5 }], motion: { kind: 'smash', sweep: [130, -10], windup: -1.4, strike: 1.3 }, sfx: 'dash', hitSfx: 'hit3', strong: true }),
  nair: M({ id: 'nair', name: 'Spinner Kick', kind: 'air', startup: 6, active: 12, recovery: 10, damage: 3.2, angle: 45, bkb: 9, kbg: 26, hitboxes: [{ x: 0, y: 0, r: 16 }], landLag: 8, motion: { kind: 'kick', sweep: [-40, 120], rehit: 7 }, sfx: 'swing_air', hitSfx: 'hit1' }),
  fair: M({ id: 'fair', name: 'Dive Bolt', kind: 'air', startup: 8, active: 5, recovery: 13, damage: 10, angle: 45, bkb: 13, kbg: 56, hitboxes: [{ x: 13, y: 12, r: 12 }], landLag: 10, motion: { kind: 'thrust', extend: [0.45, 1.2], windup: -1.1, strike: 0.5 }, sfx: 'swing_air', hitSfx: 'hit2', fxColor: '#ffb347' }),
  bair: M({ id: 'bair', name: 'Rear Kick', kind: 'air', startup: 7, active: 4, recovery: 13, damage: 9.5, angle: 32, bkb: 14, kbg: 62, hitboxes: [{ x: -17, y: -2, r: 14 }], landLag: 9, motion: { kind: 'kick', sweep: [160, 250] }, sfx: 'swing_air', hitSfx: 'hit2' }),
  uair: M({ id: 'uair', name: 'Skybolt Kick', kind: 'air', startup: 6, active: 5, recovery: 11, damage: 8.5, angle: 85, bkb: 12, kbg: 58, hitboxes: [{ x: 5, y: -22, r: 14 }], landLag: 7, motion: { kind: 'kick', sweep: [20, 110] }, sfx: 'swing_air', hitSfx: 'hit2' }),
  dair: M({ id: 'dair', name: 'Stomp Drop', kind: 'air', startup: 9, active: 5, recovery: 14, damage: 10.5, angle: 275, bkb: 10, kbg: 48, hitboxes: [{ x: 5, y: 20, r: 13 }], landLag: 12, sweetspot: { frames: 2, dmgMul: 1.3, kbMul: 1.3 }, motion: { kind: 'smash', sweep: [240, 330], windup: -1.4, strike: 0.4 }, sfx: 'swing_air', hitSfx: 'hit3' }),
  nspecial: M({ id: 'nspecial', name: 'Power Bolt', kind: 'special', startup: 14, active: 2, recovery: 18, damage: 8.5, angle: 22, bkb: 8, kbg: 52, behavior: 'jaeger_bolts', projectile: { kind: 'arrow', speed: 12.5, life: 44, r: 6, dmg: 8.5, angle: 22, bkb: 8, kbg: 52, color: '#ffb347', sfx: 'bow' }, projFrame: 14, sfx: 'bow', fxColor: '#ffb347' }),
  sspecial: M({ id: 'sspecial', name: 'Scatter Volley', kind: 'special', startup: 11, active: 2, recovery: 20, damage: 4.5, angle: 30, bkb: 9, kbg: 34, behavior: 'jaeger_scatter', projectile: { kind: 'scatter', speed: 8.2, vy: -0.4, life: 16, r: 7, dmg: 4.5, angle: 30, bkb: 9, kbg: 34, pellets: 4, color: '#ffcf87', sfx: 'scatter' }, projFrame: 11, sfx: 'scatter', fxColor: '#ffb347' }),
  uspecial: M({ id: 'uspecial', name: 'Grapnel Shot', kind: 'special', startup: 6, active: 22, recovery: 10, damage: 4, angle: 30, bkb: 10, kbg: 20, behavior: 'hook_grapple', fxColor: '#ffb347', sfx: 'bow' }),
  dspecial: M({ id: 'dspecial', name: 'Snare Trap', kind: 'special', startup: 12, active: 2, recovery: 14, damage: 0, angle: 0, bkb: 0, kbg: 0, behavior: 'jaeger_snare', sfx: 'trap' }),
  grab: M({ id: 'grab', name: "Hunter's Grip", kind: 'grab', startup: 7, active: 3, recovery: 16, damage: 0, angle: 0, bkb: 0, kbg: 0, hitboxes: [{ x: 15, y: 0, r: 13 }], sfx: 'grab' }),
};

const jaegerThrows = throwSet(
  { dmg: 8, angle: 44, bkb: 13, kbg: 50, sfx: 'throw' },
  { dmg: 9, angle: 40, bkb: 14, kbg: 58, sfx: 'throw' },
  { dmg: 8, angle: 88, bkb: 13, kbg: 54, sfx: 'throw' },
  { dmg: 7, angle: 70, bkb: 11, kbg: 36, sfx: 'throw' },
);

export const JAEGER: FighterConfig = {
  info: jaegerInfo,
  weapon: jaegerWeapon,
  stats: {
    weight: 99, groundSpeed: 4.1, groundAccel: 0.82, friction: 0.5, airSpeed: 3.8, airAccel: 0.44,
    jumpVel: 13.1, airJumpVel: 12.6, tripleJumpVel: 13.8, gravity: 0.5, fallCap: 10.2, fastFallCap: 16.2,
    dashSpeed: 9.7, dashFrames: 13, dashCooldown: 22, airDodgeSpeed: 9.4, scale: 1.03, shieldHp: 94,
  },
  moves: jaegerMoves,
  throws: jaegerThrows,
};

// ============================================================================
//  BALANCE TUNING LAYER
// ============================================================================
//  The move tables above are the DESIGN: what a character does, how it feels,
//  what its animations are. This table is the TUNING: a single multiplier set
//  per fighter, derived from the offline round-robin harness in tools/sim.
//
//  Keeping them separate means a balance patch never touches hand-authored
//  frame data, and `npm run sim:balance` can attribute every win-rate change to
//  exactly one number per character.
//
//  dmg/kb    scale every hitbox, projectile and throw the fighter owns
//  speed     scales ground + air + dash movement
//  weight    survivability (higher = harder to launch)
// ============================================================================

export interface BalanceTuning { dmg: number; kb: number; speed: number; weight: number }

export const BALANCE: Record<string, BalanceTuning> = {
  vanguard: { dmg: 0.96, kb: 0.96, speed: 0.99, weight: 0.97 },
  ember:    { dmg: 1.31, kb: 1.36, speed: 1.12, weight: 1.18 },
  hook:     { dmg: 1.13, kb: 1.16, speed: 1.05, weight: 1.06 },
  titan:    { dmg: 0.76, kb: 0.72, speed: 0.90, weight: 0.85 },
  nova:     { dmg: 1.09, kb: 1.13, speed: 1.05, weight: 1.09 },
  volt:     { dmg: 1.12, kb: 1.18, speed: 1.02, weight: 1.11 },
  frost:    { dmg: 0.95, kb: 0.92, speed: 0.99, weight: 0.94 },
  wraith:   { dmg: 0.93, kb: 0.88, speed: 0.98, weight: 0.95 },
  seraph:   { dmg: 0.87, kb: 0.84, speed: 0.94, weight: 0.94 },
  viper:    { dmg: 0.81, kb: 0.80, speed: 0.92, weight: 0.88 },
  tempest:  { dmg: 1.07, kb: 1.12, speed: 1.02, weight: 1.04 },
  jaeger:   { dmg: 1.11, kb: 1.15, speed: 1.02, weight: 1.09 },
};

function tuneMove(m: MoveData, t: BalanceTuning): MoveData {
  if (t.dmg === 1 && t.kb === 1) return m;
  return {
    ...m,
    damage: m.damage * t.dmg,
    bkb: m.bkb * t.kb,
    kbg: m.kbg * t.kb,
    hitboxes: m.hitboxes?.map(h => ({
      ...h,
      dmg: h.dmg !== undefined ? h.dmg * t.dmg : undefined,
      bkb: h.bkb !== undefined ? h.bkb * t.kb : undefined,
      kbg: h.kbg !== undefined ? h.kbg * t.kb : undefined,
    })),
    projectile: m.projectile
      ? { ...m.projectile, dmg: m.projectile.dmg * t.dmg, bkb: m.projectile.bkb * t.kb, kbg: m.projectile.kbg * t.kb }
      : undefined,
  };
}

function tune(cfg: FighterConfig): FighterConfig {
  const t = BALANCE[cfg.info.id];
  if (!t) return cfg;
  const moves: Record<string, MoveData> = {};
  for (const k of Object.keys(cfg.moves)) moves[k] = tuneMove(cfg.moves[k], t);
  const th = cfg.throws;
  return {
    ...cfg,
    stats: {
      ...cfg.stats,
      weight: cfg.stats.weight * t.weight,
      groundSpeed: cfg.stats.groundSpeed * t.speed,
      airSpeed: cfg.stats.airSpeed * t.speed,
      dashSpeed: cfg.stats.dashSpeed * t.speed,
    },
    moves,
    throws: th ? {
      f: { ...th.f, dmg: th.f.dmg * t.dmg, bkb: th.f.bkb * t.kb, kbg: th.f.kbg * t.kb },
      b: { ...th.b, dmg: th.b.dmg * t.dmg, bkb: th.b.bkb * t.kb, kbg: th.b.kbg * t.kb },
      u: { ...th.u, dmg: th.u.dmg * t.dmg, bkb: th.u.bkb * t.kb, kbg: th.u.kbg * t.kb },
      d: { ...th.d, dmg: th.d.dmg * t.dmg, bkb: th.d.bkb * t.kb, kbg: th.d.kbg * t.kb },
    } : th,
  };
}

// ------------------------------------------------------------------

import { FighterId } from '../core/types';
export const FIGHTER_CONFIGS: Record<FighterId, FighterConfig> = {
  vanguard: tune(VANGUARD),
  ember: tune(EMBER),
  hook: tune(HOOK),
  titan: tune(TITAN),
  nova: tune(NOVA),
  volt: tune(VOLT),
  frost: tune(FROST),
  wraith: tune(WRAITH),
  seraph: tune(SERAPH),
  viper: tune(VIPER),
  tempest: tune(TEMPEST),
  jaeger: tune(JAEGER),
};

export const FIGHTER_LIST: FighterConfig[] = [
  FIGHTER_CONFIGS.vanguard, FIGHTER_CONFIGS.ember, FIGHTER_CONFIGS.hook, FIGHTER_CONFIGS.titan,
  FIGHTER_CONFIGS.nova, FIGHTER_CONFIGS.volt, FIGHTER_CONFIGS.frost, FIGHTER_CONFIGS.wraith,
  FIGHTER_CONFIGS.seraph, FIGHTER_CONFIGS.viper, FIGHTER_CONFIGS.tempest, FIGHTER_CONFIGS.jaeger,
];

export const FIGHTER_IDS: FighterId[] = FIGHTER_LIST.map(f => f.info.id);
