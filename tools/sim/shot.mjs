// ============ RIFT BRAWL — frame grabber ============
//
// Rasterises real match frames to PNG with @napi-rs/canvas, so the visuals can
// be reviewed without a browser. This is a development tool, not a CI gate:
// it is the only way to actually LOOK at a change to the renderer from here.
//
//   node tools/sim/shot.mjs                      six stages, default pairing
//   node tools/sim/shot.mjs frozen viper volt    one stage, chosen fighters
//   node tools/sim/shot.mjs --frames 400         let the AI fight longer first
//
// Output lands in .shots/ (git-ignored).

import './env.mjs';
import { loadGame, BASE_MODS } from './env.mjs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 1280, H = 720;

// The renderer builds offscreen sprite atlases through document.createElement.
// env.mjs stubs those with no-op canvases; here they have to be real ones or
// the glow/bloom passes have nothing to blit.
globalThis.document.createElement = (tag) =>
  tag === 'canvas' ? createCanvas(1, 1) : { style: {} };

const args = process.argv.slice(2);
let frames = 240;
const fi = args.indexOf('--frames');
if (fi >= 0) { frames = Number(args[fi + 1]) || 240; args.splice(fi, 2); }

const game = await loadGame();
const stages = args[0] ? [args[0]] : game.STAGE_IDS;
const a = args[1] ?? 'vanguard';
const b = args[2] ?? 'wraith';

// The renderer asks for "Arial Black" / "Segoe UI"; map whatever this box has.
try { GlobalFonts.registerFromPath?.('/usr/share/fonts', 'Arial'); } catch { /* best effort */ }

mkdirSync('.shots', { recursive: true });

/**
 * The engine's canvas handling expects a DOM-ish element. @napi-rs/canvas is
 * close enough; we only need width/height and getContext.
 */
function shot(stageId, label, prep) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const audio = new game.AudioManager();
  const match = new game.Match(
    {
      players: [
        { char: a, label: 'P1', kind: 'ai', personality: 'rusher', difficulty: 'hard' },
        { char: b, label: 'P2', kind: 'ai', personality: 'balanced', difficulty: 'hard' },
      ],
      stocks: 3,
      stageId,
    },
    audio, W, H,
    { onEnd() {}, onPauseRequest() {} },
    { ...BASE_MODS, quality: 'high', particleQ: 1, reduceFlash: false },
    'off',
  );

  for (let i = 0; i < frames; i++) match.step();
  prep?.(match);

  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, W, H);
  match.render(ctx, 1);

  const out = `.shots/${label}.png`;
  writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`  ${out}`);
  return match;
}

console.log(`\n  RIFT BRAWL · frame grabber  ·  ${a} vs ${b}, ${frames} frames in\n`);
for (const s of stages) shot(s, s);

// one KO cinematic frame, so the shot can be reviewed too
shot(stages[0], `${stages[0]}-ko`, (m) => {
  const f = m.fighters[1];
  m.koCam.trigger({
    x: f.x, y: f.y, vx: 14, vy: -6,
    color: f.cfg.info.colors.glow, kind: 'side', final: false,
  });
  for (let i = 0; i < 10; i++) m.koCam.update();
});
console.log('');
