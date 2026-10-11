// ============ RIFT BRAWL — unit tests (node:test) ============
//
// Fast deterministic checks of the pieces the simulation harnesses can't
// reach cheaply:
//   · the knockback physics model (invariants the balance gate only implies)
//   · the replay bit-packing codec
//   · the frame-cleared gradient cache (reuse vs. rebuild)
//   · the full KO fly-out lifecycle *with rendering* — render-smoke caps at
//     40 frames per pairing, before any natural KO can happen, so this test
//     forces a real KO and renders every frame of the burst.
//
// Run standalone:  npm run test:unit     (also appended to npm run verify)

import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { loadGame, recordingCanvas, BASE_MODS } from './env.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { '@': ROOT + 'src' }, interopDefault: true });

const game = await loadGame();
const { Match, AudioManager, FIGHTER_IDS, emptyInput, constants } = game;
const { knockbackOf, hitstunOf, shieldstunOf, tumbles, KB } = constants;
const { packInput, unpackInput, ReplayRecorder, ReplayPlayback } = await jiti.import(ROOT + 'src/lib/game/replay/format.ts');
const gradientCache = await jiti.import(ROOT + 'src/lib/game/effects/gradientCache.ts');
const { VOICES } = await jiti.import(ROOT + 'src/lib/game/audio/AudioManager.ts');

test('knockback model: weight resists, percent amplifies, cap holds', () => {
  const light = knockbackOf(80, 10, 18, 92, 85);
  const heavy = knockbackOf(80, 10, 18, 92, 130);
  assert.ok(heavy < light, 'heavier fighter must take less knockback');
  const lowPct = knockbackOf(20, 10, 18, 92, 100);
  const highPct = knockbackOf(150, 10, 18, 92, 100);
  assert.ok(highPct > lowPct, 'more accumulated damage must launch harder');
  assert.ok(knockbackOf(999, 40, 30, 120, 80) <= KB.max, 'knockback never exceeds the cap');
  assert.ok(knockbackOf(0, 4, 6, 50, 100) > 0, 'a poke at 0% still produces motion');
  assert.ok(knockbackOf(0, 4, 60, 50, 100) > knockbackOf(0, 4, 6, 50, 100), 'base knockback move hits harder');
});

test('hitstun / shieldstun stay inside their clamps', () => {
  assert.equal(hitstunOf(0.4, 0), KB.hitstunMin);
  assert.equal(hitstunOf(500, 80), KB.hitstunMax);
  const rising = hitstunOf(14, 8);
  assert.ok(rising > KB.hitstunMin && rising < KB.hitstunMax);
  assert.ok(shieldstunOf(0) >= 1, 'a shield poke still costs frames');
  assert.equal(shieldstunOf(10, 33), 33, 'a guaranteed override wins over the formula');
  assert.ok(shieldstunOf(20) > shieldstunOf(5), 'heavier hit = longer shieldstun');
});

test('tumble threshold is exclusive above it', () => {
  assert.equal(tumbles(KB.tumbleThreshold), false);
  assert.equal(tumbles(KB.tumbleThreshold + 0.01), true);
});

test('replay codec: held bits + edge reconstruction round-trip', () => {
  const input = emptyInput();
  input.held.attack = true;
  input.held.jump = true;
  input.axisX = 0.5;
  input.axisY = -1;
  const word = packInput(input);
  const out = emptyInput();
  unpackInput(word, 0, out);
  assert.equal(out.held.attack, true);
  assert.equal(out.pressed.attack, true, 'rising edge reconstructed from prev frame');
  assert.ok(Math.abs(out.axisX - 0.5) < 0.15, 'quantised x axis close to source');
  assert.ok(out.axisY < -0.9, 'quantised y axis close to source');
  unpackInput(word, word, out);
  assert.equal(out.held.attack, true, 'held bit persists');
  assert.equal(out.pressed.attack, false, 'no phantom re-press on a repeat word');
});

test('replay: recorder → playback replays identical held states', () => {
  const rec = new ReplayRecorder(2);
  const source = [];
  for (let f = 0; f < 150; f++) {
    const a = emptyInput(); const b = emptyInput();
    a.held.attack = f % 10 < 4;
    a.held.special = f % 30 === 5;
    b.held.jump = f % 20 < 10;
    b.held.shield = f % 40 >= 30;
    a.axisX = Math.sin(f * 0.1);
    b.axisY = Math.cos(f * 0.07);
    rec.record([a, b]);
    source.push([a, b]);
  }
  const data = rec.finish({
    config: { players: [], stocks: 1, stageId: 'forest' },
    mods: {}, chars: ['vanguard', 'ember'], labels: ['A', 'B'],
    stageId: 'forest', winner: 0, durationFrames: 150, timeout: false,
  });
  assert.equal(data.tracks.length, 2);
  const pb = new ReplayPlayback(data);
  for (let f = 0; f < 150; f++) {
    const a = pb.provide(0); const b = pb.provide(1);
    assert.equal(a.held.attack, source[f][0].held.attack, `frame ${f} p1 attack`);
    assert.equal(a.held.special, source[f][0].held.special, `frame ${f} p1 special`);
    assert.equal(b.held.jump, source[f][1].held.jump, `frame ${f} p2 jump`);
    assert.equal(b.held.shield, source[f][1].held.shield, `frame ${f} p2 shield`);
    assert.ok(Math.abs(a.axisX - source[f][0].axisX) < 0.15, `frame ${f} axis drift within quantisation`);
    pb.advance();
  }
  assert.equal(pb.finished, true);
});

test('gradient cache: identical key reuses, different key rebuilds', () => {
  const { ctx } = recordingCanvas();
  const stops = [[0, '#ffffff'], [1, '#000000']];
  const g1 = gradientCache.cachedLinear(ctx, 0, 0, 10, 10, stops);
  const built = ctx.__gradients;
  assert.ok(built >= 1, 'first call builds the gradient');
  const g2 = gradientCache.cachedLinear(ctx, 0, 0, 10, 10, stops);
  assert.strictEqual(g1, g2, 'same args return the same gradient object');
  assert.equal(ctx.__gradients, built, 'same args build nothing new');
  gradientCache.cachedLinear(ctx, 5, 5, 20, 20, stops);
  assert.ok(ctx.__gradients > built, 'new key builds one more gradient');
});

test('every roster fighter has an explicit voice print in a singable range', () => {
  for (const id of FIGHTER_IDS) {
    const v = VOICES[id];
    assert.ok(v, `${id} is missing a voice print`);
    assert.ok(v.pitch >= 60 && v.pitch <= 300, `${id} pitch ${v.pitch} outside 60–300 Hz`);
    assert.ok(v.bright >= 0.5 && v.bright <= 1.5, `${id} formant scale sane`);
  }
  assert.ok(VOICES.default, 'fallback voice exists');
});

test('KO fly-out: forced blast KO renders its whole lifecycle clean', () => {
  const audio = new AudioManager();
  const config = {
    players: [
      { char: 'vanguard', label: 'A', kind: 'ai', personality: 'balanced', difficulty: 'normal' },
      { char: 'ember', label: 'B', kind: 'ai', personality: 'balanced', difficulty: 'normal' },
    ],
    stocks: 3,
    stageId: 'forest',
  };
  const match = new Match(
    config, audio, 1280, 720,
    { onEnd: () => {}, onPauseRequest() {} },
    { ...BASE_MODS }, 'off',
  );
  const { ctx } = recordingCanvas();
  // step past the countdown into the fight
  for (let i = 0; i < 260; i++) match.step();
  const vic = match.fighters[1];
  vic.damage = 120;
  match.koFighter(vic, 'side'); // private in TS — exercised deliberately here
  assert.match(vic.state, /kolaunch|kofly|ko|dead/, 'victim entered a KO state');
  // render every frame of the launch → burst → aftermath
  for (let i = 0; i < 900; i++) {
    match.step();
    match.render(ctx, 1);
  }
  assert.ok(ctx.__calls > 1000, 'renderer actually drew across the KO');
});
