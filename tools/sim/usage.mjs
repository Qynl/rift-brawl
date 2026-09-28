// ============ RIFT BRAWL — Engagement profiler ============
// Measures where match time actually goes and which moves the game really uses.
// Surfaces dead mechanics (grabs, shields, techs) that code review cannot see.
//   node tools/sim/usage.mjs [difficulty] [matches]

import { loadGame, BASE_MODS } from './env.mjs';

const game = await loadGame();
const { Match, AudioManager, FIGHTER_IDS, STAGE_IDS } = game;

const difficulty = process.argv[2] || 'hard';
const matches = Number(process.argv[3] || 24);

const stateFrames = {};
const moveUse = {};
let totalFrames = 0;
let parries = 0;
let shieldBreaks = 0;
let grabsLanded = 0;
let techs = 0;
let comboSum = 0;
let comboMax = 0;
let resolved = 0;

for (let i = 0; i < matches; i++) {
  const a = FIGHTER_IDS[i % FIGHTER_IDS.length];
  const b = FIGHTER_IDS[(i * 5 + 3) % FIGHTER_IDS.length];
  if (a === b) continue;
  const audio = new AudioManager();
  let result = null;
  const config = {
    players: [
      { char: a, label: 'A', kind: 'ai', personality: 'balanced', difficulty },
      { char: b, label: 'B', kind: 'ai', personality: 'balanced', difficulty },
    ],
    stocks: 3,
    stageId: STAGE_IDS[i % STAGE_IDS.length],
  };
  const match = new Match(config, audio, 1280, 720, { onEnd: (r) => { result = r; }, onPauseRequest() {} }, { ...BASE_MODS }, 'off');
  const announce = match.announce.bind(match);
  match.announce = (text, ...rest) => {
    if (typeof text === 'string') {
      if (text.includes('PARRY')) parries++;
      if (text.includes('SHIELD BREAK')) shieldBreaks++;
    }
    return announce(text, ...rest);
  };
  let frames = 0;
  const seenGrab = new Set();
  while (!result && frames < 60 * 60 * 5) {
    match.step();
    frames++;
    totalFrames++;
    for (const f of match.fighters) {
      stateFrames[f.state] = (stateFrames[f.state] || 0) + 1;
      if (f.state === 'attack' && f.move && f.moveFrame === 1) {
        moveUse[f.move.id] = (moveUse[f.move.id] || 0) + 1;
      }
      if (f.state === 'grabbed' && !seenGrab.has(f.playerIndex + ':' + match.tick)) {
        if (f.grabTimer > 0 && !seenGrab.has('g' + f.playerIndex)) { grabsLanded++; seenGrab.add('g' + f.playerIndex); }
      }
      if (f.state !== 'grabbed') seenGrab.delete('g' + f.playerIndex);
    }
  }
  if (result) {
    resolved++;
    techs += result.techs.reduce((x, y) => x + y, 0);
    const best = Math.max(...result.bestCombo);
    comboSum += best;
    comboMax = Math.max(comboMax, best);
  }
}

const stateTotal = Object.values(stateFrames).reduce((a, b) => a + b, 0);
console.log(`\n  RIFT BRAWL · engagement profile  ·  difficulty=${difficulty}  matches=${matches}  frames=${totalFrames}`);
console.log(`  resolved ${resolved}/${matches}   parries ${parries}   shield breaks ${shieldBreaks}   grabs landed ${grabsLanded}   techs ${techs}   best combo avg ${(comboSum / Math.max(1, resolved)).toFixed(2)} (max ${comboMax})\n`);

console.log('  STATE TIME SHARE');
Object.entries(stateFrames).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  const p = (v / stateTotal) * 100;
  const bar = '#'.repeat(Math.round(p / 2));
  console.log(`  ${k.padEnd(12)} ${p.toFixed(2).padStart(6)}%  ${bar}`);
});

const moveTotalCount = Object.values(moveUse).reduce((a, b) => a + b, 0);
console.log('\n  MOVE USAGE (starts)');
Object.entries(moveUse).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(5)}  ${((v / moveTotalCount) * 100).toFixed(1).padStart(5)}%`);
});

const unused = [];
for (const id of ['jab', 'fattack', 'uattack', 'dattack', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'nspecial', 'sspecial', 'uspecial', 'dspecial']) {
  if (!moveUse[id]) unused.push(id);
}
console.log(`\n  NEVER USED: ${unused.length ? unused.join(', ') : '(none)'}\n`);
