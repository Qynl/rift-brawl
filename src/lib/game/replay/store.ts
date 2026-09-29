// ============ RIFT BRAWL — Replay storage ============
// Replays live in localStorage. They are small (a three-minute 1v1 is a few
// kilobytes after RLE), but storage is not infinite, so the library is capped
// by both count and total size and evicts oldest-first.

import { ReplayData, ReplayMeta, REPLAY_VERSION, replayBytes } from './format';

const KEY = 'riftbrawl_replays_v1';
const MAX_REPLAYS = 20;
const MAX_BYTES = 1_200_000; // well inside a 5 MB localStorage budget

export interface StoredReplay extends ReplayData {
  id: string;
}

function read(): StoredReplay[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredReplay[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && r.meta && r.meta.version === REPLAY_VERSION && Array.isArray(r.tracks));
  } catch {
    return [];
  }
}

function write(list: StoredReplay[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded: drop the oldest half and try once more rather than
    // losing the replay the player just made.
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.ceil(list.length / 2))));
    } catch { /* storage unavailable */ }
  }
}

export function listReplays(): StoredReplay[] {
  return read().sort((a, b) => b.meta.createdAt - a.meta.createdAt);
}

// ---------------------------------------------------------------------------
//  React-friendly external store
//  The library is a piece of browser state that lives outside React, so it is
//  exposed as a proper external store: no state-writing effects, no SSR
//  hydration mismatch, and every mounted view updates on a mutation.
// ---------------------------------------------------------------------------

const EMPTY: StoredReplay[] = [];
let snapshot: StoredReplay[] | null = null;
const listeners = new Set<() => void>();

function invalidate() {
  snapshot = null;
  for (const l of listeners) l();
}

export function subscribeReplays(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getReplaysSnapshot(): StoredReplay[] {
  if (snapshot === null) snapshot = listReplays();
  return snapshot;
}

/** Server render has no localStorage; a stable empty array avoids a mismatch. */
export function getReplaysServerSnapshot(): StoredReplay[] {
  return EMPTY;
}

export function saveReplay(data: ReplayData): StoredReplay {
  const id = `r${data.meta.createdAt.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const entry: StoredReplay = { ...data, id };
  let list = [entry, ...read()].sort((a, b) => b.meta.createdAt - a.meta.createdAt);
  list = list.slice(0, MAX_REPLAYS);
  let total = 0;
  const kept: StoredReplay[] = [];
  for (const r of list) {
    total += replayBytes(r);
    if (total > MAX_BYTES && kept.length > 0) break;
    kept.push(r);
  }
  write(kept);
  invalidate();
  return entry;
}

export function deleteReplay(id: string) {
  write(read().filter((r) => r.id !== id));
  invalidate();
}

export function clearReplays() {
  write([]);
  invalidate();
}

/** Human-readable one-liner for the replay list. */
export function describeReplay(meta: ReplayMeta): string {
  const mins = Math.floor(meta.durationFrames / 3600);
  const secs = Math.floor((meta.durationFrames % 3600) / 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Export to a file the player can keep or send to someone. */
export function downloadReplay(r: ReplayData, filename?: string) {
  const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `riftbrawl-${r.meta.chars.join('-vs-')}-${r.meta.createdAt}.rbr.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Validate an imported blob before handing it to the engine. */
export function parseReplay(text: string): ReplayData | null {
  try {
    const parsed = JSON.parse(text) as ReplayData;
    if (!parsed?.meta || parsed.meta.version !== REPLAY_VERSION) return null;
    if (!Array.isArray(parsed.tracks) || parsed.tracks.length < 2) return null;
    if (!parsed.meta.config?.players?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
