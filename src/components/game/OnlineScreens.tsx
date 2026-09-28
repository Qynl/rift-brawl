// ============ RIFT BRAWL — Online Lobby Screens (V4) ============
// Browse (create/join by code) → Lobby room (chars, ready, host stage/start).

'use client';

import { useEffect, useRef, useState } from 'react';
import MenuBackground from './MenuBackground';
import { useFighterPreview } from './preview';
import { FIGHTER_LIST, FIGHTER_IDS } from '@/lib/game/fighters/configs';
import { FighterId } from '@/lib/game/core/types';
import { STAGE_IDS } from '@/lib/game/stages/stages';
import { audio } from '@/lib/game/audio/AudioManager';
import type { LobbyPlayer, LobbyState } from '@/lib/game/net/protocol';
import { net, NetStatus } from '@/lib/game/net/NetClient';

const PLAYER_COLORS = ['#00e5b0', '#ff8fbd', '#ffd166', '#9fd0ff'];

function charInfo(id: string) {
  return FIGHTER_LIST.find(f => f.info.id === id) ?? FIGHTER_LIST[0];
}

// ---------------- BROWSE ----------------

export function OnlineBrowse({ status, error, onBack, onCreate, onJoin, defaultName }: {
  status: NetStatus;
  error: string | null;
  onBack(): void;
  onCreate(name: string): void;
  onJoin(code: string, name: string): void;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState('');
  const busy = status === 'connecting';

  return (
    <div className="relative w-full h-full flex flex-col scanlines overflow-hidden">
      <MenuBackground intensity={0.6} />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col max-w-md mx-auto w-full px-6 py-5 overflow-y-auto rb-scroll">
        <header className="rb-head">
          <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← BACK</button>
          <span className={`text-[10px] tracking-[0.3em] font-bold ${status === 'online' ? 'text-[#00e5b0]' : 'text-[#ffd166]'}`}>
            {status === 'online' ? '● CONNECTED' : status === 'connecting' ? '○ CONNECTING…' : '○ OFFLINE'}
          </span>
        </header>

        <h2 className="rb-logo font-black text-4xl text-center mb-1">ONLINE</h2>
        <p className="text-center text-[11px] text-white/40 tracking-wider mb-8">Fight real players · up to 4 per lobby · share the code</p>

        <label className="block mb-5">
          <span className="rb-sec mb-1.5">YOUR NAME</span>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 12))}
            maxLength={12}
            placeholder="PLAYER"
            className="mt-1 w-full bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white font-bold tracking-widest uppercase outline-none focus:border-[#00e5b0]/60"
          />
        </label>

        <button
          className="rb-btn rb-primary !py-4 text-base"
          disabled={busy}
          onClick={() => { audio.play('ui_start'); onCreate(name || 'PLAYER'); }}
        >
          CREATE LOBBY ▶
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] tracking-[0.3em] text-white/30 font-bold">OR JOIN WITH A CODE</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD"
            maxLength={4}
            className="flex-1 bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white font-black tracking-[0.5em] uppercase text-center outline-none focus:border-[#00e5b0]/60"
          />
          <button
            className="rb-btn !py-2.5 !px-6 !w-auto"
            disabled={code.length < 4 || busy}
            onClick={() => { audio.play('ui_select'); onJoin(code, name || 'PLAYER'); }}
          >
            JOIN ▶
          </button>
        </div>

        {error && <div className="mt-5 text-center text-[12px] text-[#ff8a5c] bg-[#ff8a5c]/10 border border-[#ff8a5c]/30 rounded px-3 py-2">{error}</div>}

        <div className="mt-auto pt-8 text-center text-[10px] text-white/25 tracking-widest leading-relaxed">
          Host-authoritative netcode · snapshots at 30Hz<br />Works best with a stable connection
        </div>
      </div>
    </div>
  );
}

// ---------------- LOBBY ROOM ----------------

function LobbySlot({ p, slot, mySlot, isHost, onCycleChar, onToggleReady }: {
  p: LobbyPlayer | null;
  slot: number;
  mySlot: number;
  isHost: boolean;
  onCycleChar(dir: 1 | -1): void;
  onToggleReady(): void;
}) {
  const color = PLAYER_COLORS[slot % PLAYER_COLORS.length];
  const isMe = p && p.slot === mySlot;

  return (
    <div
      className={`panel rounded-lg p-3 flex items-center gap-3 transition-all ${p ? '' : 'opacity-40 border-dashed'}`}
      style={{ borderColor: p ? color + '88' : undefined }}
    >
      <div className="w-9 h-9 flex items-center justify-center font-black text-sm flex-shrink-0 rotate-45" style={{ background: color + '22', border: `1px solid ${color}66` }}>
        <span className="-rotate-45" style={{ color }}>{slot + 1}</span>
      </div>
      {p ? (
        <>
          <LobbySlotCanvas charId={p.char as FighterId} />
          <div className="min-w-0 flex-1">
            <div className="font-black tracking-widest text-sm truncate" style={{ color: charInfo(p.char).info.colors.glow }}>
              {p.name}{isMe ? ' (YOU)' : ''}
            </div>
            <div className="text-[10px] text-white/40 tracking-wider">
              {isHost ? 'HOST · ' : ''}
              {charInfo(p.char).info.name} · {charInfo(p.char).info.archetype}
            </div>
          </div>
          {isMe ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-1">
                <button className="w-7 h-7 bg-white/5 border border-white/15 hover:border-white/50 text-white/80 text-xs font-black" onClick={() => { audio.play('ui_move'); onCycleChar(-1); }}>◀</button>
                <button className="w-7 h-7 bg-white/5 border border-white/15 hover:border-white/50 text-white/80 text-xs font-black" onClick={() => { audio.play('ui_move'); onCycleChar(1); }}>▶</button>
              </div>
              <button
                className={`rb-chip !py-1 !px-2 ${p.ready ? 'rb-on' : ''}`}
                onClick={() => { audio.play('ui_select'); onToggleReady(); }}
              >
                {p.ready ? 'READY ✓' : 'READY UP'}
              </button>
            </div>
          ) : (
            <span className="text-[9px] tracking-widest font-bold" style={{ color: p.ready ? '#00e5b0' : 'rgba(255,255,255,0.35)' }}>
              {p.ready ? 'READY' : 'PICKING…'}
            </span>
          )}
        </>
      ) : (
        <div className="flex-1 text-[11px] tracking-widest text-white/30">WAITING FOR PLAYER…</div>
      )}
    </div>
  );
}

function LobbySlotCanvas({ charId }: { charId: FighterId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useFighterPreview(ref, charId, { zoom: 0.85, y: 1.0 });
  return <canvas ref={ref} className="w-12 h-12 flex-shrink-0" aria-hidden />;
}

export function OnlineLobby({ lobby, mySlot, status, error, onBack, onCycleChar, onToggleReady, onStart, onCopyCode }: {
  lobby: LobbyState;
  mySlot: number;
  status: NetStatus;
  error: string | null;
  onBack(): void;
  onCycleChar(dir: 1 | -1): void;
  onToggleReady(): void;
  onStart(stageId: string): void;
  onCopyCode(): void;
}) {
  const isHost = lobby.hostSlot === mySlot;
  const [stage, setStage] = useState(STAGE_IDS[0]);
  const [stocks, setStocks] = useState(3);
  const canStart = isHost && lobby.players.length >= 2 && lobby.players.every(p => p.ready || p.slot === mySlot);

  // poll ping for display
  const [ping, setPing] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPing(net.ping), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col scanlines overflow-hidden">
      <MenuBackground intensity={0.5} />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col max-w-2xl mx-auto w-full px-6 py-5 overflow-y-auto rb-scroll">
        <header className="rb-head">
          <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← LEAVE</button>
          <span className={`text-[10px] tracking-[0.3em] font-bold ${status === 'online' ? 'text-[#00e5b0]' : 'text-[#ffd166]'}`}>
            {status === 'online' ? `● ONLINE · ${ping}MS` : '○ RECONNECTING…'}
          </span>
        </header>

        {/* code banner */}
        <div className="panel rounded-xl p-5 mb-5 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.08]" style={{ background: `radial-gradient(circle at 50% 0%, ${PLAYER_COLORS[mySlot % 4]}, transparent 70%)` }} />
          <div className="text-[10px] tracking-[0.4em] text-white/40 mb-1 font-bold relative">LOBBY CODE</div>
          <button
            className="font-black text-5xl tracking-[0.35em] text-[#00e5b0] title-glow hover:text-white transition-colors relative"
            onClick={() => { onCopyCode(); audio.play('ui_select'); }}
            title="Copy code"
          >
            {lobby.code}
          </button>
          <div className="mt-2 text-[10px] text-white/35 tracking-wider relative">click the code to copy · friends pick ONLINE ▸ JOIN · {lobby.players.length}/4 players</div>
        </div>

        {error && <div className="mb-4 text-center text-[12px] text-[#ff8a5c] bg-[#ff8a5c]/10 border border-[#ff8a5c]/30 rounded px-3 py-2">{error}</div>}

        {/* players */}
        <div className="flex flex-col gap-2.5 mb-5">
          {[0, 1, 2, 3].map(slot => (
            <LobbySlot
              key={slot}
              slot={slot}
              p={lobby.players.find(p => p.slot === slot) ?? null}
              mySlot={mySlot}
              isHost={lobby.hostSlot === slot}
              onCycleChar={onCycleChar}
              onToggleReady={onToggleReady}
            />
          ))}
        </div>

        {/* host controls */}
        {isHost ? (
          <div className="panel rounded-lg p-4 mb-4">
            <div className="rb-sec mb-2">HOST · STAGE</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {STAGE_IDS.map(sid => (
                <button
                  key={sid}
                  className={`rb-chip !py-2 text-center ${stage === sid ? 'rb-on' : ''}`}
                  onClick={() => { setStage(sid); audio.play('ui_move'); }}
                >
                  {sid.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="rb-sec mb-2">STOCKS</div>
            <div className="grid grid-cols-5 gap-2 mb-1">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  className={`rb-chip !py-1.5 text-center ${stocks === s ? 'rb-gold-on' : ''}`}
                  onClick={() => { setStocks(s); audio.play('ui_move'); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel rounded-lg p-4 mb-4 text-[11px] text-white/50 tracking-wider">
            Waiting for the host to pick a stage and start the fight. Ready up so they know you&apos;re good to go!
          </div>
        )}

        {isHost && (
          <button
            className={`rb-btn rb-primary !py-4 text-base ${canStart ? '' : 'opacity-40'}`}
            onClick={() => { if (canStart) { audio.play('ui_start'); onStart(stage); } }}
          >
            {lobby.players.length < 2 ? 'NEED 2+ PLAYERS' : canStart ? `START MATCH ▶  ${stocks} STOCKS` : 'WAITING FOR READY…'}
          </button>
        )}
      </div>
    </div>
  );
}

/** cycle through the roster */
export function cycleChar(current: string, dir: 1 | -1): FighterId {
  const idx = FIGHTER_IDS.indexOf(current as FighterId);
  const n = FIGHTER_IDS.length;
  return FIGHTER_IDS[((idx < 0 ? 0 : idx) + dir + n) % n];
}
