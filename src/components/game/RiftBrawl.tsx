// ============ RIFT BRAWL — Root Component & Screen Flow ============

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AIDifficulty, AIPersonality, FighterId, GameSettings, MatchConfig, MatchResult,
  ProfileData,
} from '@/lib/game/core/types';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, loadSave, saveSave, wipeSave, updateFavorite } from '@/lib/game/core/save';
import type { GameEngine } from '@/lib/game/Engine';
import type { MatchMods } from '@/lib/game/Match';
import { audio } from '@/lib/game/audio/AudioManager';
import { STAGE_IDS } from '@/lib/game/stages/meta';
import { CHALLENGES } from '@/lib/game/challenges';
import { FIGHTER_IDS, cycleChar } from '@/lib/game/fighters/roster';
import MainMenu from './MainMenu';
import type { SelectResult } from './Screens';
import type { ReplayData } from '@/lib/game/replay/format';
import dynamic from 'next/dynamic';
import type { LobbyState, MatchStartMsg } from '@/lib/game/net/protocol';
import { net, NetStatus } from '@/lib/game/net/NetClient';

type Screen = 'menu' | 'select' | 'stage' | 'game' | 'settings' | 'profile' | 'challenges' | 'howto' | 'online' | 'replays';
export type Mode = 'quick' | 'arcade' | 'survival' | 'training' | 'local' | 'challenge' | 'online';

/**
 * The landing page can hand the game a starting point, so clicking "Arcade"
 * on the site opens character select for an arcade run rather than dropping
 * the player on a main menu they have to navigate again. Absent props keep
 * the original behaviour exactly.
 */
export interface RiftBrawlProps {
  initialMode?: Exclude<Mode, 'challenge'>;
  initialFighter?: FighterId;
  initialDifficulty?: AIDifficulty;
}

export interface NetSession {
  mode: 'host' | 'client';
  mySlot: number;
  start: MatchStartMsg;
}

interface ArcadeRun { index: number; wins: number; opponents: { p2: FighterId; difficulty: AIDifficulty; personality: AIPersonality; stage: string }[] }

const ARCADE_LEN = 5;

/**
 * The simulation (Match, the fixed-timestep Engine, the AI, the netcode) is
 * only needed once a fight actually starts, so it is split out of the initial
 * bundle and fetched on the way into a match. `preloadEngine` warms that
 * import as soon as the player commits to playing, so by the time they have
 * picked a character it is already resident.
 */
const GameScreen = dynamic(() => import('./GameScreen'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#07060f]">
      <div className="text-[11px] tracking-[0.4em] text-white/40 font-bold anim-pulse-soft">ENTERING THE RIFT…</div>
    </div>
  ),
});

let enginePromise: Promise<typeof import('@/lib/game/Engine')> | null = null;
function preloadEngine() {
  if (!enginePromise) enginePromise = import('@/lib/game/Engine');
  return enginePromise;
}

/**
 * Every screen other than the landing menu is code-split.
 *
 * The menu is the only thing a first-time visitor is guaranteed to see, and it
 * needs nothing but its own chrome; character select drags in the renderer,
 * stage select drags in six stage painters, the lobby drags in the socket
 * client. Loading them on navigation keeps the first paint small, and the
 * navigation itself is preceded by a click, which is plenty of time.
 */
const ScreenFallback = ({ label }: { label: string }) => (
  <div className="w-full h-full flex items-center justify-center bg-[#07060f]">
    <div className="text-[11px] tracking-[0.4em] text-white/40 font-bold anim-pulse-soft">{label}</div>
  </div>
);
const loadingOf = (label: string) => function ScreenLoading() { return <ScreenFallback label={label} />; };

const CharacterSelect = dynamic(() => import('./Screens').then(m => ({ default: m.CharacterSelect })),
  { ssr: false, loading: loadingOf('LOADING FIGHTERS…') });
const StageSelect = dynamic(() => import('./Screens').then(m => ({ default: m.StageSelect })),
  { ssr: false, loading: loadingOf('LOADING STAGES…') });
const SettingsScreen = dynamic(() => import('./MetaScreens').then(m => ({ default: m.SettingsScreen })),
  { ssr: false, loading: loadingOf('SETTINGS…') });
const ProfileScreen = dynamic(() => import('./MetaScreens').then(m => ({ default: m.ProfileScreen })),
  { ssr: false, loading: loadingOf('PROFILE…') });
const ChallengesScreen = dynamic(() => import('./MetaScreens').then(m => ({ default: m.ChallengesScreen })),
  { ssr: false, loading: loadingOf('CHALLENGES…') });
const HowToScreen = dynamic(() => import('./MetaScreens').then(m => ({ default: m.HowToScreen })),
  { ssr: false, loading: loadingOf('HOW TO PLAY…') });
const OnlineBrowse = dynamic(() => import('./OnlineScreens').then(m => ({ default: m.OnlineBrowse })),
  { ssr: false, loading: loadingOf('CONNECTING…') });
const OnlineLobby = dynamic(() => import('./OnlineScreens').then(m => ({ default: m.OnlineLobby })),
  { ssr: false, loading: loadingOf('CONNECTING…') });
const ReplayScreen = dynamic(() => import('./ReplayScreen'),
  { ssr: false, loading: loadingOf('LOADING REPLAYS…') });

function pickRandom<T>(arr: T[], exclude?: T): T {
  let v = arr[Math.floor(Math.random() * arr.length)];
  if (exclude !== undefined && arr.length > 1) {
    while (v === exclude) v = arr[Math.floor(Math.random() * arr.length)];
  }
  return v;
}

export default function RiftBrawl({ initialMode, initialFighter, initialDifficulty }: RiftBrawlProps = {}) {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  // Entry point is resolved once, as initial state rather than in an effect:
  // mounting straight onto the right screen avoids a frame of main menu and
  // the extra render that comes with it.
  const [screen, setScreen] = useState<Screen>(
    !initialMode ? 'menu' : initialMode === 'online' ? 'online' : 'select',
  );
  const [mode, setMode] = useState<Mode>(initialMode ?? 'quick');
  const [select, setSelect] = useState<SelectResult>({
    p1: initialFighter ?? 'vanguard',
    p2: initialFighter === 'titan' ? 'vanguard' : 'titan',
    personality: 'balanced',
    difficulty: initialDifficulty ?? 'normal',
  });
  const [stageId, setStageId] = useState<string>('forest');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [arcade, setArcade] = useState<ArcadeRun | null>(null);
  const [survivalWave, setSurvivalWave] = useState(1);
  const [survivalStocks, setSurvivalStocks] = useState(3);
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);
  const [overlay, setOverlay] = useState<'none' | 'pause' | 'results'>('none');
  const [matchKey, setMatchKey] = useState(0); // force new match on restart
  // ---- replay theatre ----
  const [watching, setWatching] = useState<ReplayData | null>(null);
  const watchingRef = useRef<ReplayData | null>(null);

  // ---- online state ----
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [mySlot, setMySlot] = useState(-1);
  // Entering straight from the site's ONLINE chip must also arm the socket,
  // otherwise the lobby screen mounts with nothing connecting behind it.
  const [onlineRequested, setOnlineRequested] = useState(initialMode === 'online');
  const [netStatus, setNetStatus] = useState<NetStatus>('offline');
  const [netError, setNetError] = useState<string | null>(null);
  const [netSession, setNetSession] = useState<NetSession | null>(null);
  const playerNameRef = useRef<string>('PLAYER');
  const [defaultName] = useState(() => {
    try { return localStorage.getItem('riftbrawl.name') || 'PLAYER'; } catch { return 'PLAYER'; }
  });

  // The engine module is code-split, so the instance appears asynchronously.
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const loadedRef = useRef(false);
  const [pendingConfig, setPendingConfig] = useState<MatchConfig | null>(null);

  // ---- load save once (sync from external system: localStorage) ----
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const { settings: s, profile: p } = loadSave();
    setSettings(s);
    setProfile(p);
    engineRef.current?.applySettings(s);
  }, []);

  // ---- audio unlock + menu music ----
  // The unlock listener is registered once but fires much later (first user
  // gesture). Reading `settings`/`screen` from the closure would replay the
  // DEFAULTS rather than whatever was loaded from the save, so the live values
  // are read through refs instead.
  const settingsRef = useRef(settings);
  const screenRef = useRef(screen);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  /** Load the engine chunk (if needed) and hand back a configured instance. */
  const ensureEngine = useCallback(async (): Promise<GameEngine> => {
    if (engineRef.current) return engineRef.current;
    const mod = await preloadEngine();
    if (engineRef.current) return engineRef.current;
    const e = new mod.GameEngine(settingsRef.current);
    e.applySettings(settingsRef.current);
    engineRef.current = e;
    setEngine(e);
    return e;
  }, []);


  // Warm the code-split simulation chunk the moment the player heads toward a
  // fight (character select, stage select, a lobby, the replay theatre) and
  // guarantee an instance exists by the time the game screen mounts.
  useEffect(() => {
    if (screen === 'menu' || screen === 'settings' || screen === 'profile' || screen === 'howto') return;
    void ensureEngine();
  }, [screen, ensureEngine]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { watchingRef.current = watching; }, [watching]);

  // Mirror the reduced-motion preference onto <html> so the CSS menu
  // animations obey the in-game toggle, not just the OS setting.
  useEffect(() => {
    const el = document.documentElement;
    if (settings.reduceMotion) el.setAttribute('data-reduce-motion', '1');
    else el.removeAttribute('data-reduce-motion');
  }, [settings.reduceMotion]);

  useEffect(() => {
    const unlock = () => {
      const s = settingsRef.current;
      audio.ensure();
      audio.setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol });
      if (screenRef.current !== 'game') audio.playMusic('menu');
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const persist = useCallback((s: GameSettings, p: ProfileData) => {
    saveSave(s, p);
  }, []);

  const changeSettings = (s: GameSettings) => {
    setSettings(s);
    engineRef.current?.applySettings(s);
    audio.setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol });
    saveSave(s, profile);
  };

  // ---- match config builders ----

  const buildMods = useCallback((challenge?: string | null): MatchMods => {
    const ch = challenge ? CHALLENGES.find(c => c.id === challenge) : null;
    return {
      lowGravity: !!ch?.mods.lowGravity,
      giant: !!ch?.mods.giant,
      tinyArena: !!ch?.mods.tinyArena,
      oneHitKO: !!ch?.mods.oneHitKO,
      highKnockback: !!ch?.mods.highKnockback,
      infiniteSpecials: !!ch?.mods.infiniteSpecials,
      movingPlatforms: !!ch?.mods.movingPlatforms,
      chaosHazards: !!ch?.mods.chaosHazards,
      reduceFlash: settings.reduceFlashing,
      particleQ: settings.particles === 'high' ? 1 : settings.particles === 'medium' ? 0.6 : 0.35,
      showFps: settings.showFps,
      quality: settings.quality,
      reduceMotion: settings.reduceMotion,
      hudScale: settings.hudScale,
      playerMarkers: settings.playerMarkers,
    };
  }, [settings]);

  const currentMatchConfig = useCallback((): MatchConfig => {
    const stage = challengeId ? (CHALLENGES.find(c => c.id === challengeId)?.stage ?? stageId) : stageId;
    switch (mode) {
      case 'quick':
        return {
          players: [
            { char: select.p1, label: 'YOU', kind: 'local' },
            { char: select.p2, label: 'CPU', kind: 'ai', personality: select.personality, difficulty: select.difficulty },
          ],
          stocks: 3, stageId: stage,
        };
      case 'local':
        return {
          players: [
            { char: select.p1, label: 'P1', kind: 'local' },
            { char: select.p2, label: 'P2', kind: 'local' },
          ],
          stocks: 3, stageId: stage,
        };
      case 'training':
        return {
          players: [
            { char: select.p1, label: 'YOU', kind: 'local' },
            { char: select.p2, label: 'DUMMY', kind: 'ai', personality: select.personality, difficulty: select.difficulty },
          ],
          stocks: 99, stageId: stage, training: { dummy: 'stand' },
        };
      case 'arcade': {
        const opp = arcade?.opponents[arcade.index];
        return {
          players: [
            { char: select.p1, label: 'YOU', kind: 'local' },
            { char: opp?.p2 ?? 'titan', label: 'CPU', kind: 'ai', personality: opp?.personality ?? 'balanced', difficulty: opp?.difficulty ?? 'normal' },
          ],
          stocks: 3, stageId: opp?.stage ?? stage,
        };
      }
      case 'survival': {
        const wave = survivalWave;
        const difficulty: AIDifficulty = wave <= 2 ? 'easy' : wave <= 4 ? 'normal' : wave <= 7 ? 'hard' : 'expert';
        const personalities: AIPersonality[] = ['rusher', 'defender', 'zoner', 'trickster', 'grappler', 'balanced'];
        return {
          players: [
            { char: select.p1, label: 'YOU', kind: 'local' },
            { char: pickRandom(FIGHTER_IDS.filter(f => f !== select.p1)), label: 'CPU', kind: 'ai', personality: pickRandom(personalities), difficulty },
          ],
          stocks: survivalStocks, stageId: pickRandom(STAGE_IDS),
        };
      }
      case 'challenge': {
        const ch = CHALLENGES.find(c => c.id === challengeId);
        return {
          players: [
            { char: select.p1, label: 'YOU', kind: 'local' },
            { char: pickRandom(FIGHTER_IDS.filter(f => f !== select.p1)), label: 'CPU', kind: 'ai', personality: 'balanced', difficulty: ch?.difficulty ?? 'normal' },
          ],
          stocks: 3, stageId: stage,
        };
      }
      case 'online':
        // filled by the net session path
        return { players: [{ char: select.p1, label: 'YOU', kind: 'local' }, { char: select.p2, label: 'CPU', kind: 'ai', personality: 'balanced', difficulty: 'normal' }], stocks: 3, stageId: stage };
    }
  }, [mode, select, stageId, arcade, survivalWave, survivalStocks, challengeId]);

  // ---- match end: profile & flow ----
  const handleMatchEnd = useCallback((result: MatchResult) => {
    setLastResult(result);
    setOverlay('results');
    // Watching a recording must never touch career stats.
    if (watchingRef.current) { audio.playMusic('results'); return; }
    // update profile
    setProfile(prev => {
      const p: ProfileData = JSON.parse(JSON.stringify(prev));
      p.matches++;
      const won = result.winner === 0;
      if (mode !== 'training' && mode !== 'local' && mode !== 'online') {
        if (won) p.wins++; else p.losses++;
      }
      p.kos += result.kos[0] ?? 0;
      p.falls += result.kos[1] ?? 0;
      p.damageDealt += result.damageDealt[0] ?? 0;
      const m = p.mastery[select.p1] ?? p.mastery[FIGHTER_IDS[0]];
      m.games++;
      if (won) m.wins++;
      m.kos += result.kos[0] ?? 0;
      p.favorite = updateFavorite(p);
      if (mode === 'arcade' && won) p.arcadeBest = Math.max(p.arcadeBest, (arcade?.index ?? 0) + 1);
      if (mode === 'survival') p.survivalBest = Math.max(p.survivalBest, survivalWave - 1);
      if (mode === 'challenge' && won && challengeId && !p.challenges.includes(challengeId)) {
        p.challenges.push(challengeId);
      }
      persist(settings, p);
      return p;
    });
    audio.playMusic('results');
  }, [mode, select.p1, arcade, survivalWave, challengeId, settings, persist]);

  // ---- flow actions ----

  const goMenu = () => { setOverlay('none'); setScreen('menu'); setArcade(null); setWatching(null); audio.playMusic('menu'); };

  const startRematch = () => {
    setOverlay('none');
    setMatchKey(k => k + 1);
    audio.playMusic(currentStageTheme());
  };

  function currentStageTheme() {
    return pendingConfig?.stageId ?? 'forest';
  }

  const toCharacterSelect = () => { setOverlay('none'); setScreen('select'); audio.playMusic('menu'); };

  const arcadeNext = () => {
    if (!arcade) { goMenu(); return; }
    const nextIndex = arcade.index + 1;
    if (nextIndex >= ARCADE_LEN) {
      // champion claimed — run complete
      goMenu();
      return;
    }
    const opp = arcade.opponents[nextIndex];
    setArcade({ ...arcade, index: nextIndex });
    setPendingConfig({
      players: [
        { char: select.p1, label: 'YOU', kind: 'local' },
        { char: opp.p2, label: 'CPU', kind: 'ai', personality: opp.personality, difficulty: opp.difficulty },
      ],
      stocks: 3, stageId: opp.stage,
    });
    setOverlay('none');
    setMatchKey(k => k + 1);
  };

  const survivalNext = () => {
    const nextWave = survivalWave + 1;
    const nextStocks = Math.min(4, survivalStocks + 1);
    setSurvivalWave(nextWave);
    setSurvivalStocks(nextStocks);
    const difficulty: AIDifficulty = nextWave <= 2 ? 'easy' : nextWave <= 4 ? 'normal' : nextWave <= 7 ? 'hard' : 'expert';
    const personalities: AIPersonality[] = ['rusher', 'defender', 'zoner', 'trickster', 'grappler', 'balanced'];
    setPendingConfig({
      players: [
        { char: select.p1, label: 'YOU', kind: 'local' },
        { char: pickRandom(FIGHTER_IDS.filter(f => f !== select.p1)), label: 'CPU', kind: 'ai', personality: pickRandom(personalities), difficulty },
      ],
      stocks: nextStocks, stageId: pickRandom(STAGE_IDS),
    });
    setOverlay('none');
    setMatchKey(k => k + 1);
  };

  // ---------------- ONLINE ----------------

  // The online transport is loaded and connected ONLY once the player asks for
  // it (see `onlineRequested`). Connecting on mount pulled socket.io into the
  // first paint for every offline player.
  useEffect(() => {
    if (!onlineRequested) return;
    net.connect({
      onStatus: s => setNetStatus(s),
      onError: msg => setNetError(msg),
      onJoined: info => { setLobby(info.lobby); setMySlot(info.slot); setNetError(null); },
      onLobbyState: l => setLobby(l),
      onMatchStart: msg => {
        const slotNow = net.mySlot;
        const lobbyNow = net.lobby;
        const mode = lobbyNow?.hostSlot === slotNow ? 'host' : 'client';
        setNetSession({ mode, mySlot: slotNow, start: msg });
        setMode('online');
        setOverlay('none');
        setLastResult(null);
        setMatchKey(k => k + 1);
        setScreen('game');
      },
      onMatchAborted: reason => {
        setNetSession(null);
        setOverlay('none');
        // read the live lobby, not the one captured when the handler was bound
        setScreen(net.lobby ? 'online' : 'menu');
        setNetError(reason);
        audio.playMusic('menu');
      },
    });
    return () => { /* keep the connection alive for the session */ };
  }, [onlineRequested]);

  const netCreate = (name: string) => {
    playerNameRef.current = name;
    try { localStorage.setItem('riftbrawl.name', name); } catch { /* ignore */ }
    net.createLobby(name, select.p1);
  };

  const netJoin = (code: string, name: string) => {
    playerNameRef.current = name;
    try { localStorage.setItem('riftbrawl.name', name); } catch { /* ignore */ }
    net.joinLobby(code, name, select.p1);
  };

  const netCycleChar = (dir: 1 | -1) => {
    const me = lobby?.players.find(p => p.slot === mySlot);
    if (!me) return;
    const next = cycleChar(me.char, dir);
    setSelect(s => ({ ...s, p1: next }));
    net.setChar(next);
  };

  const netBackToLobby = () => {
    if (netSession?.mode === 'host') net.endMatch();
    setOverlay('none');
    setNetSession(null);
    setScreen(lobby ? 'online' : 'menu');
    audio.playMusic('menu');
  };

  const netLeave = () => {
    if (netSession) {
      net.socketEmitLeave();
      setNetSession(null);
    }
    net.leaveLobby();
    setLobby(null);
    setMySlot(-1);
    setScreen('menu');
    audio.playMusic('menu');
  };

  const netCopyCode = () => {
    if (!lobby) return;
    try { void navigator.clipboard?.writeText(lobby.code); } catch { /* ignore */ }
    setNetError('Code copied to clipboard!');
    setTimeout(() => setNetError(null), 1600);
  };

  const startMode = (m: Mode) => {
    if (m === 'online') { setOnlineRequested(true); setMode('online'); setScreen('online'); return; }
    setMode(m);
    setArcade(null);
    setSurvivalWave(1);
    setSurvivalStocks(3);
    setChallengeId(null);
    setScreen('select');
  };

  const startChallenge = (id: string) => {
    setChallengeId(id);
    setMode('challenge');
    setScreen('select');
  };

  // pause handling from engine ESC
  const handlePauseRequest = useCallback(() => {
    // Escape during a replay leaves the theatre rather than opening a pause
    // menu full of actions (restart, rematch) that make no sense here.
    if (watchingRef.current) {
      setWatching(null);
      setOverlay('none');
      setScreen('replays');
      audio.playMusic('menu');
      return;
    }
    setOverlay(o => (o === 'none' ? 'pause' : o));
  }, []);

  const resume = () => {
    engineRef.current?.setPaused(false);
    setOverlay('none');
  };

  const restartMatch = () => {
    engineRef.current?.setPaused(false);
    setOverlay('none');
    setMatchKey(k => k + 1);
  };

  // ---- render ----

  const inGame = screen === 'game';

  // online match config built from the lobby start message
  let netCfg: MatchConfig | null = null;
  if (netSession) {
    const sorted = [...netSession.start.players].sort((a, b) => a.slot - b.slot);
    netCfg = {
      players: sorted.map(p => ({
        char: p.char as FighterId,
        label: (p.name || 'PLAYER').toUpperCase().slice(0, 10),
        kind: netSession.mode === 'host' && p.slot === netSession.mySlot ? 'local' : 'remote',
      })),
      stocks: netSession.start.stocks,
      stageId: netSession.start.stageId,
    };
  }
  // A replay carries the exact config it was recorded with.
  const cfg = inGame ? (watching?.meta.config ?? netCfg ?? pendingConfig ?? currentMatchConfig()) : null;

  return (
    <main className="fixed inset-0 select-none" role="application" aria-label="RIFT BRAWL game">
      {screen === 'menu' && <MainMenu onNavigate={(id) => {
        if (id === 'settings') setScreen('settings');
        else if (id === 'profile') setScreen('profile');
        else if (id === 'challenges') setScreen('challenges');
        else if (id === 'replays') setScreen('replays');
        else if (id === 'howto') setScreen('howto');
        else startMode(id === 'play' ? 'quick' : (id as Mode));
      }} profile={{ wins: profile.wins, matches: profile.matches }} />}

      {screen === 'select' && (
        <CharacterSelect
          mode={mode}
          initial={select}
          onBack={() => setScreen('menu')}
          onConfirm={(r) => {
            setSelect(r);
            // arcade ladder build
            if (mode === 'arcade') {
              const fighters: FighterId[] = FIGHTER_IDS.filter(f => f !== r.p1) as FighterId[];
              const difficulties: AIDifficulty[] = ['normal', 'normal', 'hard', 'hard', 'expert'];
              const personalities: AIPersonality[] = ['rusher', 'defender', 'zoner', 'trickster', 'grappler', 'balanced'];
              const opponents = Array.from({ length: ARCADE_LEN }, (_, i) => ({
                p2: fighters[i % fighters.length],
                difficulty: difficulties[i],
                personality: pickRandom(personalities),
                stage: pickRandom(STAGE_IDS),
              }));
              setArcade({ index: 0, wins: 0, opponents });
              setStageId(opponents[0].stage);
              setScreen('game');
              setPendingConfig({
                players: [
                  { char: r.p1, label: 'YOU', kind: 'local' },
                  { char: opponents[0].p2, label: 'CPU', kind: 'ai', personality: opponents[0].personality, difficulty: opponents[0].difficulty },
                ],
                stocks: 3, stageId: opponents[0].stage,
              });
              setMatchKey(k => k + 1);
              setLastResult(null);
              setOverlay('none');
              return;
            }
            setScreen('stage');
          }}
        />
      )}

      {screen === 'stage' && (
        <StageSelect
          hazardsNote={mode === 'training' ? 'TRAINING: infinite stocks · R reset · T damage · H hitboxes · G slow-mo · Y dummy' : undefined}
          onBack={() => setScreen('select')}
          onConfirm={(sid) => {
            const finalSid = sid === '__random' ? pickRandom(STAGE_IDS) : sid;
            setStageId(finalSid);
            const base = currentMatchConfig();
            setPendingConfig({ ...base, stageId: finalSid });
            setScreen('game');
            setMatchKey(k => k + 1);
            setLastResult(null);
            setOverlay('none');
          }}
        />
      )}

      {screen === 'online' && (
        lobby ? (
          <OnlineLobby
            lobby={lobby}
            mySlot={mySlot}
            status={netStatus}
            error={netError}
            onBack={netLeave}
            onCycleChar={netCycleChar}
            onToggleReady={() => {
              const me = lobby.players.find(p => p.slot === mySlot);
              net.setReady(!(me?.ready));
              audio.play('ui_select');
            }}
            onStart={(stageId) => net.startMatch(stageId, 3)}
            onCopyCode={netCopyCode}
          />
        ) : (
          <OnlineBrowse
            status={netStatus}
            error={netError}
            onBack={() => setScreen('menu')}
            onCreate={netCreate}
            onJoin={netJoin}
            defaultName={defaultName}
          />
        )
      )}

      {screen === 'replays' && (
        <ReplayScreen
          onBack={() => setScreen('menu')}
          onWatch={(r) => {
            setWatching(r);
            setLastResult(null);
            setOverlay('none');
            setMatchKey(k => k + 1);
            setScreen('game');
          }}
        />
      )}

      {screen === 'game' && cfg && !engine && (
        <div className="w-full h-full flex items-center justify-center bg-[#07060f]">
          <div className="text-[11px] tracking-[0.4em] text-white/40 font-bold anim-pulse-soft">ENTERING THE RIFT…</div>
        </div>
      )}
      {screen === 'game' && cfg && engine && (
        <GameScreen
          key={matchKey}
          engine={engine}
          config={cfg}
          mods={buildMods(challengeId)}
          settings={settings}
          mode={mode}
          netSession={netSession}
          survivalWave={survivalWave}
          arcade={arcade}
          arcadeLen={ARCADE_LEN}
          challengeId={challengeId}
          result={overlay === 'results' ? lastResult : null}
          paused={overlay === 'pause'}
          onPauseRequest={handlePauseRequest}
          onEnd={handleMatchEnd}
          onResume={resume}
          onRestart={restartMatch}
          onRematch={startRematch}
          onCharacterSelect={toCharacterSelect}
          onMenu={goMenu}
          onArcadeNext={arcadeNext}
          onSurvivalNext={survivalNext}
          onBackToLobby={netBackToLobby}
          replay={watching}
          onExitReplay={() => { setWatching(null); setOverlay('none'); setScreen('replays'); audio.playMusic('menu'); }}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen settings={settings} onChange={changeSettings} onBack={() => setScreen('menu')}
          onResetData={() => { wipeSave(); setSettings(DEFAULT_SETTINGS); setProfile(DEFAULT_PROFILE); engineRef.current?.applySettings(DEFAULT_SETTINGS); }} />
      )}
      {screen === 'profile' && <ProfileScreen profile={profile} onBack={() => setScreen('menu')} />}
      {screen === 'challenges' && <ChallengesScreen completed={profile.challenges} onStart={startChallenge} onBack={() => setScreen('menu')} />}
      {screen === 'howto' && <HowToScreen binds={settings.keybinds} onBack={() => setScreen('menu')} />}
    </main>
  );
}
