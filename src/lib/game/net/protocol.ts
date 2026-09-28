// ============ RIFT BRAWL — Online Netcode Protocol ============
// Host-authoritative: the host simulates the match; remote clients send inputs
// and render interpolated snapshots. The lobby service only relays messages.

export const NET = {
  SNAP_HZ: 30,          // host → client snapshot rate
  INPUT_HZ: 60,         // client → host input rate
  MAX_PLAYERS: 4,
};

// ---------- Lobby ----------

export interface LobbyPlayer {
  slot: number;
  socketId: string;
  name: string;
  char: string;         // FighterId
  ready: boolean;
}

export interface LobbyState {
  code: string;
  hostSlot: number;
  players: LobbyPlayer[];
  inMatch: boolean;
}

// ---------- Match transport ----------

/** Client → host input packet. Bitmask order = ALL_ACTIONS order. */
export interface NetInput {
  /** held bits */ h: number;
  /** pressed bits */ p: number;
  ax: number;
  ay: number;
}

/** One fighter's synced state (short keys to keep snapshots small). */
export interface NetFighterState {
  i: number;                        // player index
  x: number; y: number; vx: number; vy: number;
  fc: number;                       // facing 1/-1
  st: number;                       // index into FIGHTER_STATES
  mv: string;                       // move id or ''
  mf: number;                       // moveFrame
  ch: number;                       // chargeFrames
  dm: number;                       // damage %
  sk: number;                       // stocks
  sh: number;                       // shieldHp
  hf: number;                       // hitFlash
  gr: number;                       // grounded
  jw: number;                       // jumpsUsed
  iv: number;                       // invuln
  po: number;                       // poison stacks
  arm: number;                      // armorActive
  cw: number;                       // counterWindow
  tc?: number;                      // tech count (R11 — optional for protocol compat)
}

export interface NetProjectile {
  k: string;  // kind
  x: number; y: number; vx: number; vy: number;
  r: number;
  c: string;  // color
  o: number;  // owner player index
}

export interface NetTrap {
  x: number; y: number;
  st: string; // style
  o: number;  // owner player index
}

export type NetEvent =
  | { k: 'hit'; x: number; y: number; a: number; p: number; c: string; s: string }
  | { k: 'sfx'; s: string }
  | { k: 'swing'; x: number; y: number; c: number; d: number; r: number; w: number; col: string; mk?: string; sp?: number; st?: string }
  | { k: 'ko'; x: number; y: number; c: string }
  | { k: 'ann'; t: string; sub?: string; size: number; color: string }
  | { k: 'parry'; x: number; y: number }
  | { k: 'flash'; a: number; c: string }
  | { k: 'shake'; a: number }
  | { k: 'zoom'; a: number };

export interface NetSnapshot {
  t: number;               // host tick
  ph: 0 | 1 | 2;           // phase: countdown/fight/end
  cd: number;              // countdown frames
  fs: NetFighterState[];
  ps: NetProjectile[];
  ts: NetTrap[];
  ev: NetEvent[];
  win: number;             // winner index at end (-1 none)
}

export interface MatchStartMsg {
  stageId: string;
  stocks: number;
  players: { slot: number; name: string; char: string }[];
  hostSlot: number;
}

// ---------- helpers ----------

export function encodeInput(held: Record<string, boolean>, pressed: Record<string, boolean>, ax: number, ay: number, actions: string[]): NetInput {
  let h = 0, p = 0;
  for (let i = 0; i < actions.length; i++) {
    if (held[actions[i]]) h |= 1 << i;
    if (pressed[actions[i]]) p |= 1 << i;
  }
  return { h, p, ax, ay };
}

export function decodeInput(pkt: NetInput, actions: string[]): { held: Record<string, boolean>; pressed: Record<string, boolean>; ax: number; ay: number } {
  const held: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};
  for (let i = 0; i < actions.length; i++) {
    held[actions[i]] = !!(pkt.h & (1 << i));
    pressed[actions[i]] = !!(pkt.p & (1 << i));
  }
  return { held, pressed, ax: pkt.ax, ay: pkt.ay };
}

export function makeLobbyCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
