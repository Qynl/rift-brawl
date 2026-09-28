// ============ RIFT BRAWL — Fighter Preview (animated portraits for UI) ============

'use client';

import { useEffect, useRef } from 'react';
import { Fighter, World } from '@/lib/game/fighters/Fighter';
import { FIGHTER_CONFIGS } from '@/lib/game/fighters/configs';
import { drawFighter } from '@/lib/game/fighters/render';
import { FighterId } from '@/lib/game/core/types';
import { buildStage } from '@/lib/game/stages/stages';
import { ParticleSystem } from '@/lib/game/effects/Particles';
import { AudioManager } from '@/lib/game/audio/AudioManager';

const fakeStage = buildStage('forest');
const fakeParticles = new ParticleSystem(30);

export function makePreviewFighter(id: FighterId, facing: 1 | -1 = 1): Fighter {
  const world = {
    tick: 0,
    gravity: 0.52,
    stage: fakeStage,
    particles: fakeParticles,
    audio: new AudioManager(),
    mods: {
      lowGravity: false, giant: false, tinyArena: false, oneHitKO: false, highKnockback: false,
      infiniteSpecials: false, movingPlatforms: false, chaosHazards: false,
    },
    // NOTE: this must implement the FULL World interface. It used to be an
    // `as unknown as World` cast that silently omitted five spawn hooks, so any
    // preview fighter that ran a trap special would throw inside a rAF loop.
    fighters: [] as Fighter[],
    shake() { }, flash() { }, punchZoom() { }, emitSfx() { },
    spawnProjectile() { }, spawnTrap() { },
    spawnVoidSpikes() { }, spawnVenomCloud() { }, spawnLightWard() { }, spawnBearTrap() { },
    onSwing() { },
    onHitConnect() { }, onCounterSuccess() { }, onShieldBreak() { },
  } satisfies World;
  const f = new Fighter(FIGHTER_CONFIGS[id], 0, world, '');
  f.facing = facing;
  f.grounded = true;
  f.px = f.x; f.py = f.y;
  return f;
}

/** Animated fighter render loop for menus */
export function useFighterPreview(
  ref: React.RefObject<HTMLCanvasElement | null>,
  fighterId: FighterId,
  opts?: { zoom?: number; facing?: 1 | -1; y?: number }
) {
  const fighterRef = useRef<Fighter | null>(null);
  if (!fighterRef.current || fighterRef.current.id !== fighterId) {
    fighterRef.current = makePreviewFighter(fighterId, opts?.facing ?? 1);
  }
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const loop = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const f = fighterRef.current!;
      const zoom = (opts?.zoom ?? 1) * (H / 120);
      ctx.save();
      ctx.translate(W / 2, H * (opts?.y ?? 0.9));
      ctx.scale(zoom, zoom);
      drawFighter(ctx, f, t, 1);
      ctx.restore();
      t++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fighterId, opts?.zoom, opts?.facing, opts?.y, ref]);
}
