// ============ RIFT BRAWL — site -> game handoff ============
//
// The landing page is server-rendered so that crawlers, link unfurls and
// people with scripting off get the real content instead of an empty canvas.
// That means its buttons cannot hold a callback into the client shell that
// owns the game, so the handoff goes through a DOM event instead: the buttons
// are tiny client islands that dispatch, and SiteShell listens.
//
// The alternative — making the whole page a client component so a context
// could reach it — would have cost the static HTML, which is the entire point
// of having a landing page.

import type { AIDifficulty, FighterId } from '@/lib/game/core/types';

export type LaunchMode = 'quick' | 'arcade' | 'survival' | 'training' | 'local' | 'online';

export interface LaunchDetail {
  mode?: LaunchMode;
  fighter?: FighterId;
  difficulty?: AIDifficulty;
}

export const LAUNCH_EVENT = 'riftbrawl:launch';

/** Ask the shell to swap the site out for the game. */
export function launchGame(detail: LaunchDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LaunchDetail>(LAUNCH_EVENT, { detail }));
}
