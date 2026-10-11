// ============ RIFT BRAWL — fighter close-up sheet ============
//
// Rasterises every fighter in a set of canonical poses at high zoom to a PNG
// contact sheet (.shots/closeup.png). The match screenshots answer "what does
// the game look like"; this answers "does the character model hold up".
//
//   node tools/sim/closeup.mjs            all fighters, all poses
//   node tools/sim/closeup.mjs ember      one fighter only
//
// Development tool, not a CI gate — same family as shot.mjs.

import './env.mjs';
import { loadGame } from './env.mjs';
import { createJiti } from 'jiti';
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { '@': ROOT + 'src' }, interopDefault: true });

globalThis.document.createElement = (tag) =>
  tag === 'canvas' ? createCanvas(1, 1) : { style: {} };

const game = await loadGame();
const { drawFighter } = await jiti.import(ROOT + 'src/lib/game/fighters/render.ts');
const { FIGHTER_CONFIGS } = await jiti.import(ROOT + 'src/lib/game/fighters/configs.ts');
const { Fighter } = await jiti.import(ROOT + 'src/lib/game/fighters/Fighter.ts');
const { ParticleSystem } = await jiti.import(ROOT + 'src/lib/game/effects/Particles.ts');

const only = process.argv[2];

const POSES = ['idle', 'walk', 'jumpsquat', 'attack', 'launch'];
const TILE = 300;

const audio = new game.AudioManager();
const ids = (only ? [only] : game.FIGHTER_IDS).filter(id => FIGHTER_CONFIGS[id]);

// a World stub — enough surface for Fighter/drawFighter to never notice
const world = {
  tick: 0, gravity: 0.52, stage: null, particles: new ParticleSystem(32), audio,
  mods: {}, fighters: [],
  shake() {}, flash() {}, punchZoom() {}, emitSfx() {},
  spawnProjectile() {}, spawnTrap() {}, spawnVoidSpikes() {}, spawnVenomCloud() {},
  spawnLightWard() {}, spawnBearTrap() {}, onHitConnect() {}, onCounterSuccess() {},
};

const fighters = ids.map((id, i) => {
  const f = new Fighter(FIGHTER_CONFIGS[id], i, world, `P${i + 1}`);
  f.x = 0; f.y = 0; f.px = 0; f.py = 0; f.facing = 1;
  return f;
});

const cols = Math.min(6, ids.length);
const rows = Math.ceil(ids.length / cols);
const W = cols * TILE, H = rows * POSES.length * TILE;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#0d0c16';
ctx.fillRect(0, 0, W, H);

function pose(f, p) {
  f.move = null; f.chargeFrames = 0; f.stateTimer = 0; f.hitstop = 0; f.hitFlash = 0;
  f.invuln = 0; f.parried = 0; f.vx = 0; f.vy = 0; f.grounded = true; f.fastFalling = false;
  switch (p) {
    case 'idle': f.state = 'idle'; break;
    case 'walk': f.state = 'walk'; f.vx = 3; break;
    case 'jumpsquat': f.state = 'jumpsquat'; f.stateTimer = 2; break;
    case 'attack': {
      f.state = 'attack';
      const m = f.cfg.moves['fsmash'] ?? f.cfg.moves['fattack'] ?? Object.values(f.cfg.moves)[0];
      f.startMove(m);
      f.moveFrame = Math.max(1, Math.round(m.startup * 0.9));
      break;
    }
    case 'launch': f.state = 'launch'; f.vx = 12; f.vy = -9; f.stateTimer = 9; f.grounded = false; break;
  }
}

for (let i = 0; i < ids.length; i++) {
  const f = fighters[i];
  const col = i % cols, row = Math.floor(i / cols);
  for (let p = 0; p < POSES.length; p++) {
    pose(f, POSES[p]);
    const tick = 37 + i * 11;
    const tx = col * TILE, ty = row * POSES.length * TILE + p * TILE;
    ctx.save();
    // tile frame + floor line to judge squash & stretch
    ctx.fillStyle = (i + p) % 2 ? '#12111e' : '#161524';
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(tx + 16, ty + TILE * 0.82, TILE - 32, 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(tx, ty, TILE, TILE); ctx.clip();
    ctx.translate(tx + TILE / 2, ty + TILE * 0.82);
    ctx.scale(3.1, 3.1);
    ctx.translate(-f.x, -(f.y + f.h / 2));
    drawFighter(ctx, f, tick, 1);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.fillText(`${f.cfg.info.name}`, tx + 10, ty + 20);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(POSES[p], tx + 10, ty + 36);
    ctx.restore();
  }
}

mkdirSync('.shots', { recursive: true });
const out = `.shots/closeup${only ? '-' + only : ''}.png`;
writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`\n  ${out}  (${ids.length} fighters x ${POSES.length} poses)\n`);
