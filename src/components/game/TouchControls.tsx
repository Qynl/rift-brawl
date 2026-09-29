// ============ RIFT BRAWL — Touch controls ============
//
// The game shipped keyboard + gamepad only, which meant it was literally
// unplayable on the device most people will open it on. This overlay adds a
// floating analog thumbstick and a button cluster that write into
// InputManager's virtual touch layer, so the simulation is untouched.
//
// Design notes:
//  · The stick is FLOATING — it re-centres wherever the left thumb lands, which
//    is the only scheme that works without looking at the screen.
//  · Buttons are pointer-event based (not click) so multi-touch chords such as
//    shield + attack (= grab) and jump + attack (= rising aerial) work.
//  · `touch-action: none` + `overscroll-behavior: none` stop iOS Safari from
//    stealing drags for scroll/zoom mid-combo.

'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameEngine } from '@/lib/game/Engine';
import type { ActionName } from '@/lib/game/core/types';

const STICK_RADIUS = 58;
const DEADZONE = 0.16;

interface Props {
  engine: GameEngine;
  /** hide while a menu/pause overlay owns the screen */
  hidden?: boolean;
}

/**
 * Subscribe to the pointer-capability media query. useSyncExternalStore keeps
 * this SSR-safe (server snapshot = false) without a setState-in-effect, and it
 * live-updates if a tablet is docked to a mouse mid-session.
 */
const COARSE_QUERY = '(pointer: coarse)';
function subscribeCoarse(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(COARSE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function coarseSnapshot() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia?.(COARSE_QUERY).matches ?? false) || 'ontouchstart' in window;
}

export default function TouchControls({ engine, hidden }: Props) {
  const visible = useSyncExternalStore(subscribeCoarse, coarseSnapshot, () => false);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickTouch = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  // release every virtual button if the overlay unmounts or the tab is hidden
  useEffect(() => {
    if (!visible) return;
    const release = () => engine.input.clearTouch();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      release();
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [visible, engine]);

  if (!visible || hidden) return null;

  const moveKnob = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onStickDown = (e: React.PointerEvent) => {
    e.preventDefault();
    stickTouch.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = stickRef.current!.getBoundingClientRect();
    origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    onStickMove(e);
  };

  const onStickMove = (e: React.PointerEvent) => {
    if (stickTouch.current !== e.pointerId) return;
    e.preventDefault();
    let dx = e.clientX - origin.current.x;
    let dy = e.clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
    moveKnob(dx, dy);
    const nx = dx / STICK_RADIUS;
    const ny = dy / STICK_RADIUS;
    engine.input.setTouchAxis(Math.abs(nx) < DEADZONE ? 0 : nx, Math.abs(ny) < DEADZONE ? 0 : ny);
  };

  const onStickUp = (e: React.PointerEvent) => {
    if (stickTouch.current !== e.pointerId) return;
    stickTouch.current = null;
    moveKnob(0, 0);
    engine.input.setTouchAxis(0, 0);
  };

  const btn = (action: ActionName, label: string, color: string, extra = '') => (
    <button
      key={action}
      type="button"
      aria-label={action}
      className={`select-none rounded-full border-2 font-black tracking-wider active:scale-95 transition-transform ${extra}`}
      style={{
        borderColor: color + '88',
        background: `radial-gradient(circle at 35% 30%, ${color}33, ${color}12 60%, rgba(6,6,16,0.72))`,
        color,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        touchAction: 'none',
      }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); engine.input.setTouch(action, true); }}
      onPointerUp={(e) => { e.preventDefault(); engine.input.setTouch(action, false); }}
      onPointerCancel={() => engine.input.setTouch(action, false)}
      onPointerLeave={() => engine.input.setTouch(action, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      {/* ---- left: floating analog stick ---- */}
      <div
        ref={stickRef}
        className="absolute left-[4vw] bottom-[6vh] pointer-events-auto rounded-full border-2 border-white/15 bg-black/25 backdrop-blur-[2px]"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, touchAction: 'none' }}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 rounded-full border-2 border-white/40 bg-white/15"
          style={{ width: 52, height: 52, marginLeft: -26, marginTop: -26, transition: 'transform 40ms linear' }}
        />
        <div className="absolute inset-0 grid place-items-center text-[9px] tracking-[0.3em] text-white/25 font-bold">MOVE</div>
      </div>

      {/* ---- right: action cluster ---- */}
      <div className="absolute right-[3vw] bottom-[5vh] pointer-events-auto" style={{ width: 210, height: 210, touchAction: 'none' }}>
        <div className="absolute left-[8px] top-[76px] w-[62px] h-[62px]">{btn('attack', 'A', '#ff6b8a', 'w-full h-full text-lg')}</div>
        <div className="absolute left-[70px] top-[132px] w-[62px] h-[62px]">{btn('special', 'S', '#5cffce', 'w-full h-full text-lg')}</div>
        <div className="absolute left-[132px] top-[76px] w-[62px] h-[62px]">{btn('jump', '⤴', '#ffd166', 'w-full h-full text-xl')}</div>
        <div className="absolute left-[70px] top-[20px] w-[62px] h-[62px]">{btn('grab', 'G', '#c99aff', 'w-full h-full text-lg')}</div>
      </div>

      {/* ---- defensive strip ---- */}
      <div className="absolute right-[3vw] bottom-[calc(5vh+220px)] pointer-events-auto flex gap-2" style={{ touchAction: 'none' }}>
        <div className="w-[56px] h-[46px]">{btn('shield', 'BLK', '#7cf3ff', 'w-full h-full text-[11px]')}</div>
        <div className="w-[56px] h-[46px]">{btn('dodge', 'DDG', '#b58cff', 'w-full h-full text-[11px]')}</div>
        <div className="w-[56px] h-[46px]">{btn('dash', 'DSH', '#ffb347', 'w-full h-full text-[11px]')}</div>
      </div>
    </div>
  );
}
