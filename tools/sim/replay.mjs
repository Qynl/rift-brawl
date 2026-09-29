// ============ RIFT BRAWL — Replay fidelity harness ============
// Records an AI match as an input track, replays that track into a fresh
// match, and asserts the two simulations stay byte-identical the whole way.
// If this ever fails, replays (and by extension rollback netcode) are lying.
//
//   node tools/sim/replay.mjs [cases]

import { loadGame, BASE_MODS } from './env.mjs';

const game = await loadGame();
const { Match, AudioManager, FIGHTER_IDS, STAGE_IDS, ReplayRecorder, ReplayPlayback } = game;

const cases = Number(process.argv[2] || 6);

function vector(match) {
  const parts = [`t${match.tick}`, `p${match.phase}`];
  for (const f of match.fighters) {
    parts.push([
      f.x.toFixed(6), f.y.toFixed(6), f.vx.toFixed(6), f.vy.toFixed(6),
      f.damage.toFixed(4), f.stocks, f.state, f.stateTimer,
      f.move?.id ?? '-', f.moveFrame, f.facing, f.shieldHp.toFixed(3),
      f.trait?.meter?.toFixed?.(4) ?? '-', f.trait?.charges ?? '-',
    ].join(','));
  }
  parts.push(`proj${match.projectiles.length}`, `trap${match.traps.length}`);
  return parts.join('|');
}

function makeMatch(config) {
  let result = null;
  const m = new Match(
    config, new AudioManager(), 1280, 720,
    { onEnd: (r) => { result = r; }, onPauseRequest() {} },
    { ...BASE_MODS }, 'off',
  );
  return { m, res: () => result };
}

let pass = 0;
let fail = 0;
let totalBytes = 0;
let totalFrames = 0;

for (let c = 0; c < cases; c++) {
  const a = FIGHTER_IDS[(c * 5) % FIGHTER_IDS.length];
  const b = FIGHTER_IDS[(c * 7 + 3) % FIGHTER_IDS.length];
  const stage = STAGE_IDS[c % STAGE_IDS.length];
  const config = {
    players: [
      { char: a, label: 'A', kind: 'ai', personality: 'balanced', difficulty: 'hard' },
      { char: b, label: 'B', kind: 'ai', personality: 'rusher', difficulty: 'expert' },
    ],
    stocks: 2,
    stageId: stage,
  };

  // ---- record ----
  const rec = makeMatch(structuredClone(config));
  const recorder = new ReplayRecorder(config.players.length);
  rec.m.recorder = recorder;
  const trace = [];
  let frames = 0;
  while (!rec.res() && frames < 60 * 60 * 3) {
    rec.m.step();
    trace.push(vector(rec.m));
    frames++;
  }
  const data = recorder.finish({
    config: structuredClone(config), mods: {},
    chars: [a, b], labels: ['A', 'B'], stageId: stage,
    winner: rec.res()?.winner ?? -1, durationFrames: frames, timeout: !rec.res(),
  });
  const bytes = JSON.stringify(data).length;
  totalBytes += bytes;
  totalFrames += frames;

  // ---- play back ----
  const play = makeMatch(structuredClone(config));
  const pb = new ReplayPlayback(data);
  play.m.playback = pb;
  play.m.inputProvider = pb.provide;
  let diverged = -1;
  for (let i = 0; i < frames; i++) {
    play.m.step();
    if (vector(play.m) !== trace[i]) { diverged = i; break; }
  }

  const kb = (bytes / 1024).toFixed(1);
  const rate = (bytes / Math.max(1, frames)).toFixed(1);
  if (diverged < 0) {
    pass++;
    console.log(`  ok    ${a} vs ${b} @ ${stage}  ${frames} frames  ${kb} KB  (${rate} B/frame)`);
  } else {
    fail++;
    console.log(`  FAIL  ${a} vs ${b} @ ${stage}  diverged at frame ${diverged}/${frames}`);
  }
}

console.log(`\n  RIFT BRAWL · replay fidelity  ·  ${pass}/${pass + fail} exact`);
console.log(`  ${(totalBytes / 1024).toFixed(1)} KB for ${totalFrames} recorded frames ` +
  `(${(totalBytes / Math.max(1, totalFrames)).toFixed(1)} bytes/frame, ` +
  `~${((totalBytes / Math.max(1, totalFrames)) * 60 * 60 / 1024).toFixed(0)} KB per minute of match)\n`);

if (fail > 0) process.exit(1);
