// ============ RIFT BRAWL — mode chips ============
//
// The suggestion-chip row under the hero. Each one is a real entry point:
// clicking Arcade starts an arcade run, it does not scroll you to a section
// that explains what arcade is.

'use client';

import { launchGame, type LaunchMode } from './launch';

export default function ModeCard({
  mode,
  title,
  blurb,
}: {
  mode: LaunchMode;
  title: string;
  blurb: string;
}) {
  return (
    <button type="button" onClick={() => launchGame({ mode })} className="site-chip">
      <span className="site-chip-title">{title}</span>
      <span className="site-chip-blurb">{blurb}</span>
    </button>
  );
}
