// ============ RIFT BRAWL — Input Manager ============
// Keyboard (remappable) + Gamepad (standard mapping) → per-player virtual controllers.

import { ActionName, ALL_ACTIONS, InputState, KeyBindValue, emptyInput } from './types';

// Dash is a deliberate button press (Q or E) — never a hold or double-tap of A/D.
export const DEFAULT_KEYBINDS_P1: Partial<Record<ActionName, KeyBindValue>> = {
  left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
  jump: 'Space', attack: 'KeyJ', special: 'KeyK', grab: 'KeyL',
  shield: 'KeyI', dodge: 'KeyU', dash: ['KeyQ', 'KeyE'],
};

export const DEFAULT_KEYBINDS_P2: Partial<Record<ActionName, KeyBindValue>> = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  jump: 'ArrowUp', attack: 'Comma', special: 'Period', grab: 'Slash',
  shield: 'KeyM', dodge: 'KeyN', dash: 'ShiftRight',
};

const GAMEPAD_NAVIGATED_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Comma', 'Period', 'Quote', 'Semicolon',
  'BracketLeft', 'BracketRight', 'Tab',
]);

interface RawButton { held: boolean; pressed: boolean; released: boolean }

function newRaw(): Record<ActionName, RawButton> {
  const o = {} as Record<ActionName, RawButton>;
  for (const a of ALL_ACTIONS) o[a] = { held: false, pressed: false, released: false };
  return o;
}

export class InputManager {
  private keyState = new Map<string, boolean>();
  p1Binds: Partial<Record<ActionName, KeyBindValue>>;
  p2Binds: Partial<Record<ActionName, KeyBindValue>>;
  controllers: [InputState, InputState] = [emptyInput(), emptyInput()];
  // gamepad mapping: playerIndex -> gamepad index or -1
  gamepadSlots: [number, number] = [0, 1];
  private raw: [Record<ActionName, RawButton>, Record<ActionName, RawButton>] = [newRaw(), newRaw()];
  private attached = false;
  onAnyKey?: (code: string) => void; // used by keybind remap capture

  constructor() {
    this.p1Binds = { ...DEFAULT_KEYBINDS_P1 };
    this.p2Binds = { ...DEFAULT_KEYBINDS_P2 };
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.keydown, { passive: false });
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clearAll);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clearAll);
    this.clearAll();
  }

  private keydown = (e: KeyboardEvent) => {
    if (e.repeat) { if (GAMEPAD_NAVIGATED_KEYS.has(e.code) || e.code === 'Space') e.preventDefault(); return; }
    this.keyState.set(e.code, true);
    this.onAnyKey?.(e.code);
    if (GAMEPAD_NAVIGATED_KEYS.has(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  };

  private keyup = (e: KeyboardEvent) => {
    this.keyState.set(e.code, false);
  };

  private clearAll = () => { this.keyState.clear(); };

  setBinds(p1: Partial<Record<ActionName, KeyBindValue>>, p2: Partial<Record<ActionName, KeyBindValue>>) {
    this.p1Binds = { ...p1 }; this.p2Binds = { ...p2 };
  }

  /** True when a bind value (single key or list of keys) is currently held. */
  private keyOn(v: KeyBindValue | undefined): boolean {
    if (!v) return false;
    if (Array.isArray(v)) {
      for (const code of v) if (this.keyState.get(code)) return true;
      return false;
    }
    return !!this.keyState.get(v);
  }

  /** Poll hardware into raw edge state. Call once per fixed step. */
  poll() {
    // gamepads
    let pads: Gamepad[] = [];
    try { pads = Array.from(navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[]; } catch { /* ignore */ }

    for (let p = 0; p < 2; p++) {
      const raw = this.raw[p];
      // keyboard
      const binds = p === 0 ? this.p1Binds : this.p2Binds;
      for (const action of ALL_ACTIONS) {
        let on = this.keyOn(binds[action]);
        // gamepad override/merge
        const slot = this.gamepadSlots[p];
        if (slot >= 0 && pads[slot]) on = on || this.readGamepad(pads[slot], action);
        const r = raw[action];
        if (on && !r.held) r.pressed = true;
        else r.pressed = false;
        if (!on && r.held) r.released = true;
        else r.released = false;
        r.held = on;
      }
      // build controller state
      const c = this.controllers[p];
      const h = c.held, pr = c.pressed, rel = c.released;
      for (const action of ALL_ACTIONS) {
        h[action] = raw[action].held;
        pr[action] = raw[action].pressed;
        rel[action] = raw[action].released;
      }
      c.axisX = (h.right ? 1 : 0) - (h.left ? 1 : 0);
      c.axisY = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    }
  }

  private readGamepad(pad: Gamepad, action: ActionName): boolean {
    const b = pad.buttons;
    const ax = pad.axes;
    const btn = (i: number) => !!b[i]?.pressed;
    switch (action) {
      case 'left': return btn(14) || (ax[0] !== undefined && ax[0] < -0.4);
      case 'right': return btn(15) || (ax[0] !== undefined && ax[0] > 0.4);
      case 'up': return btn(12) || (ax[1] !== undefined && ax[1] < -0.5);
      case 'down': return btn(13) || (ax[1] !== undefined && ax[1] > 0.5);
      case 'jump': return btn(0) || btn(1);
      case 'attack': return btn(2) || (b[7]?.value ?? 0) > 0.4;
      case 'special': return btn(3) || (b[5]?.pressed ?? false);
      case 'grab': return btn(4) || (b[6]?.value ?? 0) > 0.4;
      case 'shield': return btn(8);
      case 'dodge': return btn(9) || btn(11);
      case 'dash': return btn(10); // L3 stick click = dash burst
      default: return false;
    }
  }

  /** Human-readable label for a bind value (single key or list). */
  static bindLabel(v: KeyBindValue | undefined): string {
    if (!v) return '—';
    if (Array.isArray(v)) return v.map(c => InputManager.keyLabel(c)).join(' / ');
    return InputManager.keyLabel(v);
  }

  /** Human-readable label for a key code */
  static keyLabel(code: string): string {
    const map: Record<string, string> = {
      Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
      AltLeft: 'L-ALT', AltRight: 'R-ALT', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: 'BKSP',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
      Backquote: '`', Minus: '-', Equal: '=', CapsLock: 'CAPS',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM' + code.slice(6);
    return code.toUpperCase();
  }
}
