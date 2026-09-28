// ============ RIFT BRAWL — Settings, Profile, Challenges, How-to (V4) ============

'use client';

import { useEffect, useState } from 'react';
import MenuBackground from './MenuBackground';
import { GameSettings, ProfileData, ActionName, FighterId } from '@/lib/game/core/types';
import { ALL_ACTIONS } from '@/lib/game/core/types';
import { InputManager } from '@/lib/game/core/input';
import { CHALLENGES } from '@/lib/game/challenges';
import { FIGHTER_LIST } from '@/lib/game/fighters/configs';
import { audio } from '@/lib/game/audio/AudioManager';

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="rb-head">
      <button className="rb-back" onClick={() => { audio.play('ui_back'); onBack(); }}>← BACK</button>
      <h2 className="rb-head-title">{title}</h2>
      <div className="rb-head-rule" />
    </header>
  );
}

function Slider({ label, v, on, min = 0, max = 1, fmt }: { label: string; v: number; on: (v: number) => void; min?: number; max?: number; fmt?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-36 text-[11px] tracking-widest text-white/60 uppercase font-bold">{label}</span>
      <input type="range" className="rift-slider flex-1" min={min} max={max} step={0.05} value={v}
        onChange={e => on(parseFloat(e.target.value))} />
      <span className="w-10 text-right text-[11px] text-white/50 font-bold">{fmt ? fmt(v) : `${Math.round(v * 100)}%`}</span>
    </label>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <button
      onClick={() => { audio.play('ui_move'); on(!v); }}
      className="flex items-center justify-between w-full py-1.5"
      role="switch"
      aria-checked={v}
    >
      <span className="text-[11px] tracking-widest text-white/60 uppercase font-bold">{label}</span>
      <span className={`w-10 h-5 rounded-full relative transition-colors ${v ? 'bg-[#00e5b0]' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${v ? 'left-5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function OptionRow({ label, value, options, onSelect }: { label: string; value: string; options: readonly string[]; onSelect: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[11px] tracking-widest text-white/60 uppercase font-bold">{label}</span>
      <div className="flex gap-1.5">
        {options.map(q => (
          <button key={q} onClick={() => { audio.play('ui_move'); onSelect(q); }}
            className={`rb-chip ${value === q ? 'rb-on' : ''}`}>
            {q.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function KeybindRow({ player, action, binds, listening, onListen }: {
  player: 'p1' | 'p2'; action: ActionName; binds: GameSettings['keybinds'];
  listening: { player: 'p1' | 'p2'; action: ActionName } | null;
  onListen: (l: { player: 'p1' | 'p2'; action: ActionName }) => void;
}) {
  const isListening = listening?.player === player && listening?.action === action;
  return (
    <button
      className="flex items-center justify-between py-1 hover:bg-white/5 rounded px-1"
      onClick={() => { audio.play('ui_move'); onListen({ player, action }); }}
    >
      <span className="text-[11px] text-white/55 uppercase tracking-wider">{action}</span>
      <span className={`kbd-chip ${isListening ? 'listening' : ''}`}>{isListening ? 'PRESS…' : InputManager.bindLabel(binds[player][action])}</span>
    </button>
  );
}

// ---------------- SETTINGS ----------------

export function SettingsScreen({ settings, onChange, onBack, onResetData }: {
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
  onBack: () => void;
  onResetData: () => void;
}) {
  const [listening, setListening] = useState<{ player: 'p1' | 'p2'; action: ActionName } | null>(null);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        const s = { ...settings, keybinds: { ...settings.keybinds } };
        s.keybinds[listening.player] = { ...s.keybinds[listening.player], [listening.action]: e.code };
        onChange(s);
      }
      setListening(null);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
  }, [listening, settings, onChange]);

  const set = (patch: Partial<GameSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="relative w-full h-full scanlines">
      <MenuBackground intensity={0.4} />
      <div className="relative z-10 h-full overflow-y-auto rb-scroll max-w-4xl mx-auto px-6 py-5">
        <Header title="SETTINGS" onBack={onBack} />
        <div className="grid md:grid-cols-2 gap-5 pb-8">
          <section className="panel rounded-lg p-5 space-y-3">
            <h3 className="rb-sec">AUDIO</h3>
            <Slider label="Master" v={settings.masterVol} on={v => set({ masterVol: v })} />
            <Slider label="Music" v={settings.musicVol} on={v => set({ musicVol: v })} />
            <Slider label="SFX" v={settings.sfxVol} on={v => set({ sfxVol: v })} />
          </section>

          <section className="panel rounded-lg p-5 space-y-3">
            <h3 className="rb-sec">DISPLAY & FEEL</h3>
            <Slider label="Screen shake" v={settings.screenShake} on={v => set({ screenShake: v })} max={1.5} fmt={v => `${Math.round(v * 100)}%`} />
            <div className="flex items-center gap-3">
              <span className="w-36 text-[11px] tracking-widest text-white/60 uppercase font-bold">Particles</span>
              <OptionRow label="" value={settings.particles} options={['low', 'medium', 'high'] as const} onSelect={(v) => set({ particles: v as 'low' | 'medium' | 'high' })} />
            </div>
            <OptionRow label="Graphics" value={settings.quality} options={['low', 'medium', 'high'] as const} onSelect={(v) => set({ quality: v as 'low' | 'medium' | 'high' })} />
            <Toggle label="Show FPS" v={settings.showFps} on={v => set({ showFps: v })} />
            <Toggle label="Reduce flashing" v={settings.reduceFlashing} on={v => set({ reduceFlashing: v })} />
            <button
              className="rb-btn !py-2 mt-1"
              onClick={() => {
                const el = document.documentElement;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el.requestFullscreen?.();
              }}
            >
              <span className="idx">⛶</span> TOGGLE FULLSCREEN
            </button>
          </section>

          <section className="panel rounded-lg p-5">
            <h3 className="rb-sec mb-2">P1 KEYBINDS</h3>
            <div className="grid grid-cols-2 gap-x-4">
              {ALL_ACTIONS.map(a => <KeybindRow key={a} player="p1" action={a} binds={settings.keybinds} listening={listening} onListen={setListening} />)}
            </div>
          </section>

          <section className="panel rounded-lg p-5">
            <h3 className="rb-sec mb-2">P2 KEYBINDS (LOCAL VS)</h3>
            <div className="grid grid-cols-2 gap-x-4">
              {ALL_ACTIONS.map(a => <KeybindRow key={a} player="p2" action={a} binds={settings.keybinds} listening={listening} onListen={setListening} />)}
            </div>
            <div className="text-[10px] text-white/35 mt-3">Gamepads are auto-detected: pad 1 → P1, pad 2 → P2. D-pad/stick move, A/B jump, X/RT attack, Y/RB special, LB grab, LT shield, Start/R3 dodge, L3 dash.</div>
          </section>

          <section className="panel rounded-lg p-5 md:col-span-2">
            <h3 className="rb-sec mb-2" style={{ color: '#ff5c8a' }}>DATA</h3>
            <button
              className="rb-chip !py-2 !px-4"
              style={{ borderColor: 'rgba(255,92,138,.5)', color: '#ff5c8a' }}
              onClick={() => { if (confirm('Erase all profile progress and settings?')) { onResetData(); } }}
            >
              RESET ALL SAVE DATA
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------- PROFILE ----------------

export function ProfileScreen({ profile, onBack }: { profile: ProfileData; onBack: () => void }) {
  const winRate = profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0;
  const fav = FIGHTER_LIST.find(f => f.info.id === profile.favorite);
  return (
    <div className="relative w-full h-full scanlines">
      <MenuBackground intensity={0.4} />
      <div className="relative z-10 h-full overflow-y-auto rb-scroll max-w-4xl mx-auto px-6 py-5">
        <Header title="PROFILE" onBack={onBack} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            ['MATCHES', profile.matches], ['WIN RATE', `${winRate}%`], ['KOs', profile.kos], ['FALLS', profile.falls],
            ['DAMAGE DEALT', Math.round(profile.damageDealt)], ['ARCADE BEST', `${profile.arcadeBest}/5`], ['SURVIVAL BEST', `WAVE ${profile.survivalBest}`], ['CHALLENGES', `${profile.challenges.length}/8`],
          ].map(([l, v]) => (
            <div key={String(l)} className="panel rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-[#00e5b0] title-glow">{v}</div>
              <div className="text-[9px] tracking-[0.25em] text-white/40 mt-1 font-bold">{l}</div>
            </div>
          ))}
        </div>
        <section className="panel rounded-lg p-5 mb-5">
          <h3 className="rb-sec mb-3">FIGHTER MASTERY {fav ? `· MAIN: ${fav.info.name}` : ''}</h3>
          <div className="space-y-3">
            {FIGHTER_LIST.map(f => {
              const m = profile.mastery[f.info.id as FighterId];
              const total = Math.max(1, ...Object.values(profile.mastery).map(x => x.games));
              return (
                <div key={f.info.id} className="flex items-center gap-3">
                  <span className="w-24 font-black text-xs tracking-widest" style={{ color: f.info.colors.glow }}>{f.info.name}</span>
                  <div className="stat-bar flex-1"><div className="stat-fill" style={{ width: `${(m.games / total) * 100}%` }} /></div>
                  <span className="text-[10px] text-white/50 w-28 text-right">{m.games} games · {m.wins}W · {m.kos} KOs</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel rounded-lg p-5">
          <h3 className="rb-sec mb-3">CHALLENGES COMPLETED</h3>
          <div className="flex flex-wrap gap-2">
            {CHALLENGES.map(c => (
              <span key={c.id} className={`rb-chip !cursor-default ${profile.challenges.includes(c.id) ? 'rb-on' : ''}`}>
                {profile.challenges.includes(c.id) ? '✓ ' : ''}{c.name}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------- CHALLENGES ----------------

export function ChallengesScreen({ completed, onStart, onBack }: {
  completed: string[];
  onStart: (challengeId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="relative w-full h-full scanlines">
      <MenuBackground intensity={0.5} />
      <div className="relative z-10 h-full overflow-y-auto rb-scroll max-w-5xl mx-auto px-6 py-5">
        <Header title="CHALLENGES" onBack={onBack} />
        <div className="grid md:grid-cols-2 gap-4 pb-8">
          {CHALLENGES.map((c, i) => {
            const done = completed.includes(c.id);
            return (
              <button
                key={c.id}
                className={`game-card rounded-lg p-4 text-left ${done ? 'border-[#00e5b0]/60' : ''}`}
                style={{ animation: `slideUp 0.35s ease ${i * 0.04}s both` }}
                onMouseEnter={() => audio.play('ui_move')}
                onClick={() => { audio.play('ui_select'); onStart(c.id); }}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div className="font-black tracking-widest text-[#ffd166]">{c.name}</div>
                  {done && <span className="text-[#00e5b0] text-sm font-black">✓ DONE</span>}
                </div>
                <p className="text-[11px] text-white/55 mt-1.5 leading-snug relative z-10">{c.desc}</p>
                <div className="mt-2.5 flex gap-1.5 flex-wrap relative z-10">
                  <span className="rb-chip !cursor-default !text-[9px] !py-0.5">AI: {c.difficulty.toUpperCase()}</span>
                  {Object.keys(c.mods).map(k => (
                    <span key={k} className="rb-chip !cursor-default !text-[9px] !py-0.5" style={{ borderColor: 'rgba(255,92,138,.35)', color: '#ff9cba', background: 'rgba(255,92,138,.12)' }}>
                      {k.replace(/([A-Z])/g, ' $1').toUpperCase()}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------- HOW TO PLAY ----------------

export function HowToScreen({ onBack, binds }: { onBack: () => void; binds: GameSettings['keybinds'] }) {
  const k = (player: 'p1' | 'p2', a: ActionName) => InputManager.bindLabel(binds[player][a]);
  const rows: [string, string][] = [
    ['MOVE', `${k('p1', 'left')} / ${k('p1', 'right')} — walk (holding never dashes)`],
    ['DASH BURST', `${k('p1', 'dash')} — quick burst in the direction you hold (or facing)`],
    ['JUMP · DOUBLE · TRIPLE', `${k('p1', 'jump')} — press again mid-air`],
    ['FAST FALL / DROP THROUGH', `${k('p1', 'down')} while falling / on thin platform`],
    ['ATTACK (+ direction)', `${k('p1', 'attack')} — neutral = 3-hit jab chain! forward, up, down, 5 aerials`],
    ['SPECIAL (+ direction)', `${k('p1', 'special')} — tap fires instantly, hold to overcharge`],
    ['GRAB & THROW', `${k('p1', 'grab')}, then a direction`],
    ['SHIELD (ground)', `${k('p1', 'shield')} — shrinks with damage; grabs beat it`],
    ['DODGE / ROLL / AIR-DODGE', `${k('p1', 'dodge')} + direction — ${k('p1', 'shield')} also dodges in the air`],
    ['LEDGE OPTIONS', 'from the hang: jump = ledge jump · attack = getup attack · dodge = roll up · down = drop'],
    ['PAUSE', 'ESC'],
  ];
  return (
    <div className="relative w-full h-full scanlines">
      <MenuBackground intensity={0.4} />
      <div className="relative z-10 h-full overflow-y-auto rb-scroll max-w-4xl mx-auto px-6 py-5">
        <Header title="HOW TO PLAY" onBack={onBack} />
        <div className="grid md:grid-cols-2 gap-5 pb-8">
          <section className="panel rounded-lg p-5">
            <h3 className="rb-sec mb-3">THE GOAL</h3>
            <p className="text-[12px] text-white/65 leading-relaxed mb-3">
              No health bars — damage <b className="text-[#ffd166]">percentages</b> only. The higher your %, the farther you fly when hit.
              Lose all your <b className="text-[#ffd166]">stocks</b> (lives) and the match is over. Toss your opponent past the blast zones to win.
            </p>
            <h3 className="rb-sec mb-3 mt-4">SIGNATURE WEAPONS</h3>
            <p className="text-[12px] text-white/65 leading-relaxed mb-3">
              Every brawler carries a real weapon — the Rift Saber, Cinder Falchion, Rift Sickle, Star-Iron Maul, Astral Staff,
              Storm Tonfa, Glacier Maul, Void Scythe, Dawn Lance, Venom Kamas, Gale War Fans and the Longshot Crossbow.
              Your weapon <b className="text-[#ffd166]">extends your melee reach</b>, so swings connect farther than your body —
              watch the colored slash arc to see exactly how far a move bites. Lances poke, mauls crash, fans reap wide, flurries multiply.
            </p>
            <h3 className="rb-sec mb-3 mt-4">LEDGES & RECOVERY</h3>
            <p className="text-[12px] text-white/65 leading-relaxed mb-3">
              Fall near a stage edge and you&apos;ll <b className="text-[#00e5b0]">grab the ledge</b> — you hang there briefly
              <b> invincible</b>. From the hang: press <b>jump</b> for a strong ledge jump, <b>attack</b> to climb up swinging,
              <b> dodge</b> to roll onto the stage, or <b>down</b> to let go. You can&apos;t regrab instantly, so mix up your getups —
              the CPU will be waiting to punish predictable ones.
            </p>
            <h3 className="rb-sec mb-3 mt-4">SKILL LAB</h3>
            <ul className="text-[12px] text-white/65 leading-relaxed list-disc pl-4 space-y-1.5">
              <li><b>DI (Directional Influence):</b> hold a direction while flying to bend your launch. Hold <b>up</b> on horizontal launches to survive the side blast.</li>
              <li><b>TECH:</b> press <b>shield or dodge</b> right as you hit the ground during a launch — you tech the landing: no bounce, keep your momentum, brief invincibility. Miss it and you bounce, stunned longer. The CPU techs too — bait and punish.</li>
              <li><b>WAVEDASH:</b> air-dodge diagonally into the ground and your momentum carries into a slide — fast repositioning while staying actionable. Great for baiting swings.</li>
              <li><b>Landing links:</b> buffer an attack as you land — the last frames of landing lag flow straight into jabs and tilts for continued combos.</li>
              <li><b>RAGE:</b> at high damage you hit harder — losing never means being powerless.</li>
              <li><b>Jab chains:</b> tap attack repeatedly for a 3-hit string — the last hit launches.</li>
              <li><b>Charge shots:</b> tap special for the quick shot — hold it and Ember&apos;s fireball becomes a meteor, Vanguard&apos;s slash fires a Rift Wave, Titan&apos;s maul overcharges (auto-fires at max).</li>
              <li><b>Sweetspots:</b> the first active frames of some moves (Vanguard dair, Titan haymaker, Tempest gale cutter) hit much harder. Time them.</li>
              <li><b>Parry:</b> raise shield within a few frames of impact for a perfect block — no chip, attacker staggers.</li>
              <li><b>Whiff punish:</b> when the CPU&apos;s swing misses, it&apos;s in recovery — that&apos;s your free hit.</li>
            </ul>
            <h3 className="rb-sec mb-3 mt-4">SURVIVAL TIPS</h3>
            <ul className="text-[12px] text-white/65 leading-relaxed list-disc pl-4 space-y-1.5">
              <li>Jump is <b>triple</b> — two extra jumps in the air. Offstage? Grab the ledge, then get up safely.</li>
              <li>Shield blocks attacks but <b>grabs beat shields</b>. Dodge to escape pressure.</li>
              <li>Counter picks (Vanguard down-special) punish telegraphed swings.</li>
              <li>At the edge, watch for spikes — down-air sends opponents straight down.</li>
              <li>Knockback scales with damage: above 100% most strong hits will kill.</li>
            </ul>
          </section>
          <section className="panel rounded-lg p-5">
            <h3 className="rb-sec mb-3">CONTROLS (P1)</h3>
            <div className="space-y-2">
              {rows.map(([a, b]) => (
                <div key={a} className="flex items-start justify-between gap-3 text-[11px]">
                  <span className="text-white/55 tracking-wider flex-shrink-0">{a}</span>
                  <span className="text-white font-bold text-right max-w-[65%]">{b}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-white/35 mt-3">Remap everything in SETTINGS. Gamepad supported.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
