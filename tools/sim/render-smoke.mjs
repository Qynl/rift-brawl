// ============ RIFT BRAWL — render smoke test ============
// There is no headless browser available in CI, so instead of screenshotting we
// drive the REAL render path against a recording 2D-context stub. This catches
// the class of bug that actually breaks the game visually: a thrown exception
// mid-frame (undefined colour, missing method, bad gradient stop), which in the
// browser silently kills every draw call after it.
//
//   node tools/sim/render-smoke.mjs

import { loadGame, BASE_MODS, recordingCanvas } from './env.mjs';

const game = await loadGame();
const { Match, AudioManager, FIGHTER_IDS, STAGE_IDS, emptyInput } = game;

const STATES_TO_FORCE = [
  'idle', 'walk', 'dash', 'air', 'attack', 'hitstun', 'launch',
  'shield', 'shieldstun', 'shieldbreak', 'dodge', 'dizzy', 'ledge', 'victory', 'respawn',
];

let frames = 0;
let calls = 0;
let gradients = 0;
const failures = [];

for (const stageId of STAGE_IDS) {
  for (let i = 0; i < FIGHTER_IDS.length; i += 2) {
    const a = FIGHTER_IDS[i];
    const b = FIGHTER_IDS[(i + 1) % FIGHTER_IDS.length];
    const audio = new AudioManager();
    const match = new Match(
      { players: [{ char: a, label: 'A', kind: 'local' }, { char: b, label: 'B', kind: 'local' }], stocks: 3, stageId },
      audio, 1280, 720, { onEnd() {}, onPauseRequest() {} }, { ...BASE_MODS, quality: 'high', particleQ: 1 }, 'off',
    );
    const inputs = [emptyInput(), emptyInput()];
    match.inputProvider = (p) => inputs[p];
    const { canvas, ctx } = recordingCanvas();
    void canvas;

    for (let t = 0; t < 40; t++) {
      match.step();
      // exercise every trait/status branch in the aura + HUD renderers
      for (const f of match.fighters) {
        f.trait.meter = (t % 11) / 10;
        f.trait.charges = t % 7;
        f.trait.stacks = t % 45;
        f.trait.timer = t % 2 ? 60 : 0;
        f.trait.active = t % 3 === 0;
        f.trait.flash = t % 5;
        f.burn = t % 4 ? 40 : 0;
        f.poison = t % 5;
        f.chill = t % 5;
        f.frozen = t % 9 === 0 ? 20 : 0;
        f.shock = t % 3 ? 60 : 0;
        f.state = STATES_TO_FORCE[(t + f.playerIndex) % STATES_TO_FORCE.length];
      }
      try {
        match.render(ctx, 0.5);
        frames++;
      } catch (err) {
        failures.push(`${a} vs ${b} @ ${stageId} frame ${t}: ${err.message}`);
        break;
      }
    }
    calls += ctx.__calls;
    gradients += ctx.__gradients;
  }
}

const perFrame = frames ? (gradients / frames) : 0;
console.log(`\n  RIFT BRAWL · render smoke  ·  ${frames} frames rendered, ${calls.toLocaleString()} draw calls`);
console.log(`  gradient allocations: ${gradients.toLocaleString()} total, ${perFrame.toFixed(1)} per frame\n`);
if (failures.length) {
  for (const f of failures.slice(0, 20)) console.log('  FAIL  ' + f);
  console.log(`\n  ${failures.length} render failures\n`);
  process.exit(1);
}
console.log('  no exceptions thrown across every fighter × stage × state\n');
