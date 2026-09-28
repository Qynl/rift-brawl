// ============ RIFT BRAWL — Headless simulation environment ============
// Stubs the browser APIs the presentation layer touches so the deterministic
// simulation can run in plain Node. Nothing here affects gameplay logic.

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext(canvas) {
  const target = { canvas };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => makeGradient();
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

class HeadlessCanvas {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.style = {};
  }
  getContext() {
    return makeContext(this);
  }
  getBoundingClientRect() {
    return { width: 1280, height: 720, top: 0, left: 0 };
  }
}

globalThis.HTMLCanvasElement = HeadlessCanvas;
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? new HeadlessCanvas() : { style: {} }),
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
};
if (!globalThis.navigator?.getGamepads) {
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...(globalThis.navigator ?? {}), getGamepads: () => [] },
      configurable: true,
    });
  } catch { /* node >=21 exposes a read-only navigator; ignore */ }
}
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { createJiti } = await import('jiti');
const ROOT = new URL('../../', import.meta.url).pathname;

const jiti = createJiti(import.meta.url, {
  alias: { '@': ROOT + 'src' },
  interopDefault: true,
});

export async function loadGame() {
  const [match, audio, configs, stages, types, fighter, constants] = await Promise.all([
    jiti.import(ROOT + 'src/lib/game/Match.ts'),
    jiti.import(ROOT + 'src/lib/game/audio/AudioManager.ts'),
    jiti.import(ROOT + 'src/lib/game/fighters/configs.ts'),
    jiti.import(ROOT + 'src/lib/game/stages/stages.ts'),
    jiti.import(ROOT + 'src/lib/game/core/types.ts'),
    jiti.import(ROOT + 'src/lib/game/fighters/Fighter.ts'),
    jiti.import(ROOT + 'src/lib/game/core/constants.ts'),
  ]);
  return {
    Match: match.Match,
    AudioManager: audio.AudioManager,
    FIGHTER_CONFIGS: configs.FIGHTER_CONFIGS,
    FIGHTER_IDS: configs.FIGHTER_IDS,
    STAGE_IDS: stages.STAGE_IDS,
    emptyInput: types.emptyInput,
    moveActive: fighter.moveActive,
    moveTotal: fighter.moveTotal,
    constants,
  };
}

export const BASE_MODS = {
  lowGravity: false,
  giant: false,
  tinyArena: false,
  oneHitKO: false,
  highKnockback: false,
  infiniteSpecials: false,
  movingPlatforms: false,
  chaosHazards: false,
  reduceFlash: true,
  particleQ: 0,
  showFps: false,
  quality: 'low',
};

/** Run one full AI-vs-AI match headlessly and return its result. */
export function runMatch(game, opts) {
  const {
    a, b, stage = 'forest', difficulty = 'hard', stocks = 3,
    personalityA = 'balanced', personalityB = 'balanced',
    maxFrames = 60 * 60 * 5,
  } = opts;
  const audio = new game.AudioManager();
  let result = null;
  const config = {
    players: [
      { char: a, label: 'A', kind: 'ai', personality: personalityA, difficulty },
      { char: b, label: 'B', kind: 'ai', personality: personalityB, difficulty },
    ],
    stocks,
    stageId: stage,
  };
  const match = new game.Match(
    config, audio, 1280, 720,
    { onEnd: (r) => { result = r; }, onPauseRequest() {} },
    { ...BASE_MODS }, 'off',
  );
  let frames = 0;
  while (!result && frames < maxFrames) {
    match.step();
    frames++;
  }
  return { result, frames, timeout: !result, match };
}

export function pct(n, d) {
  return d === 0 ? '  0.0' : ((n / d) * 100).toFixed(1).padStart(5);
}
