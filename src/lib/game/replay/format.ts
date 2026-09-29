// ============ RIFT BRAWL — Replay format ============
//
// The simulation is deterministic: identical inputs produce byte-identical
// state (proved every CI run by tools/sim/determinism.mjs). That means a whole
// match can be stored as nothing but the button presses — kilobytes instead of
// the megabytes a video would cost.
//
// Layout per player track:
//   frame word = 11 held bits | 4-bit signed axisX | 4-bit signed axisY
// Words are run-length encoded, because a fighter holds the same buttons for
// many frames at a time, then the byte stream is base64'd so a replay survives
// localStorage, a JSON file and a URL.

import { ActionName, ALL_ACTIONS, InputState, MatchConfig, emptyInput } from '../core/types';

export const REPLAY_VERSION = 1;

export interface ReplayMeta {
  version: number;
  /** epoch ms the match finished */
  createdAt: number;
  /** everything needed to rebuild an identical Match */
  config: MatchConfig;
  mods: Record<string, unknown>;
  /** denormalised for listing without decoding the tracks */
  chars: string[];
  labels: string[];
  stageId: string;
  winner: number;
  durationFrames: number;
  timeout: boolean;
  /** set when the local player recorded it, for "your replays" filtering */
  title?: string;
}

export interface ReplayData {
  meta: ReplayMeta;
  /** one base64 RLE track per player */
  tracks: string[];
}

// ---------------------------------------------------------------------------
//  bit packing
// ---------------------------------------------------------------------------

/** quantise an axis to 4 bits of signed magnitude (-7..7 → -1..1) */
function packAxis(v: number): number {
  const q = Math.max(-7, Math.min(7, Math.round(v * 7)));
  return q & 0xf;
}

function unpackAxis(bits: number): number {
  const q = bits & 0xf;
  return (q > 7 ? q - 16 : q) / 7;
}

export function packInput(input: InputState): number {
  let w = 0;
  for (let i = 0; i < ALL_ACTIONS.length; i++) {
    if (input.held[ALL_ACTIONS[i]]) w |= 1 << i;
  }
  w |= packAxis(input.axisX) << 11;
  w |= packAxis(input.axisY) << 15;
  return w >>> 0;
}

/**
 * Rebuild a full InputState from a packed word plus the previous word.
 * `pressed`/`released` are pure rising/falling edges of `held`, which is
 * exactly how both the keyboard manager and the AI produce them — so nothing
 * is lost by not storing them.
 */
export function unpackInput(word: number, prevWord: number, into: InputState): InputState {
  for (let i = 0; i < ALL_ACTIONS.length; i++) {
    const a = ALL_ACTIONS[i] as ActionName;
    const now = (word >>> i) & 1;
    const before = (prevWord >>> i) & 1;
    into.held[a] = now === 1;
    into.pressed[a] = now === 1 && before === 0;
    into.released[a] = now === 0 && before === 1;
  }
  into.axisX = unpackAxis(word >>> 11);
  into.axisY = unpackAxis(word >>> 15);
  return into;
}

// ---------------------------------------------------------------------------
//  run-length encoding + base64
// ---------------------------------------------------------------------------

function toBase64(bytes: number[]): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] & 0xff);
  if (typeof btoa === 'function') return btoa(bin);
  // Node (simulation harness / tests)
  return Buffer.from(bin, 'binary').toString('base64');
}

function fromBase64(s: string): number[] {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out: number[] = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** little-endian base-128 varint, high bit = continuation */
function writeVarint(out: number[], n: number) {
  let v = n >>> 0;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}

export function encodeTrack(words: number[]): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    let run = 1;
    while (i + run < words.length && words[i + run] === w && run < 0xffffff) run++;
    // 19 significant bits → three bytes is always enough
    bytes.push(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff);
    writeVarint(bytes, run);
    i += run;
  }
  return toBase64(bytes);
}

export function decodeTrack(b64: string): number[] {
  const bytes = fromBase64(b64);
  const words: number[] = [];
  let i = 0;
  while (i + 3 < bytes.length) {
    const w = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
    i += 3;
    let run = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i++];
      run |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28 || i > bytes.length) break;
    }
    for (let k = 0; k < run; k++) words.push(w >>> 0);
  }
  return words;
}

// ---------------------------------------------------------------------------
//  recorder / player
// ---------------------------------------------------------------------------

export class ReplayRecorder {
  private tracks: number[][];
  readonly players: number;

  constructor(players: number) {
    this.players = players;
    this.tracks = Array.from({ length: players }, () => [] as number[]);
  }

  /** called once per simulated frame, AFTER the AI has written its inputs */
  record(inputs: InputState[]) {
    for (let i = 0; i < this.players; i++) {
      this.tracks[i].push(inputs[i] ? packInput(inputs[i]) : 0);
    }
  }

  get frames(): number { return this.tracks[0]?.length ?? 0; }

  finish(meta: Omit<ReplayMeta, 'version' | 'createdAt'>): ReplayData {
    return {
      meta: { ...meta, version: REPLAY_VERSION, createdAt: Date.now() },
      tracks: this.tracks.map(encodeTrack),
    };
  }
}

export class ReplayPlayback {
  private tracks: number[][];
  private prev: number[];
  private states: InputState[];
  readonly length: number;
  frame = 0;

  constructor(data: ReplayData) {
    this.tracks = data.tracks.map(decodeTrack);
    this.prev = this.tracks.map(() => 0);
    this.states = this.tracks.map(() => emptyInput());
    this.length = Math.max(0, ...this.tracks.map((t) => t.length));
  }

  get finished(): boolean { return this.frame >= this.length; }

  /** Match.inputProvider — called once per player per simulated frame. */
  provide = (slot: number): InputState => {
    const track = this.tracks[slot];
    const state = this.states[slot] ?? emptyInput();
    if (!track) return state;
    const word = track[Math.min(this.frame, track.length - 1)] ?? 0;
    unpackInput(word, this.prev[slot], state);
    return state;
  };

  /** advance the cursor; call once per simulated frame after all providers ran */
  advance() {
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      if (t) this.prev[i] = t[Math.min(this.frame, t.length - 1)] ?? 0;
    }
    this.frame++;
  }
}

/** Rough size of a replay once serialised, for the UI. */
export function replayBytes(r: ReplayData): number {
  return JSON.stringify(r).length;
}
