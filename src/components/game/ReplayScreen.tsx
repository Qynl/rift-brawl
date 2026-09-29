// ============ RIFT BRAWL — Replay Theatre ============
//
// Because the simulation is deterministic, a whole match is stored as nothing
// but the buttons that were pressed — roughly 6 KB per minute. This screen is
// the library: watch, export, import, delete.

'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import MenuBackground from './MenuBackground';
import { FIGHTER_CONFIGS } from '@/lib/game/fighters/configs';
import { STAGE_NAMES } from '@/lib/game/stages/stages';
import { audio } from '@/lib/game/audio/AudioManager';
import type { FighterId } from '@/lib/game/core/types';
import type { ReplayData } from '@/lib/game/replay/format';
import { replayBytes } from '@/lib/game/replay/format';
import {
  deleteReplay, clearReplays, downloadReplay, parseReplay, saveReplay, describeReplay,
  subscribeReplays, getReplaysSnapshot, getReplaysServerSnapshot,
} from '@/lib/game/replay/store';

function stageName(id: string): string {
  return STAGE_NAMES[id] ?? id.toUpperCase();
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function FighterChip({ id, won }: { id: string; won: boolean }) {
  const cfg = FIGHTER_CONFIGS[id as FighterId];
  const color = cfg?.info.colors.glow ?? '#9aa4c8';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-black tracking-widest"
      style={{
        color,
        border: `1px solid ${won ? color : 'rgba(255,255,255,0.12)'}`,
        background: won ? `${color}1a` : 'rgba(255,255,255,0.03)',
      }}
    >
      {won && <span className="w-1.5 h-1.5 rotate-45" style={{ background: color }} />}
      {cfg?.info.name ?? id.toUpperCase()}
    </span>
  );
}

export default function ReplayScreen({ onBack, onWatch }: {
  onBack: () => void;
  onWatch: (r: ReplayData) => void;
}) {
  const items = useSyncExternalStore(subscribeReplays, getReplaysSnapshot, getReplaysServerSnapshot);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalKb = items.reduce((n, r) => n + replayBytes(r), 0) / 1024;

  const onImport = async (file: File) => {
    const text = await file.text();
    const parsed = parseReplay(text);
    if (!parsed) { setNotice('That file is not a RIFT BRAWL replay.'); return; }
    saveReplay(parsed);
    setNotice('Replay imported.');
  };

  return (
    <div className="relative w-full h-full flex flex-col scanlines overflow-hidden">
      <MenuBackground />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        <header className="rb-head">
          <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← BACK</button>
          <h2 className="rb-head-title">REPLAY THEATRE</h2>
          <div className="rb-head-rule" />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto rb-scroll px-6 pb-8">
          <div className="max-w-3xl mx-auto">
            <p className="text-[11px] text-white/45 tracking-wide mb-4 leading-relaxed">
              Every offline match is recorded as an input track, not a video — about
              <b className="text-white/70"> 6 KB per minute</b>. Playback re-simulates the fight
              exactly, so you can watch it at any speed on any machine.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-5">
              <button className="rb-chip" onClick={() => fileRef.current?.click()}>IMPORT FILE</button>
              {items.length > 0 && (
                <button
                  className="rb-chip"
                  onClick={() => { if (confirm('Delete every saved replay?')) clearReplays(); }}
                >
                  CLEAR ALL
                </button>
              )}
              <span className="ml-auto text-[10px] tracking-widest text-white/35 font-bold">
                {items.length} SAVED · {totalKb.toFixed(1)} KB
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
              />
            </div>

            {notice && (
              <div className="mb-4 px-3 py-2 text-[11px] tracking-widest border border-[#00e5b0]/40 bg-[#00e5b0]/10 text-[#00e5b0] font-bold">
                {notice}
              </div>
            )}

            {items.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-5xl mb-3 opacity-20">▶</div>
                <div className="text-[12px] tracking-[0.3em] text-white/40 font-bold">NO REPLAYS YET</div>
                <div className="text-[11px] text-white/30 mt-2">
                  Finish an offline match and hit SAVE REPLAY on the results screen.
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map(r => (
                  <li key={r.id} className="panel p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      {r.meta.chars.map((c, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-white/20 text-[10px]">vs</span>}
                          <FighterChip id={c} won={r.meta.winner === i} />
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] tracking-widest text-white/35 font-bold">
                      {stageName(r.meta.stageId)} · {describeReplay(r.meta)}
                      {r.meta.timeout ? ' · TIME' : ''} · {timeAgo(r.meta.createdAt)}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        className="rb-chip rb-on"
                        onClick={() => { audio.play('ui_select'); onWatch(r); }}
                      >
                        ▶ WATCH
                      </button>
                      <button className="rb-chip" onClick={() => downloadReplay(r)}>EXPORT</button>
                      <button
                        className="rb-chip"
                        onClick={() => deleteReplay(r.id)}
                        aria-label="Delete replay"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
