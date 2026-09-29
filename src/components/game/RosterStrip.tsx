// ============ RIFT BRAWL — main-menu roster strip ============
//
// Twelve live, animated fighter previews. Each one runs the real renderer, so
// this component transitively owns Fighter, render.ts, the particle system and
// the stage builders. It is loaded lazily by MainMenu after first paint: the
// menu is interactive immediately and the portraits fade in a moment later,
// instead of every visitor waiting on the whole engine before seeing anything.

'use client';

import { useRef } from 'react';
import { useFighterPreview } from './preview';
import { FIGHTER_LIST } from '@/lib/game/fighters/configs';
import { CharacterInfo } from '@/lib/game/core/types';

export default function RosterStrip() {
  return (
    <div className="w-full max-w-6xl mx-auto relative z-10 px-6 pb-3" aria-label="Fighter roster">
      <div className="rb-rail px-5 py-3">
        <div className="text-center text-[9px] tracking-[0.5em] text-white/35 mb-2 font-bold">THE ROSTER</div>
        <div className="flex items-end justify-center gap-1 flex-wrap">
          {FIGHTER_LIST.map((f, i) => (
            <RosterEntry key={f.info.id} info={f.info} delay={i * 0.14} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterEntry({ info, delay }: { info: CharacterInfo; delay: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useFighterPreview(ref, info.id, { zoom: 1.0, y: 1.04 });
  return (
    <div className="roster-slot anim-slide-up group" style={{ animationDelay: `${delay}s` }}>
      <canvas ref={ref} className="w-[72px] h-[72px]" aria-hidden />
      <div className="roster-name" style={{ color: info.colors.glow }}>{info.name}</div>
    </div>
  );
}
