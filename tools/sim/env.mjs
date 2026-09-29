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

/**
 * A 2D context that records call counts instead of rasterising. Used by the
 * render smoke test: it implements enough of the real API surface that a
 * genuine renderer bug throws rather than silently no-opping.
 */
export function recordingCanvas() {
  const canvas = new HeadlessCanvas();
  canvas.width = 1280;
  canvas.height = 720;
  const state = { __calls: 0, __gradients: 0 };
  const gradient = () => ({
    addColorStop(stop, color) {
      if (typeof stop !== 'number' || Number.isNaN(stop)) throw new Error(`bad gradient stop: ${stop}`);
      // Browsers throw IndexSizeError outside 0..1; the stub used to accept it
      // silently, which let an out-of-range stop ship as a runtime crash.
      if (stop < 0 || stop > 1) throw new Error(`gradient stop out of range: ${stop}`);
      if (typeof color !== 'string' || color === 'undefined' || color.includes('undefined') || color.includes('NaN')) {
        throw new Error(`bad gradient colour: ${color}`);
      }
    },
  });
  const noop = () => { state.__calls++; };
  const target = {
    canvas,
    get __calls() { return state.__calls; },
    get __gradients() { return state.__gradients; },
    __resetCounters() { state.__calls = 0; state.__gradients = 0; },
    createLinearGradient: () => { state.__calls++; state.__gradients++; return gradient(); },
    createRadialGradient: () => { state.__calls++; state.__gradients++; return gradient(); },
    createPattern: () => { state.__calls++; return null; },
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: noop,
    drawImage(img) {
      state.__calls++;
      if (!img) throw new Error('drawImage called with a null image');
    },
    setTransform: noop,
    save: noop,
    restore: noop,
  };
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return noop;
    },
    set(t, prop, value) {
      if ((prop === 'fillStyle' || prop === 'strokeStyle') && typeof value === 'string'
        && (value.includes('undefined') || value.includes('NaN'))) {
        throw new Error(`invalid ${String(prop)}: ${value}`);
      }
      t[prop] = value;
      return true;
    },
  });
  return { canvas, ctx };
}

const { createJiti } = await import('jiti');
const ROOT = new URL('../../', import.meta.url).pathname;

const jiti = createJiti(import.meta.url, {
  alias: { '@': ROOT + 'src' },
  interopDefault: true,
});

export async function loadGame() {
  const [match, audio, configs, stages, types, fighter, constants, replay] = await Promise.all([
    jiti.import(ROOT + 'src/lib/game/Match.ts'),
    jiti.import(ROOT + 'src/lib/game/audio/AudioManager.ts'),
    jiti.import(ROOT + 'src/lib/game/fighters/configs.ts'),
    jiti.import(ROOT + 'src/lib/game/stages/stages.ts'),
    jiti.import(ROOT + 'src/lib/game/core/types.ts'),
    jiti.import(ROOT + 'src/lib/game/fighters/Fighter.ts'),
    jiti.import(ROOT + 'src/lib/game/core/constants.ts'),
    jiti.import(ROOT + 'src/lib/game/replay/format.ts'),
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
    ReplayRecorder: replay.ReplayRecorder,
    ReplayPlayback: replay.ReplayPlayback,
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
    difficultyA = difficulty, difficultyB = difficulty,
    personalityA = 'balanced', personalityB = 'balanced',
    maxFrames = 60 * 60 * 5,
  } = opts;
  const audio = new game.AudioManager();
  let result = null;
  const config = {
    players: [
      { char: a, label: 'A', kind: 'ai', personality: personalityA, difficulty: difficultyA },
      { char: b, label: 'B', kind: 'ai', personality: personalityB, difficulty: difficultyB },
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
