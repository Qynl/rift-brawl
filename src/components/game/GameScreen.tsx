// ============ RIFT BRAWL — In-Game Screen: canvas host + overlays (V4) ============

'use client';

import { useEffect, useRef } from 'react';
import { GameEngine } from '@/lib/game/Engine';
import { MatchConfig, MatchResult, GameSettings, FighterId } from '@/lib/game/core/types';
import { MatchMods } from '@/lib/game/Match';
import { FIGHTER_CONFIGS } from '@/lib/game/fighters/configs';
import { fmtTime } from '@/lib/game/core/constants';
import { audio } from '@/lib/game/audio/AudioManager';
import { loadSave, saveSave } from '@/lib/game/core/save';
import type { NetSession } from './RiftBrawl';
import { net } from '@/lib/game/net/NetClient';
import type { Match } from '@/lib/game/Match';

interface Props {
  engine: GameEngine;
  config: MatchConfig;
  mods: MatchMods;
  settings: GameSettings;
  mode: 'quick' | 'arcade' | 'survival' | 'training' | 'local' | 'challenge' | 'online';
  netSession: NetSession | null;
  survivalWave: number;
  arcade: { index: number; wins: number; opponents: { p2: string; difficulty: string; personality: string; stage: string }[] } | null;
  arcadeLen: number;
  challengeId: string | null;
  result: MatchResult | null;
  paused: boolean;
  onPauseRequest(): void;
  onEnd(r: MatchResult): void;
  onResume(): void;
  onRestart(): void;
  onRematch(): void;
  onCharacterSelect(): void;
  onMenu(): void;
  onArcadeNext(): void;
  onSurvivalNext(): void;
  onBackToLobby(): void;
}

export default function GameScreen(props: Props) {
  const { engine, config, mods, settings, result, paused, netSession } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.applySettings(settings);
    engine.attach(canvas, {
      onEnd: props.onEnd,
      onPauseRequest: props.onPauseRequest,
    });
    engine.start(config, mods, netSession ? netSession.mode : 'off');
    // QA/debug hook: lets instrumented browser tests inspect the live match
    (window as unknown as Record<string, unknown>).__rb = engine;
    // netplay transport wiring lives outside the component scope
    wireNetTransport(engine, netSession);

    return () => {
      unwireNetTransport(engine);
      engine.detach();
      delete (window as unknown as Record<string, unknown>).__rb;
    };
  }, []);

  const winnerName = result
    ? result.winner === -1 ? 'DRAW' : (result.chars[result.winner] ? FIGHTER_CONFIGS[result.chars[result.winner]].info.name : 'DRAW')
    : '';

  const title = (() => {
    if (!result) return '';
    if (props.mode === 'online') return result.winner >= 0 ? `${winnerName} WINS!` : 'MATCH OVER';
    if (props.mode === 'local') return `${winnerName} WINS!`;
    if (props.mode === 'arcade') {
      if (result.winner === 0) {
        return props.arcade && props.arcade.index + 1 >= props.arcadeLen ? 'ARCADE CLEARED!' : 'OPPONENT DEFEATED!';
      }
      return 'RUN OVER';
    }
    if (props.mode === 'survival') {
      return result.winner === 0 ? `WAVE ${props.survivalWave} CLEARED` : `RUN OVER — WAVE ${props.survivalWave - 1}`;
    }
    if (props.mode === 'challenge') return result.winner === 0 ? 'CHALLENGE COMPLETE!' : 'CHALLENGE FAILED';
    return result.winner === 0 ? 'VICTORY!' : 'DEFEATED';
  })();

  const titleColor = result ? (result.winner === 0 ? '#00e5b0' : result.winner > 0 ? '#ff5c8a' : '#ffd166') : '';

  return (
    <div className="relative w-full h-full bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* PAUSE OVERLAY */}
      {!result && paused && (
        <PauseOverlay
          engine={engine}
          settings={settings}
          onResume={props.onResume}
          onRestart={props.onRestart}
          onMenu={props.onMenu}
        />
      )}

      {/* RESULTS OVERLAY */}
      {result && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-[3px] anim-zoom-in">
          <div className="panel rounded-xl p-7 w-[min(94vw,640px)] max-h-[92vh] overflow-y-auto rb-scroll scanlines relative">
            {/* winner glow bar */}
            <div
              className="absolute top-0 left-8 right-8 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${titleColor}, transparent)` }}
              aria-hidden
            />
            <div className="text-center mb-1 text-[11px] tracking-[0.4em] text-white/40 font-bold">
              {props.mode === 'arcade' ? `ARCADE · ${Math.min((props.arcade?.index ?? 0) + (result.winner === 0 ? 1 : 0), props.arcadeLen)}/${props.arcadeLen}`
                : props.mode === 'survival' ? `SURVIVAL · WAVE ${props.survivalWave}`
                  : props.mode === 'challenge' ? 'CHALLENGE' : 'MATCH COMPLETE'}
            </div>
            <h2 className="text-center font-black text-4xl tracking-widest title-glow mb-6" style={{ color: titleColor }}>
              {title}
            </h2>

            {/* stat table — supports 2..4 players */}
            <div className="mb-5">
              <div
                className="grid gap-x-3 gap-y-1.5 text-[12px]"
                style={{ gridTemplateColumns: `minmax(56px,1fr) repeat(${result.chars.length}, minmax(64px,auto))` }}
              >
                <div />
                {result.chars.map((cid, i) => (
                  <FighterStatHeader key={i} id={cid} label={result.labels[i] ?? `P${i + 1}`} highlight={result.winner === i} />
                ))}
                <StatRow label="DMG" vals={result.damageDealt} />
                <StatRow label="KO" vals={result.kos} />
                <StatRow label="STOCKS" vals={result.stocksLeft.map(s => Math.max(0, s))} />
                <StatRow label="COMBO" vals={result.bestCombo} />
                <StatRow label="TECHS" vals={result.techs ?? result.bestCombo.map(() => 0)} />
              </div>
              <div className="text-center text-white/40 pt-2 text-[11px] tracking-widest">TIME {fmtTime(result.durationFrames)}</div>
            </div>

            {/* next opponent preview (arcade) */}
            {props.mode === 'arcade' && result.winner === 0 && props.arcade && props.arcade.index + 1 < props.arcadeLen && (
              <div className="mb-4 p-3 rounded border border-[#ffd166]/40 bg-[#ffd166]/10 text-center">
                <div className="text-[10px] tracking-[0.3em] text-[#ffd166] mb-1 font-bold">NEXT OPPONENT</div>
                <div className="font-black tracking-widest text-[#ffd166]">
                  {FIGHTER_CONFIGS[props.arcade.opponents[props.arcade.index + 1].p2 as FighterId].info.name}
                  <span className="text-white/50 text-[11px] font-bold"> · {props.arcade.opponents[props.arcade.index + 1].difficulty.toUpperCase()}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {props.mode === 'online' ? (
                <OverlayButton primary onClick={props.onBackToLobby}>BACK TO LOBBY</OverlayButton>
              ) : (
                <>
                  {props.mode === 'arcade' && result.winner === 0 && (
                    <OverlayButton primary onClick={props.onArcadeNext}>
                      {(props.arcade?.index ?? 0) + 1 >= props.arcadeLen ? 'CLAIM VICTORY ▶' : 'NEXT OPPONENT ▶'}
                    </OverlayButton>
                  )}
                  {props.mode === 'survival' && result.winner === 0 && (
                    <OverlayButton primary onClick={props.onSurvivalNext}>
                      WAVE {props.survivalWave + 1} ▶
                    </OverlayButton>
                  )}
                  {props.mode !== 'arcade' && props.mode !== 'survival' && (
                    <OverlayButton primary onClick={props.onRematch}>REMATCH</OverlayButton>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                {props.mode !== 'local' && props.mode !== 'survival' && props.mode !== 'online' && (
                  <OverlayButton onClick={props.onCharacterSelect}>CHARACTERS</OverlayButton>
                )}
                <OverlayButton onClick={props.onMenu}>MAIN MENU</OverlayButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Connect the match/engine to the online transport (host relays snapshots, client mirrors). */
function wireNetTransport(engine: GameEngine, session: NetSession | null) {
  const match: Match | null = engine.match;
  if (!session || !match) return;
  const sorted = [...session.start.players].sort((a, b) => a.slot - b.slot);
  // lobby slot -> player index in the match
  const slotToIdx = new Map<number, number>();
  sorted.forEach((p, i) => slotToIdx.set(p.slot, i));

  if (session.mode === 'host') {
    match.netSend = snap => net.sendSnapshot(snap);
    engine.onFixedStep = () => {
      for (const pkt of net.drainInputs()) {
        const idx = slotToIdx.get(pkt.slot);
        if (idx !== undefined) match.queueRemoteInput(idx, pkt);
      }
    };
  } else {
    // client: send own input every step; apply host snapshots
    engine.onFixedStep = () => {
      const c = engine.input.controllers[0];
      net.sendInput(c.held as unknown as Record<string, boolean>, c.pressed as unknown as Record<string, boolean>, c.axisX, c.axisY);
      for (const snap of net.drainSnapshots()) match.applySnapshot(snap);
    };
  }
}

function unwireNetTransport(engine: GameEngine) {
  engine.onFixedStep = null;
  if (engine.match) engine.match.netSend = null;
}

function FighterStatHeader({ id, label, highlight }: { id: FighterId; label: string; highlight: boolean }) {
  const info = FIGHTER_CONFIGS[id].info;
  return (
    <div className={`flex flex-col items-center gap-0.5 pb-1 px-1 rounded ${highlight ? 'bg-[#ffd166]/10 ring-1 ring-[#ffd166]/40' : ''}`}>
      <span className="inline-block w-3 h-3 mt-1 rotate-45" style={{ background: info.colors.primary }} />
      <div className="text-center">
        <div className="font-black tracking-widest text-[11px]" style={{ color: info.colors.glow }}>{info.name}</div>
        <div className="text-[8px] tracking-widest text-white/40 truncate max-w-[80px]">{label}</div>
      </div>
    </div>
  );
}

function StatRow({ label, vals }: { label: string; vals: number[] }) {
  return (
    <>
      <div className="text-[10px] tracking-widest text-white/40 self-center font-bold">{label}</div>
      {vals.map((v, i) => (
        <div key={i} className="font-bold text-white text-center">{v}</div>
      ))}
    </>
  );
}

function OverlayButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      className={`rb-btn !py-3 ${primary ? 'rb-primary' : 'rb-ghost'}`}
      onMouseEnter={() => audio.play('ui_move')}
      onClick={() => { audio.play('ui_select'); onClick(); }}
    >
      {children}
    </button>
  );
}

function PauseOverlay({ engine, settings, onResume, onRestart, onMenu }: {
  engine: GameEngine;
  settings: GameSettings;
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
}) {
  useEffect(() => {
    engine.setPaused(true);
  }, [engine]);
  const setVol = (patch: Partial<GameSettings>) => {
    const s = { ...settings, ...patch };
    engine.applySettings(s);
    try {
      const { profile } = loadSave();
      saveSave(s, profile);
    } catch { /* ignore */ }
  };
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-[2px] anim-zoom-in">
      <div className="panel rounded-xl p-7 w-[min(92vw,400px)]">
        <div className="text-center text-[10px] tracking-[0.5em] text-white/35 mb-1 font-bold">MATCH PAUSED</div>
        <h2 className="text-center font-black text-3xl tracking-[0.3em] mb-6 text-white title-glow">PAUSED</h2>
        <div className="space-y-3 mb-5">
          {([
            ['MASTER', 'masterVol'], ['MUSIC', 'musicVol'], ['SFX', 'sfxVol'],
          ] as const).map(([label, key]) => (
            <label key={key} className="flex items-center gap-3">
              <span className="w-16 text-[10px] tracking-widest text-white/60 font-bold">{label}</span>
              <input
                type="range" className="rift-slider flex-1" min={0} max={1} step={0.05}
                value={settings[key]}
                onChange={e => setVol({ [key]: parseFloat(e.target.value) } as Partial<GameSettings>)}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <OverlayButton primary onClick={onResume}>RESUME</OverlayButton>
          <OverlayButton onClick={onRestart}>RESTART MATCH</OverlayButton>
          <OverlayButton onClick={onMenu}>QUIT TO MENU</OverlayButton>
        </div>
      </div>
    </div>
  );
}
