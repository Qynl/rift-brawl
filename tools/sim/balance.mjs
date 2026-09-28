// ============ RIFT BRAWL — Balance harness ============
// Round-robin AI-vs-AI tournament across every fighter, stage and matchup.
//   node tools/sim/balance.mjs [difficulty] [repetitions]
// Exits non-zero when the win-rate spread breaks the regression budget.

import { loadGame, runMatch } from './env.mjs';

const difficulty = process.argv[2] || 'hard';
const reps = Number(process.argv[3] || 2);
const BUDGET = Number(process.env.RB_WR_BUDGET || 26); // max allowed |WR - 50|

const game = await loadGame();
const { FIGHTER_IDS, STAGE_IDS } = game;

const stat = {};
for (const id of FIGHTER_IDS) {
  stat[id] = { wins: 0, games: 0, dmg: 0, kos: 0, combo: 0, comboSum: 0, techs: 0 };
}

const durations = [];
let total = 0;
let timeouts = 0;
const started = Date.now();

for (let rep = 0; rep < reps; rep++) {
  for (const a of FIGHTER_IDS) {
    for (const b of FIGHTER_IDS) {
      if (a === b) continue;
      const stage = STAGE_IDS[total % STAGE_IDS.length];
      const { result, frames, timeout } = runMatch(game, { a, b, stage, difficulty });
      total++;
      stat[a].games++;
      stat[b].games++;
      if (timeout) { timeouts++; durations.push(frames); continue; }
      durations.push(result.durationFrames);
      if (result.winner === 0) stat[a].wins++;
      else if (result.winner === 1) stat[b].wins++;
      const sides = [a, b];
      sides.forEach((id, i) => {
        stat[id].dmg += result.damageDealt[i];
        stat[id].kos += result.kos[i];
        stat[id].combo = Math.max(stat[id].combo, result.bestCombo[i]);
        stat[id].comboSum += result.bestCombo[i];
        stat[id].techs += result.techs[i];
      });
    }
  }
}

durations.sort((x, y) => x - y);
const q = (p) => (durations[Math.floor(durations.length * p)] / 60).toFixed(0);

console.log(`\n  RIFT BRAWL · balance  ·  difficulty=${difficulty}  matches=${total}  timeouts=${timeouts}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  match length (s):  p10 ${q(0.1)}   median ${q(0.5)}   p90 ${q(0.9)}   max ${(durations[durations.length - 1] / 60).toFixed(0)}\n`);

const rows = FIGHTER_IDS.map((id) => {
  const s = stat[id];
  return {
    id,
    wr: (s.wins / s.games) * 100,
    dmg: s.dmg / s.games,
    kos: s.kos / s.games,
    combo: s.comboSum / s.games,
    maxCombo: s.combo,
    techs: s.techs / s.games,
  };
}).sort((x, y) => y.wr - x.wr);

console.log('  FIGHTER     WIN%    DMG/GAME   KO/GAME   AVG COMBO   MAX   TECH/GAME');
console.log('  ' + '-'.repeat(70));
for (const r of rows) {
  const flag = Math.abs(r.wr - 50) > BUDGET ? ' <-- outside budget' : '';
  console.log(
    `  ${r.id.padEnd(10)} ${r.wr.toFixed(1).padStart(5)}   ${r.dmg.toFixed(0).padStart(7)}   ${r.kos.toFixed(2).padStart(7)}   ${r.combo.toFixed(2).padStart(9)}   ${String(r.maxCombo).padStart(3)}   ${r.techs.toFixed(2).padStart(8)}${flag}`,
  );
}

const spread = Math.max(...rows.map((r) => r.wr)) - Math.min(...rows.map((r) => r.wr));
const worst = Math.max(...rows.map((r) => Math.abs(r.wr - 50)));
const avgCombo = rows.reduce((a, r) => a + r.combo, 0) / rows.length;
console.log('  ' + '-'.repeat(70));
console.log(`  spread ${spread.toFixed(1)} pts   worst deviation ${worst.toFixed(1)} (budget ${BUDGET})   avg best-combo ${avgCombo.toFixed(2)}   timeouts ${timeouts}\n`);

if (process.env.RB_ENFORCE === '1') {
  if (worst > BUDGET) { console.error('FAIL: win-rate budget exceeded'); process.exit(1); }
  if (timeouts > 0) { console.error('FAIL: matches failed to resolve'); process.exit(1); }
}
