// ============ RIFT BRAWL — Challenge Definitions (all real modifiers) ============

import { AIDifficulty, ChallengeModifiers } from './core/types';

export interface Challenge {
  id: string;
  name: string;
  desc: string;
  mods: Partial<ChallengeModifiers>;
  difficulty: AIDifficulty;
  stage?: string;
  icon: string;
}

export const CHALLENGES: Challenge[] = [
  { id: 'low_grav', name: 'LOW GRAVITY', desc: 'The rift thins. Everything floats — recoveries are easy, so are KOs off the top.', mods: { lowGravity: true }, difficulty: 'normal', icon: 'moon' },
  { id: 'giant', name: 'GIANT MODE', desc: 'Colossal fighters, colossal damage. Space is tight and every hit shakes the world.', mods: { giant: true }, difficulty: 'normal', icon: 'maximize' },
  { id: 'tiny', name: 'TINY ARENA', desc: 'A cramped shard of a stage. Blast zones hover at your heels.', mods: { tinyArena: true }, difficulty: 'hard', icon: 'minimize' },
  { id: 'ohko', name: 'ONE-HIT KO', desc: 'Two stocks. The first clean hit takes one. Do not get touched.', mods: { oneHitKO: true }, difficulty: 'normal', icon: 'zap' },
  { id: 'hkb', name: 'HEAVY IMPACT', desc: 'Knockback dialed way up. Mid percentages become lethal.', mods: { highKnockback: true }, difficulty: 'normal', icon: 'wind' },
  { id: 'infsp', name: 'INFINITE SPECIALS', desc: 'No special cooldowns for either fighter. Spam wisely.', mods: { infiniteSpecials: true }, difficulty: 'hard', icon: 'infinity' },
  { id: 'moving', name: 'MOVING MAYHEM', desc: 'Every platform drifts, even the ones that never moved before.', mods: { movingPlatforms: true }, difficulty: 'hard', icon: 'move' },
  { id: 'chaos', name: 'CHAOS HAZARDS', desc: 'Lava surges, gusts and rift shifts come three times as often. Good luck.', mods: { chaosHazards: true }, difficulty: 'expert', stage: 'volcano', icon: 'flame' },
];
