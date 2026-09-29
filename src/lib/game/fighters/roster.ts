// ============ RIFT BRAWL — roster ids ============
//
// The id list is declared here rather than derived from FIGHTER_CONFIGS so
// that menus, lobbies and save files can talk about fighters without pulling
// in twelve full move sets and the renderer. configs.ts asserts at module load
// that the two stay in step.

import type { FighterId } from '../core/types';

export const FIGHTER_IDS: FighterId[] = [
  'vanguard', 'ember', 'hook', 'titan', 'nova', 'volt',
  'frost', 'wraith', 'seraph', 'viper', 'tempest', 'jaeger',
];

/** Cycle through the roster (lobby character picker, arcade shuffles). */
export function cycleChar(current: string, dir: 1 | -1): FighterId {
  const idx = FIGHTER_IDS.indexOf(current as FighterId);
  const n = FIGHTER_IDS.length;
  return FIGHTER_IDS[((idx < 0 ? 0 : idx) + dir + n) % n];
}
