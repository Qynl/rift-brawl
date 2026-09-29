// ============ RIFT BRAWL — site copy ============
//
// Everything the marketing site says about the game lives here, deliberately
// apart from the game itself. configs.ts is ~600 lines of move data behind a
// dozen imports; a landing page that pulled it in would ship the entire
// renderer to someone who has not clicked Play yet.
//
// The roster map is typed as Record<FighterId, …>, so adding a fighter to the
// game and forgetting to describe them here is a compile error rather than a
// hole in the page.

import type { FighterId } from '@/lib/game/core/types';

export interface RosterEntry {
  /** Display name, matching FIGHTER_CONFIGS. */
  name: string;
  /** Archetype line, matching FIGHTER_CONFIGS. */
  archetype: string;
  /** The signature resource this fighter, and only this fighter, plays around. */
  resource: string;
  /** What that resource actually does, in one sentence a new player can act on. */
  rule: string;
  /** Signature weapon. */
  weapon: string;
  /** Accent colour, matching the fighter's in-game palette. */
  color: string;
}

export const ROSTER: Record<FighterId, RosterEntry> = {
  vanguard: {
    name: 'VANGUARD',
    archetype: 'Balanced Blade',
    resource: 'Aegis',
    rule: 'Blocking and parrying charge an empowered special — 1.45× damage, 1.3× knockback, and armour through the startup.',
    weapon: 'Rift Saber',
    color: '#2ee6a8',
  },
  ember: {
    name: 'EMBER',
    archetype: 'Mobile Pyromancer',
    resource: 'Overheat',
    rule: 'Contact builds heat. Past 70% you hit 1.32× harder and take 1.15× more — a timer you light yourself.',
    weapon: 'Cinder Falchion',
    color: '#ff7a45',
  },
  hook: {
    name: 'HOOK',
    archetype: 'Rift Scavenger',
    resource: 'Tension',
    rule: 'Every grab adds tension. At half meter throws deal 1.3× and grab range stretches to double.',
    weapon: 'Rift Sickle',
    color: '#b47aff',
  },
  titan: {
    name: 'TITAN',
    archetype: 'Gravity Colossus',
    resource: 'Bulwark',
    rule: 'Anything under 9 damage simply cannot launch him — knockback is cut to 12%. Jabs are not a plan.',
    weapon: 'Star-Iron Maul',
    color: '#f2b632',
  },
  nova: {
    name: 'NOVA',
    archetype: 'Stellar Cartographer',
    resource: 'Starfall',
    rule: 'Three charges on a 270-frame refill. Casting dry still works, at 55% power — spend them, do not hoard them.',
    weapon: 'Astral Staff',
    color: '#7aa8ff',
  },
  volt: {
    name: 'VOLT',
    archetype: 'Storm Runner',
    resource: 'Static',
    rule: 'Dashing charges static. A full discharge chains lightning up to 190px and leaves you 22% faster for two seconds.',
    weapon: 'Storm Tonfa',
    color: '#ffe94d',
  },
  frost: {
    name: 'FROST',
    archetype: 'Glacier Knight',
    resource: 'Permafrost',
    rule: 'Chill stacks on every connect. The fourth freezes them solid — the whole kit is a countdown to one opening.',
    weapon: 'Glacier Maul',
    color: '#6fd8f2',
  },
  wraith: {
    name: 'WRAITH',
    archetype: 'Void Duelist',
    resource: 'Siphon',
    rule: 'FADE gives 12 frames of true intangibility on a 240-frame cooldown. Whiff it and you have nothing.',
    weapon: 'Void Scythe',
    color: '#8f7aff',
  },
  seraph: {
    name: 'SERAPH',
    archetype: 'Celestial Lancer',
    resource: 'Radiance',
    rule: 'Filling the meter triggers ASCEND: six seconds of an extra jump and 1.22× damage. Build it, then commit.',
    weapon: 'Dawn Lance',
    color: '#f2c94c',
  },
  viper: {
    name: 'VIPER',
    archetype: 'Toxin Stalker',
    resource: 'Venom',
    rule: 'Poison stacks to four and heals you as it ticks. Everything hits 1.25× harder into an already-poisoned target.',
    weapon: 'Venom Kamas',
    color: '#8ce83c',
  },
  tempest: {
    name: 'TEMPEST',
    archetype: 'Zephyr Acrobat',
    resource: 'Gale',
    rule: 'Three airborne charges, an extra jump and an air dash. Nobody else owns the space above the stage like this.',
    weapon: 'Gale Fans',
    color: '#7fd8ff',
  },
  jaeger: {
    name: 'JAEGER',
    archetype: 'Apex Hunter',
    resource: 'Ammo',
    rule: 'Six bolts at +18% damage. Reload by holding shield; run dry and your melee is halved. Ammo is the whole game.',
    weapon: 'Longshot Crossbow',
    color: '#a3b18a',
  },
};

export const ROSTER_ORDER: FighterId[] = [
  'vanguard', 'ember', 'hook', 'titan', 'nova', 'volt',
  'frost', 'wraith', 'seraph', 'viper', 'tempest', 'jaeger',
];

export interface ModeEntry {
  id: 'quick' | 'arcade' | 'survival' | 'training' | 'local' | 'online';
  title: string;
  blurb: string;
}

/** The prompt-chip row: one line each, phrased as what you get, not what it is. */
export const MODES: ModeEntry[] = [
  { id: 'quick', title: 'Quick Match', blurb: 'One fight, right now, against the AI' },
  { id: 'arcade', title: 'Arcade', blurb: 'Five opponents, escalating, one run' },
  { id: 'survival', title: 'Survival', blurb: 'Endless waves until they finally get you' },
  { id: 'local', title: 'Local Versus', blurb: 'Two players, one keyboard, no setup' },
  { id: 'online', title: 'Online', blurb: 'Share a room code, up to four players' },
  { id: 'training', title: 'Training', blurb: 'Frame data, hitboxes and a patient dummy' },
];

export interface StageEntry {
  id: string;
  name: string;
  blurb: string;
  color: string;
}

export const STAGES: StageEntry[] = [
  { id: 'forest', name: 'Forest Ruins', blurb: 'Broken stonework under a canopy. The friendly one — three platforms, no surprises.', color: '#4ade80' },
  { id: 'volcano', name: 'Volcanic Core', blurb: 'Lava surges on a timer. The bottom of the stage stops being a safe place to recover.', color: '#ff6b35' },
  { id: 'neon', name: 'Neon City', blurb: 'Rain, reflections and moving light. Tight platforms over a long drop.', color: '#ff4fd8' },
  { id: 'frozen', name: 'Frozen Lake', blurb: 'Low traction and ice that breaks under you. Committing to a dash is a real decision.', color: '#7fd8ff' },
  { id: 'sky', name: 'Sky Fortress', blurb: 'Wind that pushes recoveries off-line, and very little floor to come back to.', color: '#a9c6ff' },
  { id: 'rift', name: 'The Rift', blurb: 'Portals that move you mid-combo. The stage itself is a mixup.', color: '#b47aff' },
];

export interface FeatureEntry {
  label: string;
  title: string;
  body: string;
}

export const FEATURES: FeatureEntry[] = [
  {
    label: 'Depth',
    title: 'Twelve kits, not twelve skins',
    body:
      'Every fighter owns a resource nobody else has, and it changes how you are supposed to play them. ' +
      'Titan ignores your jabs. Jaeger counts bolts. Ember is on a timer it set itself. Balanced by ' +
      'simulation, not by feel: 164 moves tuned until the win-rate spread across the roster fell from ' +
      '82 points to 22.7.',
  },
  {
    label: 'Feel',
    title: 'Real frame data underneath',
    body:
      'Startup, active and recovery frames on every move, percent-based knockback with base and growth, ' +
      'hitstop, directional influence, ledge play, shields, parries and throws. 23% of moves are safe on ' +
      'shield and 35% are plus on hit at 0% — enough to build pressure with, not so much that defence dies.',
  },
  {
    label: 'Opponent',
    title: 'AI that is bad on purpose',
    body:
      'Difficulty gates capability, not reaction speed. Easy genuinely cannot tech, DI or edgeguard; those ' +
      'abilities switch on as you climb. It reads habits instead of reading memory. The ladder lands at ' +
      '14.6%, 46.9%, 66.7% and 72.9% win rates against a fixed benchmark.',
  },
  {
    label: 'Weight',
    title: 'Loads like a web page',
    body:
      '178 KB gzipped on first paint, and the game engine is not in that number — it streams in while you ' +
      'read this page. No login, no launcher. Every sprite is drawn and every sound is synthesised at ' +
      'runtime with the Web Audio API, so there are no art or audio assets to fetch at all. It installs as ' +
      'an offline app and runs on a phone with full touch controls.',
  },
  {
    label: 'Proof',
    title: 'Deterministic, and it is tested',
    body:
      'The simulation is bit-identical across runs, which is why replays are stored as input tracks at ' +
      'about 6 KB per minute instead of video. Six determinism probes, a 1,440-frame render smoke test and ' +
      'a frame-data audit run in CI on every push.',
  },
  {
    label: 'Together',
    title: 'Four players, one room code',
    body:
      'Online lobbies over a Socket.IO relay: create a room, share the four-character code, fight. Local ' +
      'versus shares one keyboard with no setup at all. Gamepads work, and every binding is remappable.',
  },
];

export interface FaqEntry {
  q: string;
  a: string;
}

export const FAQ: FaqEntry[] = [
  {
    q: 'Is it actually free?',
    a: 'Yes. No account, no payment, no ads, no analytics. It is a static website — open it and you are in the menu.',
  },
  {
    q: 'What do I need to run it?',
    a: 'Any current browser. It is a canvas game with no plugins and no WebGL requirement, and it scales its own quality settings to hold 60fps.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. There is a full touch control layer with an analog stick, and the whole thing installs to a home screen and runs offline.',
  },
  {
    q: 'Where is my progress saved?',
    a: 'In your browser, in localStorage. Nothing is sent anywhere — there is no server holding your profile, because there is no server.',
  },
  {
    q: 'What is the catch with online play?',
    a: 'It needs a small relay running somewhere, so on some deployments it is unavailable. Everything else — single player, local versus, arcade, survival, training, challenges, replays — works with no backend at all.',
  },
  {
    q: 'Can I run my own copy?',
    a: 'The whole thing is open source. Clone it, npm install, npm run build, and upload the out/ folder anywhere. It is about two megabytes.',
  },
];

export interface StatEntry {
  value: string;
  label: string;
}

export const STATS: StatEntry[] = [
  { value: '12', label: 'brawlers' },
  { value: '164', label: 'authored moves' },
  { value: '6', label: 'stages' },
  { value: '178 KB', label: 'to first paint' },
  { value: '60', label: 'fixed fps' },
  { value: '0', label: 'downloads' },
];

/** Default keyboard layout, mirrored from core/input defaults. */
export const CONTROLS: { action: string; key: string }[] = [
  { action: 'Move', key: 'A / D' },
  { action: 'Jump', key: 'Space' },
  { action: 'Fast fall / aim', key: 'W / S' },
  { action: 'Attack', key: 'J' },
  { action: 'Special', key: 'K' },
  { action: 'Grab', key: 'L' },
  { action: 'Shield', key: 'I' },
  { action: 'Dodge', key: 'U' },
  { action: 'Dash', key: 'Q / E' },
];
