// ============ RIFT BRAWL — the hero console ============
//
// The thing sitting where a product site would put its sign-up field. It is
// not decoration: whatever you pick here is what the match actually starts
// with, so the first click on the page is already a decision about the game
// rather than a step towards one.

'use client';

import { useState } from 'react';
import type { AIDifficulty, FighterId } from '@/lib/game/core/types';
import { ROSTER, ROSTER_ORDER } from '@/lib/site/content';
import { launchGame } from './launch';

const DIFFICULTIES: { id: AIDifficulty; label: string }[] = [
  { id: 'easy', label: 'EASY' },
  { id: 'normal', label: 'NORMAL' },
  { id: 'hard', label: 'HARD' },
  { id: 'expert', label: 'EXPERT' },
];

export default function StartConsole() {
  const [index, setIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');

  const id: FighterId = ROSTER_ORDER[index];
  const fighter = ROSTER[id];
  const cycle = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + ROSTER_ORDER.length) % ROSTER_ORDER.length);

  return (
    <div
      className="site-console"
      style={{ ['--accent' as string]: fighter.color }}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] tracking-[0.3em] text-white/35 font-bold">
          CHOOSE YOUR BRAWLER
        </span>
        <span className="hidden sm:block text-[10px] tracking-[0.2em] text-white/25 font-bold">
          {String(index + 1).padStart(2, '0')} / {ROSTER_ORDER.length}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => cycle(-1)}
          aria-label="Previous brawler"
          className="site-cycle"
        >
          ‹
        </button>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{
                background: fighter.color,
                boxShadow: `0 0 14px ${fighter.color}`,
              }}
            />
            <span
              className="truncate text-[1.6rem] sm:text-[2.1rem] leading-none font-black tracking-[0.04em]"
              style={{ color: fighter.color }}
            >
              {fighter.name}
            </span>
          </div>
          <p className="mt-2 text-[11px] sm:text-xs tracking-[0.14em] text-white/45 font-bold uppercase">
            {fighter.archetype} · {fighter.weapon}
          </p>
        </div>

        <button
          type="button"
          onClick={() => cycle(1)}
          aria-label="Next brawler"
          className="site-cycle"
        >
          ›
        </button>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/55 min-h-[3.5rem]">
        <span className="font-bold" style={{ color: fighter.color }}>
          {fighter.resource}.{' '}
        </span>
        {fighter.rule}
      </p>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
        <div
          className="site-seg"
          role="group"
          aria-label="Opponent difficulty"
        >
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficulty(d.id)}
              aria-pressed={difficulty === d.id}
              className={`site-seg-btn${difficulty === d.id ? ' is-on' : ''}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => launchGame({ mode: 'quick', fighter: id, difficulty })}
          className="site-start"
        >
          START MATCH
          <span aria-hidden className="text-base leading-none">→</span>
        </button>
      </div>
    </div>
  );
}
