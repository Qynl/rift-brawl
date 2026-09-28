// ============ RIFT BRAWL — balance auto-tuner ============
//
// Runs the round-robin tournament, then nudges each fighter's entry in the
// BALANCE table in src/lib/game/fighters/configs.ts toward a 50% win rate, and
// repeats. This is gradient descent on a very noisy objective, so the step size
// is deliberately small and clamped: the tuner proposes, the harness verifies.
//
//   node tools/sim/autotune.mjs [iterations] [matchesPerPair]
//
// Every iteration prints the table it wrote, so a bad run is trivial to revert
// with git. Nothing here ships to the browser.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const CONFIGS = ROOT + 'src/lib/game/fighters/configs.ts';

const iterations = Number(process.argv[2] ?? 4);
const perPair = Number(process.argv[3] ?? 2);

/** Limits on how far tuning may drift from the authored design. */
const LIMITS = { dmg: [0.72, 1.4], kb: [0.72, 1.4], speed: [0.85, 1.18], weight: [0.85, 1.2] };

function readTable() {
  const src = readFileSync(CONFIGS, 'utf8');
  const block = src.match(/export const BALANCE: Record<string, BalanceTuning> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('BALANCE table not found in configs.ts');
  const table = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/(\w+):\s*\{\s*dmg:\s*([\d.]+),\s*kb:\s*([\d.]+),\s*speed:\s*([\d.]+),\s*weight:\s*([\d.]+)\s*\}/);
    if (m) table[m[1]] = { dmg: +m[2], kb: +m[3], speed: +m[4], weight: +m[5] };
  }
  return table;
}

function writeTable(table) {
  const src = readFileSync(CONFIGS, 'utf8');
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  const body = Object.entries(table)
    .map(([id, t]) => `  ${pad(id + ':', 10)}{ dmg: ${t.dmg.toFixed(2)}, kb: ${t.kb.toFixed(2)}, speed: ${t.speed.toFixed(2)}, weight: ${t.weight.toFixed(2)} },`)
    .join('\n');
  const next = src.replace(
    /export const BALANCE: Record<string, BalanceTuning> = \{[\s\S]*?\n\};/,
    `export const BALANCE: Record<string, BalanceTuning> = {\n${body}\n};`,
  );
  writeFileSync(CONFIGS, next);
}

function runTournament() {
  const out = execFileSync('node', [ROOT + 'tools/sim/balance.mjs'], {
    cwd: ROOT,
    env: { ...process.env, RB_PER_PAIR: String(perPair), RB_JSON: '1' },
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  const line = out.split('\n').find(l => l.trim().startsWith('{"rows"'));
  if (!line) {
    console.error(out);
    throw new Error('balance.mjs did not emit JSON (needs RB_JSON support)');
  }
  return JSON.parse(line);
}

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

for (let it = 1; it <= iterations; it++) {
  const table = readTable();
  const res = runTournament();
  const rows = res.rows;
  const spread = Math.max(...rows.map(r => r.win)) - Math.min(...rows.map(r => r.win));
  console.log(`\n  iteration ${it}/${iterations}  spread ${spread.toFixed(1)} pts  timeouts ${res.timeouts}`);
  for (const r of rows) console.log(`    ${r.id.padEnd(9)} ${r.win.toFixed(1).padStart(5)}%  ko/game ${r.ko.toFixed(2)}`);

  for (const r of rows) {
    const t = table[r.id];
    if (!t) continue;
    // error in win-rate points, normalised to [-1, 1]
    const err = (50 - r.win) / 50;
    const step = 0.5;                       // max 5% change per iteration at full error
    // Weak fighters get power first, then survivability; strong ones lose both.
    t.dmg = clampTo(t.dmg * (1 + err * 0.10 * step), LIMITS.dmg);
    t.kb = clampTo(t.kb * (1 + err * 0.12 * step), LIMITS.kb);
    t.weight = clampTo(t.weight * (1 + err * 0.06 * step), LIMITS.weight);
    // Speed only moves for fighters who are badly behind — it changes feel most.
    if (Math.abs(err) > 0.35) t.speed = clampTo(t.speed * (1 + err * 0.05 * step), LIMITS.speed);
  }
  writeTable(table);
  console.log('    → wrote updated BALANCE table');
}

console.log('\n  done. Re-run `node tools/sim/balance.mjs` to verify the final table.\n');
