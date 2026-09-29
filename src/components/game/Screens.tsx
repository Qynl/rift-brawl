// ============ RIFT BRAWL — Menu, Character Select & Stage Select (V4) ============

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MenuBackground from './MenuBackground';
import { useFighterPreview } from './preview';
import { FIGHTER_LIST } from '@/lib/game/fighters/configs';
import { FighterId, AIPersonality, AIDifficulty } from '@/lib/game/core/types';
import { STAGE_BUILDERS, STAGE_IDS, renderStagePreview } from '@/lib/game/stages/stages';
import { audio } from '@/lib/game/audio/AudioManager';
import { traitFor } from '@/lib/game/fighters/traits';

// ---------------- shared bits ----------------

export function DifficultyDots({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`Difficulty ${n} of 3`}>
      {[1, 2, 3].map(i => (
        <span key={i} className={`w-2 h-[3px] skew-x-[-20deg] ${i <= n ? 'bg-[#00e5b0]' : 'bg-white/15'}`} />
      ))}
    </span>
  );
}

function StatBar({ label, v, color }: { label: string; v: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] tracking-widest text-white/45 uppercase font-bold">{label}</span>
      <div className="stat-bar flex-1"><div className="stat-fill" style={{ width: `${(v / 5) * 100}%`, background: color ? `linear-gradient(90deg, ${color}, ${color}99)` : undefined }} /></div>
      <span className="w-4 text-[10px] text-white/55 font-bold">{v}</span>
    </div>
  );
}

const PERSONALITIES: { id: AIPersonality; label: string; desc: string }[] = [
  { id: 'rusher', label: 'RUSHER', desc: 'Relentless pressure' },
  { id: 'defender', label: 'DEFENDER', desc: 'Blocks & punishes' },
  { id: 'zoner', label: 'ZONER', desc: 'Keeps distance' },
  { id: 'trickster', label: 'TRICKSTER', desc: 'Elusive mixups' },
  { id: 'grappler', label: 'GRAPPLER', desc: 'Grab-hungry' },
  { id: 'balanced', label: 'BALANCED', desc: 'Adaptable all-round' },
];

const DIFFICULTIES: { id: AIDifficulty; label: string }[] = [
  { id: 'easy', label: 'EASY' }, { id: 'normal', label: 'NORMAL' }, { id: 'hard', label: 'HARD' }, { id: 'expert', label: 'EXPERT' },
];

function Chip({ active, children, onClick, gold, title }: { active: boolean; children: React.ReactNode; onClick: () => void; gold?: boolean; title?: string }) {
  return (
    <button
      title={title}
      onClick={() => { audio.play('ui_move'); onClick(); }}
      className={`rb-chip ${active ? (gold ? 'rb-gold-on' : 'rb-on') : ''}`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// ---------------- CHARACTER SELECT ----------------

export interface SelectResult {
  p1: FighterId;
  p2: FighterId;
  personality: AIPersonality;
  difficulty: AIDifficulty;
}

function SlotPanel({ slot, label, sub, fighterId, active, onClick, mode }: {
  slot: 'p1' | 'p2';
  label: string;
  sub: string;
  fighterId: FighterId;
  active: boolean;
  onClick: () => void;
  mode: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const info = FIGHTER_LIST.find(f => f.info.id === fighterId)!.info;
  useFighterPreview(ref, fighterId, { zoom: 1.05, y: 0.98 });
  const color = slot === 'p1' ? '#00e5b0' : '#ff8fbd';
  return (
    <button
      onClick={() => { audio.play('ui_move'); onClick(); }}
      className={`slot-panel flex items-center gap-3 flex-1 min-w-0 p-3 text-left transition-all ${active ? 'slot-active' : ''}`}
      style={{ borderColor: active ? color : undefined }}
      aria-pressed={active}
      aria-label={`Select ${label}`}
    >
      <canvas ref={ref} className="w-14 h-14 flex-shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="text-[9px] tracking-[0.3em] font-bold" style={{ color }}>{label}<span className="text-white/30"> · {sub}</span></div>
        <div className="font-black tracking-widest text-sm truncate" style={{ color: info.colors.glow }}>{info.name}</div>
      </div>
      {active && <span className="ml-auto text-[9px] tracking-widest flex-shrink-0 font-bold" style={{ color }}>◀ PICKING</span>}
      {mode === 'local' && <span className="sr-only">slot {slot}</span>}
    </button>
  );
}

export function CharacterSelect({ mode, onConfirm, onBack, initial }: {
  mode: 'quick' | 'arcade' | 'survival' | 'training' | 'local' | 'challenge' | 'online';
  onConfirm: (r: SelectResult) => void;
  onBack: () => void;
  initial: SelectResult;
}) {
  const [p1, setP1] = useState<FighterId>(initial.p1);
  const [p2, setP2] = useState<FighterId>(initial.p2);
  const [personality, setPersonality] = useState<AIPersonality>(initial.personality);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initial.difficulty);
  const [activeSlot, setActiveSlot] = useState<'p1' | 'p2'>('p1');

  const activeId = activeSlot === 'p1' ? p1 : p2;
  const activeCfg = FIGHTER_LIST.find(f => f.info.id === activeId)!;
  const info = activeCfg.info;
  const needsOpponent = mode === 'quick' || mode === 'local' || mode === 'training';
  const p2Label = mode === 'local' ? 'P2 · HUMAN' : 'CPU';

  // BUGFIX: slot passed explicitly (stale-closure switched picks to the wrong fighter)
  const pick = (id: FighterId, slot: 'p1' | 'p2') => {
    if (slot === 'p1') setP1(id); else setP2(id);
    if (needsOpponent) {
      // auto-advance so picking P1 immediately readies the P2 slot
      setActiveSlot(slot === 'p1' ? 'p2' : 'p1');
    }
  };

  const detailCanvas = useRef<HTMLCanvasElement>(null);
  useFighterPreview(detailCanvas, activeId, { zoom: 1.7, y: 0.96 });

  return (
    <div className="relative w-full h-full flex flex-col scanlines overflow-hidden">
      <MenuBackground intensity={0.6} />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col max-w-6xl w-full mx-auto px-6 py-4">
        <header className="rb-head">
          <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← BACK</button>
          <h2 className="rb-head-title">{mode === 'local' ? 'P1 & P2 SELECT' : needsOpponent ? 'FIGHTER & OPPONENT' : 'CHOOSE YOUR FIGHTER'}</h2>
          <div className="rb-head-rule" />
        </header>

        {/* slot panels */}
        <div className="flex gap-3 mb-3 anim-slide-up">
          <SlotPanel slot="p1" label="P1" sub="YOU" fighterId={p1} active={activeSlot === 'p1'} onClick={() => setActiveSlot('p1')} mode={mode} />
          {needsOpponent && (
            <SlotPanel slot="p2" label="P2" sub={p2Label} fighterId={p2} active={activeSlot === 'p2'} onClick={() => setActiveSlot('p2')} mode={mode} />
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* roster grid */}
          <div className="flex-[1.12] flex flex-col gap-3 min-h-0">
            <div className="grid grid-cols-4 gap-2.5">
              {FIGHTER_LIST.map(f => {
                const pickedBy: Array<'p1' | 'p2'> = [];
                if (p1 === f.info.id) pickedBy.push('p1');
                if (p2 === f.info.id) pickedBy.push('p2');
                const isActive = activeId === f.info.id;
                return (
                  <button
                    key={f.info.id}
                    className={`game-card rounded-lg p-2 flex flex-col items-center gap-1 ${isActive ? 'selected' : ''} ${pickedBy.length ? 'picked' : ''}`}
                    onClick={() => { audio.play('ui_select'); pick(f.info.id, activeSlot); }}
                    onMouseEnter={() => audio.play('ui_move')}
                    aria-pressed={isActive}
                  >
                    <FighterThumb id={f.info.id} />
                    <div className="text-center relative z-10">
                      <div className="font-black tracking-widest text-[11px]" style={{ color: f.info.colors.glow }}>{f.info.name}</div>
                      <div className="text-[8px] text-white/45 uppercase tracking-wider">{f.info.archetype}</div>
                    </div>
                    {pickedBy.length > 0 && (
                      <span className="picked-badge">
                        {pickedBy.map(s => (s === 'p1' ? 'P1' : 'P2')).join('+')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* detail */}
            <div className="panel rounded-lg p-4 flex gap-4 items-center flex-1 min-h-[132px]">
              <div className="relative flex-shrink-0">
                <div
                  className="absolute -inset-3 rounded-full opacity-40 blur-xl"
                  style={{ background: `radial-gradient(circle, ${info.colors.glow}55, transparent 70%)` }}
                  aria-hidden
                />
                <canvas ref={detailCanvas} className="w-24 h-28 relative" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-black tracking-widest text-lg" style={{ color: info.colors.glow }}>{info.name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">{info.archetype}</span>
                  <span className="text-[10px] uppercase tracking-widest text-white/30">·</span>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">DIFFICULTY</span>
                  <DifficultyDots n={info.difficulty} />
                </div>
                <div
                  className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 mb-2 mt-1 border text-[10px] tracking-widest uppercase font-bold"
                  style={{ borderColor: info.colors.glow + '55', color: info.colors.glow, background: info.colors.glow + '14' }}
                  title="Every brawler carries a signature weapon — it extends their melee reach"
                >
                  <span className="text-white/45">WEAPON</span> {activeCfg.weapon.name}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <StatBar label="Speed" v={info.stats.speed} color={info.colors.glow} />
                  <StatBar label="Power" v={info.stats.power} color={info.colors.glow} />
                  <StatBar label="Weight" v={info.stats.weight} color={info.colors.glow} />
                  <StatBar label="Range" v={info.stats.range} color={info.colors.glow} />
                  <StatBar label="Recovery" v={info.stats.recovery} color={info.colors.glow} />
                </div>
                <p className="text-[11px] text-white/55 leading-snug mt-2">{info.desc}</p>

                {/* ---- SIGNATURE KIT: the mechanic that makes this brawler play differently ---- */}
                {(() => {
                  const trait = traitFor(info.id);
                  return (
                    <div
                      className="mt-2.5 rounded-md border p-2.5"
                      style={{ borderColor: trait.color + '44', background: trait.color + '0e' }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[9px] font-black tracking-[0.18em] px-1.5 py-0.5 rounded-sm"
                          style={{ background: trait.color + '22', color: trait.color }}
                        >
                          {trait.label}
                        </span>
                        <span className="text-[11px] font-bold tracking-wide" style={{ color: trait.color }}>
                          {trait.name}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-white/60 leading-snug">{trait.desc}</p>
                      <p className="text-[10px] text-white/40 leading-snug mt-1">
                        <span className="font-bold tracking-widest text-white/35">PASSIVE </span>
                        {trait.passive}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* right config column */}
          <div className="flex-1 flex flex-col gap-3 min-w-[260px]">
            {needsOpponent && mode !== 'local' && (
              <div className="panel rounded-lg p-4 anim-slide-up">
                <div className="rb-sec mb-2.5">AI PERSONALITY</div>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONALITIES.map(p => (
                    <Chip key={p.id} active={personality === p.id} onClick={() => setPersonality(p.id)} title={p.desc}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
                <div className="text-[10px] text-white/35 mt-2">{PERSONALITIES.find(p => p.id === personality)?.desc}</div>
                <div className="rb-sec mt-4 mb-2.5">DIFFICULTY</div>
                <div className="grid grid-cols-4 gap-2">
                  {DIFFICULTIES.map(d => (
                    <Chip key={d.id} active={difficulty === d.id} onClick={() => setDifficulty(d.id)} gold>{d.label}</Chip>
                  ))}
                </div>
              </div>
            )}
            {mode === 'local' && (
              <div className="panel rounded-lg p-4 text-[11px] text-white/60 leading-relaxed">
                <div className="rb-sec mb-2.5">LOCAL VS</div>
                P1: <kbd className="kbd-chip">WASD</kbd> + <kbd className="kbd-chip">J</kbd><kbd className="kbd-chip">K</kbd><kbd className="kbd-chip">L</kbd><br />
                P2: <kbd className="kbd-chip">←→↑↓</kbd> + <kbd className="kbd-chip">,</kbd><kbd className="kbd-chip">.</kbd><kbd className="kbd-chip">/</kbd>
                <div className="mt-2 text-white/40">Full bindings in SETTINGS.</div>
              </div>
            )}
            {mode === 'training' && (
              <div className="panel rounded-lg p-4 text-[11px] text-white/60">
                <div className="rb-sec mb-2.5">TRAINING FEATURES</div>
                Infinite stocks · reset positions <kbd className="kbd-chip">R</kbd> · reset damage <kbd className="kbd-chip">T</kbd> · hitboxes <kbd className="kbd-chip">H</kbd> · slow-mo <kbd className="kbd-chip">G</kbd> · swap dummy <kbd className="kbd-chip">Y</kbd> · combo & frame counter.
              </div>
            )}
            {!needsOpponent && mode === 'arcade' && (
              <div className="panel rounded-lg p-4 text-[11px] text-white/60 leading-relaxed">
                <div className="rb-sec mb-2.5">ARCADE RUN</div>
                Five opponents, rising difficulty, random stages. Between fights your damage resets but the pressure never does. How far can one fighter go?
              </div>
            )}
            {!needsOpponent && mode === 'survival' && (
              <div className="panel rounded-lg p-4 text-[11px] text-white/60 leading-relaxed">
                <div className="rb-sec mb-2.5">SURVIVAL</div>
                Endless waves. Each clear grants +1 stock (max 4) and a meaner opponent. Stocks carry between waves — nurse them.
              </div>
            )}
            {!needsOpponent && mode === 'challenge' && (
              <div className="panel rounded-lg p-4 text-[11px] text-white/60 leading-relaxed">
                <div className="rb-sec mb-2.5">CHALLENGE</div>
                A modifier trial with its own rules. Beat it to stamp your profile. Check the modifier text on the challenge card.
              </div>
            )}

            <div className="mt-auto">
              <button
                className="rb-btn rb-primary !py-4 text-lg"
                onClick={() => { audio.play('ui_start'); onConfirm({ p1, p2, personality, difficulty }); }}
              >
                SELECT STAGE ▶
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FighterThumb({ id }: { id: FighterId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useFighterPreview(ref, id, { zoom: 0.78, y: 1.0 });
  return <canvas ref={ref} className="w-16 h-16 relative z-10" aria-hidden />;
}

// ---------------- STAGE SELECT ----------------

export function StageSelect({ onConfirm, onBack, hazardsNote }: { onConfirm: (stageId: string) => void; onBack: () => void; hazardsNote?: string }) {
  const stages = useMemo(() => STAGE_IDS.map(id => STAGE_BUILDERS[id]()), []);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    stages.forEach((s, i) => {
      const c = refs.current[i];
      if (c) renderStagePreview(s, c);
    });
  }, [stages]);

  const all = [{ id: '__random', name: 'RANDOM', desc: 'Let the rift decide.', hazardLabel: null as string | null, preview: -1 }, ...stages.map((s, i) => ({ id: s.id, name: s.name, desc: s.desc, hazardLabel: s.hazardLabel, preview: i }))];

  return (
    <div className="relative w-full h-full scanlines overflow-hidden">
      <MenuBackground intensity={0.5} />
      <div className="relative z-10 h-full flex flex-col max-w-6xl mx-auto px-6 py-5">
        <header className="rb-head">
          <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← BACK</button>
          <h2 className="rb-head-title">CHOOSE STAGE</h2>
          <div className="rb-head-rule" />
        </header>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto rb-scroll pb-3 min-h-0">
          {all.map((s, i) => (
            <button
              key={s.id}
              className={`game-card overflow-hidden text-left flex flex-col ${sel === s.id ? 'selected' : ''}`}
              style={{ animation: `slideUp 0.4s ease ${i * 0.05}s both` }}
              onMouseEnter={() => audio.play('ui_move')}
              onClick={() => { setSel(s.id); audio.play('ui_select'); }}
              onDoubleClick={() => onConfirm(s.id)}
            >
              <div className="h-28 bg-black/55 relative">
                {s.preview >= 0 ? (
                  <canvas ref={el => { refs.current[s.preview] = el; }} width={260} height={120} className="w-full h-full object-cover" aria-hidden />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl anim-float">🎲</div>
                )}
                {s.hazardLabel && (
                  <span className="absolute top-1.5 right-1.5 bg-[#ff5c8a]/85 text-white text-[9px] font-bold px-1.5 py-0.5 tracking-wider">⚠ {s.hazardLabel}</span>
                )}
              </div>
              <div className="p-3 relative z-10">
                <div className="font-black tracking-widest text-sm text-[#00e5b0]">{s.name}</div>
                <div className="text-[10px] text-white/50 mt-1 leading-snug">{s.desc}</div>
              </div>
              <div className="mt-auto px-3 pb-3 relative z-10">
                <span
                  className="block text-center text-[11px] font-bold tracking-widest py-2 bg-[#00e5b0]/15 border border-[#00e5b0]/45 text-[#00e5b0] hover:bg-[#00e5b0]/32 transition-colors"
                  onClick={e => { e.stopPropagation(); onConfirm(s.id); }}
                  role="button"
                >
                  FIGHT HERE ▶
                </span>
              </div>
            </button>
          ))}
        </div>
        {hazardsNote && <div className="text-center text-[11px] text-white/40 tracking-widest">{hazardsNote}</div>}
        <div className="text-center text-[10px] text-white/25 tracking-widest mt-1">CLICK FIGHT HERE TO START · DOUBLE-CLICK A CARD ALSO WORKS</div>
      </div>
    </div>
  );
}
