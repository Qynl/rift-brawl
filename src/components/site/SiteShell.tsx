// ============ RIFT BRAWL — site / game shell ============
//
// Holds the two halves of the page together: a static marketing site that is
// server-rendered into the HTML, and the game, which is not in the initial
// bundle at all until someone asks for it.
//
// Three details that are easy to get wrong and annoying to live with:
//
//  * Back must leave the game. Launching pushes a history entry, so the
//    browser's back button does the obvious thing instead of leaving the page.
//  * The site scrolls, the game must not. Body overflow is owned here rather
//    than hard-coded in the layout, which is what used to make the whole
//    document unscrollable.
//  * The engine chunk is warmed during idle time, so the first click does not
//    pay for the download.

'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { LAUNCH_EVENT, launchGame, type LaunchDetail } from './launch';

const RiftBrawl = dynamic(() => import('@/components/game/RiftBrawl'), {
  ssr: false,
  loading: function GameLoading() {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#07060f]">
        <div className="text-[11px] tracking-[0.4em] text-white/40 font-bold anim-pulse-soft">
          ENTERING THE RIFT…
        </div>
      </div>
    );
  },
});

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const [launch, setLaunch] = useState<LaunchDetail | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    const onLaunch = (e: Event) => {
      const detail = (e as CustomEvent<LaunchDetail>).detail ?? {};
      launchedRef.current = true;
      // A history entry means Back returns to the site rather than leaving
      // the page. Arriving already on #play (a shared deep link) must not add
      // a second entry, or Back would land on #play again and do nothing.
      if (!window.location.hash.startsWith('#play')) {
        try {
          window.history.pushState({ rbPlaying: true }, '', '#play');
        } catch {
          /* history is unavailable in some embedded contexts; not fatal */
        }
      }
      setLaunch(detail);
    };

    const onPop = () => {
      // Only react to leaving the game; entering it is handled above.
      if (launchedRef.current && !window.location.hash.startsWith('#play')) {
        launchedRef.current = false;
        setLaunch(null);
      }
    };

    window.addEventListener(LAUNCH_EVENT, onLaunch);
    window.addEventListener('popstate', onPop);

    // Deep link: /#play drops straight into the game. This goes through the
    // same event as every button rather than setting state here — one path
    // into the game, and no cascading render from inside this effect. It has
    // to be deferred so the listener above is subscribed when it fires.
    if (window.location.hash.startsWith('#play')) {
      queueMicrotask(() => launchGame());
    }

    return () => {
      window.removeEventListener(LAUNCH_EVENT, onLaunch);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // The game is a fixed-position canvas; letting the document scroll behind it
  // produces rubber-banding on touch and a stray scrollbar on desktop.
  useEffect(() => {
    const playing = launch !== null;
    document.body.classList.toggle('is-playing', playing);
    return () => document.body.classList.remove('is-playing');
  }, [launch]);

  // Warm the engine chunk once the page is idle, so the first click is instant.
  useEffect(() => {
    if (launch) return;
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    const warm = () => {
      void import('@/components/game/RiftBrawl');
    };
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => {
        (window as typeof window & { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback?.(handle);
      };
    }
    const t = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(t);
  }, [launch]);

  if (launch) {
    return (
      <RiftBrawl
        initialMode={launch.mode}
        initialFighter={launch.fighter}
        initialDifficulty={launch.difficulty}
      />
    );
  }

  return <>{children}</>;
}
