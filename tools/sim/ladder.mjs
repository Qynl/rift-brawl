// ============ RIFT BRAWL — Difficulty ladder harness ============
// Measures whether AI difficulty changes OUTCOMES rather than just pace.
// Every difficulty plays the same fixture of matchups against one fixed
// reference opponent, and we report the win rate of each rung.
//
//   node tools/sim/ladder.mjs [referenceDifficulty] [repetitions]
//
// A healthy ladder is strictly monotonic with a wide spread. Set
// RB_ENFORCE=1 to fail the process when it is not.

import { loadGame, runMatch } from './env.mjs';

const reference = process.argv[2] || process.env.RB_REF || 'normal';
const reps = Number(process.argv[3] || process.env.RB_REPS || 1);
const RUNGS = ['easy', 'normal', 'hard', 'expert'];

const game = await loadGame();
const { FIGHTER_IDS, STAGE_IDS } = game;

const started = Date.now();
const results = [];

// Deterministic fixture: the same character pairs and stages for every rung,
// so the only variable between rows is the difficulty of side A.
const fixture = [];
for (let rep = 0; rep < reps; rep++) {
  for (let i = 0; i < FIGHTER_IDS.length; i++) {
    const a = FIGHTER_IDS[i];
    const b = FIGHTER_IDS[(i + 1 + rep) % FIGHTER_IDS.length];
    if (a === b) continue;
    fixture.push({ a, b, stage: STAGE_IDS[(i + rep) % STAGE_IDS.length] });
    // play the mirror of the pairing so no rung is helped by side advantage
    fixture.push({ a: b, b: a, stage: STAGE_IDS[(i + rep + 3) % STAGE_IDS.length] });
  }
}

for (const rung of RUNGS) {
  let wins = 0;
  let games = 0;
  let timeouts = 0;
  let dmgFor = 0;
  let dmgAgainst = 0;
  let kosFor = 0;
  let kosAgainst = 0;
  let combo = 0;
  let techs = 0;
  let frames = 0;

  for (const f of fixture) {
    const r = runMatch(game, {
      a: f.a, b: f.b, stage: f.stage,
      difficultyA: rung, difficultyB: reference,
    });
    games++;
    frames += r.result ? r.result.durationFrames : r.frames;
    if (r.timeout || !r.result) { timeouts++; continue; }
    if (r.result.winner === 0) wins++;
    dmgFor += r.result.damageDealt[0];
    dmgAgainst += r.result.damageDealt[1];
    kosFor += r.result.kos[0];
    kosAgainst += r.result.kos[1];
    combo += r.result.bestCombo[0];
    techs += r.result.techs[0];
  }

  results.push({
    rung,
    wr: (wins / games) * 100,
    dmgRatio: dmgFor / Math.max(1, dmgAgainst),
    koRatio: kosFor / Math.max(1, kosAgainst),
    combo: combo / games,
    techs: techs / games,
    secs: frames / games / 60,
    timeouts,
  });
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n  RIFT BRAWL · difficulty ladder  ·  vs ${reference}  ·  ${fixture.length} matches per rung  ·  ${elapsed}s\n`);
console.log('  DIFFICULTY    WIN%   DMG RATIO   KO RATIO   AVG COMBO   TECH/GAME   AVG LEN');
console.log('  ' + '-'.repeat(76));
for (const r of results) {
  console.log(
    `  ${r.rung.padEnd(10)} ${r.wr.toFixed(1).padStart(6)}   ${r.dmgRatio.toFixed(2).padStart(9)}   ${r.koRatio.toFixed(2).padStart(8)}   ` +
    `${r.combo.toFixed(2).padStart(9)}   ${r.techs.toFixed(2).padStart(9)}   ${r.secs.toFixed(0).padStart(5)}s`,
  );
}
console.log('  ' + '-'.repeat(76));

const wrs = results.map((r) => r.wr);
const spread = wrs[wrs.length - 1] - wrs[0];
let monotonic = true;
for (let i = 1; i < wrs.length; i++) if (wrs[i] < wrs[i - 1] - 2) monotonic = false;
console.log(`  spread ${spread.toFixed(1)} pts   monotonic ${monotonic ? 'yes' : 'NO'}\n`);

if (process.env.RB_JSON === '1') {
  console.log(JSON.stringify({ reference, rows: results, spread, monotonic }));
}

if (process.env.RB_ENFORCE === '1') {
  if (!monotonic) { console.error('FAIL: difficulty ladder is not monotonic'); process.exit(1); }
  if (spread < 30) { console.error(`FAIL: ladder spread ${spread.toFixed(1)} < 30 pts — difficulty barely changes outcomes`); process.exit(1); }
}
