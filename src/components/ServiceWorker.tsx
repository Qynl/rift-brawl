'use client';

import { useEffect } from 'react';

/**
 * Registers the offline service worker.
 *
 * Single-player RIFT BRAWL has no server dependency — the art, the audio and
 * the simulation are all produced at runtime — so once the shell is cached the
 * whole game keeps working with no network at all.
 *
 * Registration is deliberately deferred until after load so it never competes
 * with the first paint, and it is skipped in development where the dev server
 * serves uncacheable chunks.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration must never break the game.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
