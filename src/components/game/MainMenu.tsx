// ============ RIFT BRAWL — main menu ============
//
// Deliberately light: menu chrome, the procedural background and nothing else.
// Everything expensive downstream of it (fighter previews, character select,
// the simulation) is code-split so the landing screen paints fast on a phone.

'use client';

import dynamic from 'next/dynamic';
import MenuBackground from './MenuBackground';
import { audio } from '@/lib/game/audio/AudioManager';

const RosterStrip = dynamic(() => import('./RosterStrip'), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-6xl mx-auto relative z-10 px-6 pb-3" aria-hidden>
      <div className="rb-rail px-5 py-3">
        <div className="text-center text-[9px] tracking-[0.5em] text-white/35 mb-2 font-bold">THE ROSTER</div>
        <div className="flex items-end justify-center gap-1 flex-wrap">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="roster-slot">
              <div className="w-[72px] h-[72px] bg-white/[0.03] anim-pulse-soft" />
              <div className="roster-name text-white/15">····</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
});

export default function MainMenu({ onNavigate, profile }: {
  onNavigate: (id: 'play' | 'online' | 'arcade' | 'survival' | 'training' | 'local' | 'challenges' | 'replays' | 'profile' | 'settings' | 'howto') => void;
  profile: { wins: number; matches: number };
}) {
  const items: { id: Parameters<typeof onNavigate>[0]; label: string; desc: string }[] = [
    { id: 'play', label: 'PLAY', desc: 'Quick match vs CPU' },
    { id: 'online', label: 'ONLINE', desc: 'Lobby code · up to 4 players' },
    { id: 'arcade', label: 'ARCADE', desc: 'Climb the five-fight gauntlet' },
    { id: 'survival', label: 'SURVIVAL', desc: 'Endless escalating waves' },
    { id: 'local', label: 'LOCAL VS', desc: 'Two players, one keyboard' },
    { id: 'training', label: 'TRAINING', desc: 'Lab it up, frame by frame' },
    { id: 'challenges', label: 'CHALLENGES', desc: 'Modifier trials' },
    { id: 'replays', label: 'REPLAYS', desc: 'Watch, export, share your matches' },
    { id: 'profile', label: 'PROFILE', desc: 'Career stats & mastery' },
    { id: 'settings', label: 'SETTINGS', desc: 'Audio, video, keybinds' },
  ];
  return (
    <div className="relative w-full h-full flex flex-col scanlines overflow-hidden">
      <MenuBackground />
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto rb-scroll flex flex-col">
        <div className="my-auto w-full max-w-6xl mx-auto w-full flex flex-col lg:flex-row items-center justify-center gap-10 px-8 pt-8 pb-3">

          {/* ---- hero column ---- */}
          <div className="text-center lg:text-left anim-rise">
            <div className="rb-kicker mb-3 anim-pulse-soft">A RIFT-POWERED PLATFORM FIGHTER</div>
            <h1 className="rb-logo font-black text-7xl xl:text-8xl select-none">
              RIFT<br />BRAWL
            </h1>
            <div className="mt-5 flex flex-wrap justify-center lg:justify-start gap-1.5">
              {['12 FIGHTERS', '6 STAGES', 'ONLINE 4P', 'ADAPTIVE AI'].map(f => (
                <span key={f} className="rb-chip !cursor-default !text-[9px] !px-2.5 !py-1">{f}</span>
              ))}
            </div>
            {profile.matches > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 border border-white/10 bg-white/[0.03] clip-path-none text-[11px] tracking-widest text-white/50">
                <span className="w-1.5 h-1.5 bg-[#00e5b0] rotate-45" />
                CAREER&nbsp;<b className="text-white/80">{profile.wins}W</b> – {profile.matches - profile.wins}L
              </div>
            )}
          </div>

          {/* ---- menu column ---- */}
          <nav className="w-full max-w-sm flex flex-col gap-2 anim-rise" style={{ animationDelay: '0.08s' }} aria-label="Main menu">
            {items.map((it, i) => (
              <button
                key={it.id}
                className="rb-btn rb-menu-item group"
                onMouseEnter={() => audio.play('ui_move')}
                onClick={() => { audio.play('ui_select'); onNavigate(it.id); }}
                style={{ animation: `slideUp 0.4s ease ${i * 0.045}s both` }}
              >
                <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1">
                  {it.label}
                  <span className="block text-[10px] font-semibold tracking-normal text-white/40 group-hover:text-white/65 transition-colors">{it.desc}</span>
                </span>
                <span className="rb-arrow">▶</span>
              </button>
            ))}
            <button
              className="rb-btn mt-1 opacity-85"
              onMouseEnter={() => audio.play('ui_move')}
              onClick={() => { audio.play('ui_select'); onNavigate('howto'); }}
            >
              <span className="idx">?</span>
              <span className="flex-1">HOW TO PLAY<span className="block text-[10px] font-semibold tracking-normal text-white/40">Controls, ledges & tips</span></span>
            </button>
          </nav>
        </div>
        <RosterStrip />
      </div>
      <div className="absolute bottom-2.5 right-4 text-[10px] text-white/25 tracking-widest z-10">V4.0 · OBSIDIAN GLASS · KEYBOARD + GAMEPAD · DESKTOP RECOMMENDED</div>
    </div>
  );
}
