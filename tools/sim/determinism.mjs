// ============ RIFT BRAWL — Determinism probe ============
// Replays identical scripted inputs twice and bit-compares the resulting
// simulation state. Determinism is the hard prerequisite for rollback netcode.
//   node tools/sim/determinism.mjs

import { loadGame, BASE_MODS } from './env.mjs';

const game = await loadGame();
const { Match, AudioManager, FIGHTER_IDS, emptyInput } = game;

const KEYS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'grab', 'shield', 'dodge', 'dash'];

function replay(seed, a, b, stageId, frames) {
  const audio = new AudioManager();
  const config = {
    players: [
      { char: a, label: 'A', kind: 'local' },
      { char: b, label: 'B', kind: 'local' },
    ],
    stocks: 3,
    stageId,
  };
  const match = new Match(config, audio, 1280, 720, { onEnd() {}, onPauseRequest() {} }, { ...BASE_MODS }, 'off');
  const inputs = [emptyInput(), emptyInput()];
  match.inputProvider = (i) => inputs[i];

  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let t = 0; t < frames; t++) {
    for (const inp of inputs) {
      for (const k of KEYS) { inp.pressed[k] = false; inp.released[k] = false; }
    }
    for (const inp of inputs) {
      for (const k of KEYS) {
        const on = rnd() < 0.09;
        if (on && !inp.held[k]) inp.pressed[k] = true;
        if (!on && inp.held[k]) inp.released[k] = true;
        inp.held[k] = on;
      }
      inp.axisX = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
      inp.axisY = (inp.held.down ? 1 : 0) - (inp.held.up ? 1 : 0);
    }
    match.step();
  }
  return match.fighters
    .map((f) => [
      f.x.toFixed(6), f.y.toFixed(6), f.vx.toFixed(6), f.vy.toFixed(6),
      f.damage.toFixed(4), f.stocks, f.state, f.facing, f.shieldHp.toFixed(3),
      f.hitstun, f.move?.id ?? '-', f.moveFrame,
      f.trait ? JSON.stringify(f.trait.meter.toFixed(4)) + ':' + f.trait.charges + ':' + f.trait.stacks : '-',
    ].join(','))
    .join('|');
}

const CASES = [
  { seed: 12345, a: 'vanguard', b: 'ember', stage: 'forest' },
  { seed: 777, a: 'titan', b: 'tempest', stage: 'neon' },
  { seed: 90210, a: 'viper', b: 'seraph', stage: 'rift' },
  { seed: 4242, a: 'jaeger', b: 'frost', stage: 'frozen' },
  { seed: 5150, a: 'volt', b: 'wraith', stage: 'sky' },
  { seed: 31337, a: 'nova', b: 'hook', stage: 'volcano' },
];

let failed = 0;
console.log('\n  RIFT BRAWL · determinism probe  ·  2000 frames per case\n');
for (const c of CASES) {
  const first = replay(c.seed, c.a, c.b, c.stage, 2000);
  const second = replay(c.seed, c.a, c.b, c.stage, 2000);
  const ok = first === second;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.a} vs ${c.b} @ ${c.stage} (seed ${c.seed})`);
  if (!ok) {
    console.log('        run A: ' + first.slice(0, 160));
    console.log('        run B: ' + second.slice(0, 160));
  }
}
console.log(`\n  ${CASES.length - failed}/${CASES.length} deterministic\n`);
if (failed > 0) process.exit(1);
