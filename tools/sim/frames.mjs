// ============ RIFT BRAWL — Frame-data solver ============
// Computes knockback, hitstun and frame advantage on hit / on shield for every
// authored hitbox move, straight out of the live combat formulas.
//   node tools/sim/frames.mjs [--all]

import { loadGame } from './env.mjs';

const game = await loadGame();
const { FIGHTER_CONFIGS, FIGHTER_IDS, moveActive, moveTotal, constants } = game;
const { knockbackOf, hitstunOf, shieldstunOf, tumbles } = constants;
const showAll = process.argv.includes('--all');

const rows = [];
for (const id of FIGHTER_IDS) {
  const cfg = FIGHTER_CONFIGS[id];
  for (const key of Object.keys(cfg.moves)) {
    const m = cfg.moves[key];
    if (!m.hitboxes || m.kind === 'grab') continue;
    const total = moveTotal(m);
    const remaining = total - (m.startup + 1);
    const at = (p) => {
      const kb = knockbackOf(p + m.damage, m.damage, m.bkb, m.kbg, 100);
      return { kb, hs: hitstunOf(kb, m.damage) };
    };
    const a0 = at(0);
    const a50 = at(50);
    const a100 = at(100);
    const ss = shieldstunOf(m.damage, m.shieldstun);
    rows.push({
      id, key,
      startup: m.startup, active: moveActive(m), total,
      dmg: m.damage,
      kb0: a0.kb, hs0: a0.hs,
      adv0: a0.hs - remaining,
      adv50: a50.hs - remaining,
      adv100: a100.hs - remaining,
      advShield: ss - remaining,
      tumble0: tumbles(a0.kb),
    });
  }
}

const n = rows.length;
const tumbling = rows.filter((r) => r.tumble0).length;
const safeShield = rows.filter((r) => r.advShield >= -3).length;
const plusShield = rows.filter((r) => r.advShield >= 0).length;
const plusHit = rows.filter((r) => r.adv0 >= 0).length;

console.log(`\n  RIFT BRAWL · frame data  ·  ${n} hitbox moves across ${FIGHTER_IDS.length} fighters\n`);
console.log(`  plus on hit @0%          ${String(plusHit).padStart(4)} / ${n}  (${((plusHit / n) * 100).toFixed(0)}%)`);
console.log(`  safe on shield (>=-3)    ${String(safeShield).padStart(4)} / ${n}  (${((safeShield / n) * 100).toFixed(0)}%)`);
console.log(`  plus on shield           ${String(plusShield).padStart(4)} / ${n}  (${((plusShield / n) * 100).toFixed(0)}%)`);
console.log(`  tumbling at 0% damage    ${String(tumbling).padStart(4)} / ${n}  (${((tumbling / n) * 100).toFixed(0)}%)\n`);

const fmt = (r) => `  ${(r.id + '.' + r.key).padEnd(22)} s${String(r.startup).padStart(2)} a${String(r.active).padStart(2)} t${String(r.total).padStart(3)}  dmg ${r.dmg.toFixed(1).padStart(5)}  kb0 ${r.kb0.toFixed(1).padStart(5)}  hit@0 ${String(r.adv0).padStart(4)}  @50 ${String(r.adv50).padStart(4)}  @100 ${String(r.adv100).padStart(4)}  shield ${String(r.advShield).padStart(4)}${r.tumble0 ? '  [tumble]' : ''}`;

if (showAll) {
  const byChar = {};
  for (const r of rows) (byChar[r.id] ??= []).push(r);
  for (const id of FIGHTER_IDS) {
    console.log(`\n  == ${id.toUpperCase()} ==`);
    byChar[id].forEach((r) => console.log(fmt(r)));
  }
} else {
  const sorted = [...rows].sort((a, b) => a.adv0 - b.adv0);
  console.log('  WORST 8 ON HIT @0%');
  sorted.slice(0, 8).forEach((r) => console.log(fmt(r)));
  console.log('\n  BEST 8 ON HIT @0%');
  sorted.slice(-8).forEach((r) => console.log(fmt(r)));
  const sh = [...rows].sort((a, b) => b.advShield - a.advShield);
  console.log('\n  SAFEST 8 ON SHIELD');
  sh.slice(0, 8).forEach((r) => console.log(fmt(r)));
  console.log('\n  (run with --all for the full table)\n');
}
