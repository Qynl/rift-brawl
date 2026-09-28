// ============ RIFT BRAWL — Save System (localStorage) ============

import { GameSettings, ProfileData, FighterId, KeyBindValue, ActionName } from './types';
import { DEFAULT_KEYBINDS_P1, DEFAULT_KEYBINDS_P2 } from './input';
import { FIGHTER_IDS } from '../fighters/configs';

const SAVE_KEY = 'riftbrawl_save_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVol: 0.8,
  musicVol: 0.55,
  sfxVol: 0.85,
  screenShake: 1.0,
  particles: 'high',
  quality: 'high',
  showFps: false,
  reduceFlashing: false,
  keybinds: {
    p1: { ...DEFAULT_KEYBINDS_P1 },
    p2: { ...DEFAULT_KEYBINDS_P2 },
  },
};

function defaultMastery(): ProfileData['mastery'] {
  const m = {} as ProfileData['mastery'];
  for (const id of FIGHTER_IDS) m[id] = { games: 0, wins: 0, kos: 0 };
  return m;
}

export const DEFAULT_PROFILE: ProfileData = {
  matches: 0, wins: 0, losses: 0, kos: 0, falls: 0, damageDealt: 0,
  mastery: defaultMastery(),
  challenges: [],
  arcadeBest: 0,
  survivalBest: 0,
  favorite: null,
};

interface SaveBlob {
  settings: GameSettings;
  profile: ProfileData;
}

export function loadSave(): SaveBlob {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, profile: { ...DEFAULT_PROFILE } };
    const parsed = JSON.parse(raw) as Partial<SaveBlob>;
    const p1Stored = { ...(parsed.settings?.keybinds?.p1 ?? {}) } as Partial<Record<ActionName, KeyBindValue>>;
    // MIGRATION v1→v2: dash moved from Shift-left to Q/E; holding A/D no longer dashes.
    // Old saves carry the old default — replace it so existing players get the new controls.
    if (p1Stored.dash === 'ShiftLeft') delete p1Stored.dash;
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed.settings,
      keybinds: {
        p1: { ...DEFAULT_KEYBINDS_P1, ...p1Stored },
        p2: { ...DEFAULT_KEYBINDS_P2, ...(parsed.settings?.keybinds?.p2 ?? {}) },
      },
    };
    const profile: ProfileData = {
      ...DEFAULT_PROFILE,
      ...parsed.profile,
      mastery: { ...DEFAULT_PROFILE.mastery, ...(parsed.profile?.mastery ?? {}) },
    };
    return { settings, profile };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, profile: { ...DEFAULT_PROFILE } };
  }
}

export function saveSave(settings: GameSettings, profile: ProfileData) {
  try {
    const blob: SaveBlob = { settings, profile };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch { /* storage may be unavailable */ }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function updateFavorite(profile: ProfileData): FighterId | null {
  let best: FighterId | null = null, bestGames = 1;
  (Object.keys(profile.mastery) as FighterId[]).forEach(id => {
    if (profile.mastery[id].games > bestGames) { best = id; bestGames = profile.mastery[id].games; }
  });
  return best;
}
