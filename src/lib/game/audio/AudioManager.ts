// ============ RIFT BRAWL — Procedural Audio Engine ============
// 100% original synthesized SFX + sequenced music via WebAudio. No samples, no copyrighted audio.

type SfxName =
  | 'ui_move' | 'ui_select' | 'ui_back' | 'ui_start'
  | 'jump' | 'doublejump' | 'land' | 'dash'
  | 'swing' | 'swing_heavy' | 'swing_air'
  | 'hit1' | 'hit2' | 'hit3'
  | 'shield_on' | 'shield_hit' | 'shield_break'
  | 'dodge' | 'grab' | 'grabbed' | 'throw'
  | 'ko' | 'count' | 'go' | 'victory' | 'defeat'
  | 'lava_warn' | 'lava_burst' | 'wind' | 'portal' | 'crack' | 'respawn'
  | 'proj_fire' | 'proj_boomer' | 'trap' | 'counter' | 'charge' | 'charge_release' | 'teleport'
  | 'parry' | 'poison'
  | 'tech' | 'gust' | 'bow' | 'net' | 'scatter' | 'snap'
  | 'combo1' | 'combo2' | 'combo3';

export interface AudioVolumes { master: number; music: number; sfx: number }

const NOTE = (semi: number) => 440 * Math.pow(2, semi / 12);

interface TrackDef {
  bpm: number;
  root: number;        // semitone offset from A4 for bass root
  scale: number[];     // semitone steps
  bassPat: number[];   // pattern indices into scale (-1 = rest), 16 steps
  leadPat: number[];   // 16 steps, values = scale degree or -1
  drums: number;       // 0 calm .. 2 intense
  padChords: number[][]; // chords per 4 bars (scale degrees)
  swing?: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRY = [0, 1, 3, 5, 7, 8, 10];

// per-stage battle themes (all original patterns)
const THEMES: Record<string, TrackDef> = {
  menu: { bpm: 96, root: -17, scale: MINOR, bassPat: [0,-1,-1,-1, 4,-1,-1,-1, 2,-1,-1,-1, 4,-1,-1,-1], leadPat: [-1,-1,-1,-1,-1,-1,-1,-1, 7,-1,-1,-1,-1,-1,-1,-1], drums: 0, padChords: [[0,2,4],[5,7,9],[3,5,7],[0,2,4]] },
  forest: { bpm: 122, root: -17, scale: DORIAN, bassPat: [0,-1,0,-1, 4,-1,2,-1, 0,-1,0,-1, 5,-1,4,-1], leadPat: [7,-1,5,4, -1,5,-1,2, 4,-1,5,-1, 7,-1,9,-1], drums: 1, padChords: [[0,2,4],[3,5,7],[4,6,8],[0,2,4]] },
  volcano: { bpm: 138, root: -19, scale: PHRY, bassPat: [0,0,-1,0, 0,-1,1,-1, 0,0,-1,0, 3,-1,1,-1], leadPat: [0,1,0,-1, 3,-1,1,0, -1,0,1,3, 1,0,-1,-1], drums: 2, padChords: [[0,1,4],[1,4,5],[0,3,4],[1,4,5]] },
  neon: { bpm: 128, root: -17, scale: MINOR, bassPat: [0,-1,0,0, -1,0,-1,2, 0,-1,0,0, 4,-1,2,-1], leadPat: [7,-1,4,-1, 7,-1,9,-1, 11,-1,9,7, -1,4,-1,2], drums: 2, padChords: [[0,2,4],[5,0,2],[3,5,7],[4,6,8]] },
  frozen: { bpm: 108, root: -19, scale: MINOR, bassPat: [0,-1,-1,2, -1,-1,4,-1, 3,-1,-1,2, -1,-1,0,-1], leadPat: [4,-1,2,-1, 0,-1,2,4, -1,7,-1,4, -1,2,-1,-1], drums: 1, padChords: [[0,2,4],[2,4,6],[5,0,2],[3,5,7]] },
  sky: { bpm: 118, root: -17, scale: DORIAN, bassPat: [0,-1,4,-1, 2,-1,5,-1, 0,-1,4,-1, 6,-1,5,-1], leadPat: [0,-1,2,4, -1,7,-1,4, 5,-1,4,2, -1,4,-1,-1], drums: 1, padChords: [[0,2,4],[4,6,8],[5,7,9],[2,4,6]] },
  rift: { bpm: 132, root: -20, scale: PHRY, bassPat: [0,-1,0,1, -1,0,-1,-1, 0,-1,0,1, 3,-1,-1,1], leadPat: [-1,0,1,-1, 4,-1,1,0, -1,1,0,-1, 6,-1,4,-1], drums: 2, padChords: [[0,1,4],[1,4,6],[0,3,4],[2,5,6]] },
  results: { bpm: 100, root: -17, scale: MINOR, bassPat: [0,-1,-1,-1, -1,-1,-1,-1, 4,-1,-1,-1, -1,-1,-1,-1], leadPat: [0,-1,4,-1, 7,-1,9,-1, -1,-1,-1,-1, -1,-1,-1,-1], drums: 0, padChords: [[0,2,4],[5,0,2],[3,5,7],[0,2,4]] },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volumes: AudioVolumes = { master: 0.8, music: 0.55, sfx: 0.85 };
  private currentTheme: string | null = null;
  private themeName: string | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intensity = 0;
  musicEnabled = true;
  sfxEnabled = true;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      // noise buffer
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    } catch { /* audio unavailable */ }
  }

  setVolumes(v: AudioVolumes) {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) return;
    this.masterGain.gain.value = this.volumes.master;
    this.musicGain.gain.value = this.musicEnabled ? this.volumes.music * 0.5 : 0;
    this.sfxGain.gain.value = this.sfxEnabled ? this.volumes.sfx : 0;
  }

  setMusicEnabled(on: boolean) { this.musicEnabled = on; this.applyVolumes(); if (!on) this.stopMusic(); }
  setSfxEnabled(on: boolean) { this.sfxEnabled = on; this.applyVolumes(); }

  // ---------------- SFX synth helpers ----------------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, dest?: AudioNode) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest ?? this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1?: number, delay = 0, q = 1) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  play(name: SfxName, variant = 0) {
    if (!this.ctx || !this.sfxEnabled) return;
    if (this.ctx.state === 'suspended') { void this.ctx.resume(); }
    const v = variant; // pitch variant
    const pv = 1 + v * 0.06;
    switch (name) {
      case 'ui_move': this.tone(520 * pv, 0.06, 'square', 0.12); break;
      case 'ui_select': this.tone(440, 0.07, 'square', 0.14); this.tone(660, 0.09, 'square', 0.12, undefined, 0.06); break;
      case 'ui_back': this.tone(440, 0.07, 'square', 0.12); this.tone(300, 0.09, 'square', 0.12, undefined, 0.05); break;
      case 'ui_start': this.tone(392, 0.1, 'square', 0.16); this.tone(523, 0.1, 'square', 0.16, undefined, 0.08); this.tone(784, 0.16, 'square', 0.16, undefined, 0.16); break;
      case 'jump': this.tone(200 * pv, 0.14, 'square', 0.12, 420 * pv); break;
      case 'doublejump': this.tone(300, 0.12, 'triangle', 0.12, 600); this.tone(450, 0.1, 'square', 0.08, 900, 0.03); break;
      case 'land': this.noise(0.09, 0.16, 'lowpass', 500, 120); break;
      case 'dash': this.noise(0.16, 0.2, 'bandpass', 900, 2400); break;
      case 'swing': this.noise(0.1, 0.16, 'bandpass', 1600, 3200, 0, 2); break;
      case 'swing_heavy': this.noise(0.2, 0.22, 'bandpass', 800, 1800, 0, 2); this.tone(90, 0.16, 'sine', 0.14, 50); break;
      case 'swing_air': this.noise(0.12, 0.14, 'bandpass', 2000, 3600, 0, 2); break;
      case 'hit1': this.tone(180, 0.1, 'sine', 0.3, 60); this.noise(0.08, 0.22, 'highpass', 2000); break;
      case 'hit2': this.tone(150, 0.14, 'sine', 0.38, 50); this.noise(0.12, 0.3, 'highpass', 1600); this.tone(300, 0.06, 'square', 0.1, 100); break;
      case 'hit3': this.tone(110, 0.24, 'sine', 0.5, 36); this.noise(0.2, 0.4, 'highpass', 1200); this.tone(220, 0.1, 'square', 0.16, 60); this.noise(0.3, 0.2, 'lowpass', 300, 80); break;
      case 'shield_on': this.tone(320, 0.12, 'sine', 0.1, 400); break;
      case 'shield_hit': this.tone(700, 0.1, 'triangle', 0.16, 400); this.noise(0.08, 0.12, 'bandpass', 2400); break;
      case 'shield_break': this.tone(600, 0.4, 'triangle', 0.2, 120); this.noise(0.3, 0.3, 'highpass', 3000, 400); this.tone(200, 0.3, 'square', 0.12, 60, 0.05); break;
      case 'dodge': this.noise(0.14, 0.14, 'bandpass', 1200, 300); break;
      case 'grab': this.tone(500, 0.05, 'square', 0.16, 200); this.noise(0.06, 0.16, 'highpass', 2500); break;
      case 'grabbed': this.tone(260, 0.1, 'sawtooth', 0.14, 140); break;
      case 'throw': this.noise(0.14, 0.22, 'bandpass', 700, 2000); this.tone(140, 0.12, 'sine', 0.2, 70, 0.06); break;
      case 'ko': this.tone(80, 0.7, 'sine', 0.6, 28); this.noise(0.5, 0.5, 'lowpass', 900, 60); this.noise(0.2, 0.3, 'highpass', 2500, 300); this.tone(50, 0.9, 'triangle', 0.4, 24, 0.05); break;
      case 'count': this.tone(440, 0.09, 'square', 0.18); break;
      case 'go': this.tone(523, 0.12, 'square', 0.2); this.tone(784, 0.22, 'square', 0.2, undefined, 0.1); this.noise(0.18, 0.14, 'highpass', 1500); break;
      case 'victory': [0, 4, 7, 12].forEach((s, i) => this.tone(NOTE(s), 0.24, 'square', 0.14, undefined, i * 0.12)); break;
      case 'defeat': [7, 3, 0, -5].forEach((s, i) => this.tone(NOTE(s), 0.3, 'triangle', 0.14, undefined, i * 0.16)); break;
      case 'lava_warn': this.tone(660, 0.18, 'sawtooth', 0.1, 620); this.tone(660, 0.18, 'sawtooth', 0.1, 620, 0.25); break;
      case 'lava_burst': this.noise(0.7, 0.4, 'lowpass', 400, 80); this.tone(60, 0.6, 'sine', 0.35, 30); break;
      case 'wind': this.noise(0.8, 0.14, 'bandpass', 400, 900, 0, 3); break;
      case 'portal': this.tone(300, 0.3, 'sine', 0.12, 900); this.noise(0.25, 0.1, 'bandpass', 1800, 3600, 0, 4); break;
      case 'crack': this.noise(0.1, 0.26, 'highpass', 2200); this.noise(0.12, 0.2, 'highpass', 1600, 600, 0.06); break;
      case 'respawn': this.tone(300, 0.3, 'sine', 0.1, 700); this.tone(600, 0.2, 'triangle', 0.08, 1200, 0.1); break;
      case 'proj_fire': this.noise(0.16, 0.18, 'bandpass', 600, 1400); this.tone(220, 0.12, 'sawtooth', 0.1, 90); break;
      case 'proj_boomer': this.tone(800, 0.2, 'square', 0.07, 400); break;
      case 'trap': this.tone(880, 0.08, 'square', 0.14, 440); this.noise(0.1, 0.14, 'highpass', 3000); break;
      case 'counter': this.tone(200, 0.2, 'sawtooth', 0.2, 800); this.tone(400, 0.15, 'square', 0.12, 1600, 0.02); break;
      case 'charge': this.tone(120, 0.5, 'sawtooth', 0.07, 300); break;
      case 'charge_release': this.tone(150, 0.3, 'sawtooth', 0.3, 60); this.noise(0.25, 0.3, 'highpass', 900, 300); break;
      case 'teleport': this.tone(900, 0.12, 'sine', 0.12, 200); this.tone(180, 0.14, 'sine', 0.1, 800, 0.08); break;
      case 'combo1': this.tone(NOTE(7), 0.08, 'square', 0.1); break;
      case 'combo2': this.tone(NOTE(10), 0.08, 'square', 0.1); break;
      case 'combo3': this.tone(NOTE(14), 0.1, 'square', 0.12); break;
      case 'tech':
        // sharp scrape + sparkle — a perfectly timed save
        this.noise(0.1, 0.22, 'highpass', 1800, 3400);
        this.tone(720, 0.1, 'triangle', 0.12, 1180);
        this.tone(1440, 0.14, 'sine', 0.07, 2100, 0.03);
        break;
      case 'gust':
        // airy wind whoosh
        this.noise(0.34, 0.2, 'bandpass', 500, 1400, 0, 3);
        this.noise(0.2, 0.1, 'bandpass', 1200, 2400, 0.05, 2);
        break;
      case 'bow':
        // crossbow twang + string snap
        this.tone(180, 0.09, 'square', 0.16, 70);
        this.noise(0.08, 0.16, 'highpass', 2400);
        this.tone(980, 0.07, 'triangle', 0.06, 500, 0.02);
        break;
      case 'net':
        // weighted net flinging out
        this.noise(0.22, 0.16, 'bandpass', 900, 300, 0, 2);
        this.tone(240, 0.14, 'triangle', 0.08, 120);
        break;
      case 'scatter':
        // close-range blast
        this.noise(0.2, 0.3, 'lowpass', 1400, 220);
        this.tone(110, 0.18, 'sawtooth', 0.16, 55);
        break;
      case 'snap':
        // bear trap clamping shut
        this.noise(0.07, 0.28, 'highpass', 2000);
        this.tone(320, 0.12, 'square', 0.2, 90);
        this.tone(150, 0.2, 'sine', 0.14, 60, 0.03);
        break;
      case 'parry':
        // bright metallic ding + shimmer
        this.tone(NOTE(24), 0.18, 'triangle', 0.22, NOTE(31));
        this.tone(NOTE(36), 0.12, 'sine', 0.1, NOTE(38), 0.03);
        this.noise(0.12, 0.12, 'highpass', 3200);
        break;
      case 'poison':
        // wet acidic blub
        this.tone(180, 0.14, 'sine', 0.09, 90);
        this.noise(0.1, 0.05, 'lowpass', 700, 300);
        break;
    }
  }

  // ---------------- Music sequencer ----------------

  playMusic(theme: string) {
    this.ensure();
    if (!this.ctx) return;
    if (this.themeName === theme && this.timer) return;
    this.stopMusic();
    this.themeName = theme;
    this.currentTheme = THEMES[theme] ? theme : 'forest';
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.scheduler(), 40);
  }

  setIntensity(v: number) { this.intensity = v; }

  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.themeName = null;
  }

  private scheduler() {
    if (!this.ctx || !this.musicGain || !this.currentTheme) return;
    const track = THEMES[this.currentTheme];
    const stepDur = 60 / track.bpm / 4; // 16th notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      this.scheduleStep(track, this.step, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private mNote(freq: number, t0: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slideTo?: number, fltType?: BiquadFilterType, fltF?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.setValueAtTime(vol, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = o;
    if (fltType && fltF) {
      const f = ctx.createBiquadFilter();
      f.type = fltType; f.frequency.value = fltF;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  private mNoise(t0: number, dur: number, vol: number, type: BiquadFilterType, freq: number, dest: AudioNode) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  private scheduleStep(track: TrackDef, step: number, t0: number) {
    if (!this.musicGain) return;
    const dest = this.musicGain;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const rootHz = NOTE(track.root);
    const scale = track.scale;

    // drums
    if (track.drums >= 1) {
      if (s16 === 0 || s16 === 8 || (track.drums === 2 && s16 === 6)) {
        this.mNote(140, t0, 0.14, 'sine', 0.5, dest, 42);
      }
      if (s16 % 4 === 2) this.mNoise(t0, 0.03, 0.1, 'highpass', 7000, dest);
      if (track.drums === 2 && (s16 === 4 || s16 === 12)) this.mNoise(t0, 0.09, 0.16, 'bandpass', 1800, dest);
      if (track.drums === 2 && s16 % 2 === 0) this.mNoise(t0, 0.02, 0.05, 'highpass', 9000, dest);
    }

    // bass
    const b = track.bassPat[s16];
    if (b >= 0) {
      const semis = scale[b % scale.length] + 12 * Math.floor(b / scale.length);
      const f = rootHz * Math.pow(2, semis / 12);
      this.mNote(f, t0, 0.16, 'sawtooth', 0.16, dest, undefined, 'lowpass', 500);
      this.mNote(f / 2, t0, 0.16, 'sine', 0.2, dest);
    }

    // lead arp (intensity gated)
    const l = track.leadPat[s16];
    if (l >= 0 && (track.drums === 0 || this.intensity > 0.1 || bar % 2 === 1)) {
      const semis = scale[l % scale.length] + 12 * Math.floor(l / scale.length);
      const f = rootHz * 4 * Math.pow(2, semis / 12);
      this.mNote(f, t0, 0.12, 'square', track.drums === 0 ? 0.05 : 0.055 + this.intensity * 0.03, dest, undefined, 'lowpass', 2600);
      if (this.intensity > 0.5) this.mNote(f * 1.007, t0, 0.12, 'sawtooth', 0.04, dest, undefined, 'lowpass', 3000);
    }

    // pad chords each bar
    if (s16 === 0) {
      const chord = track.padChords[bar % track.padChords.length];
      for (const deg of chord) {
        const semis = scale[deg % scale.length] + 12 * Math.floor(deg / scale.length);
        const f = rootHz * 2 * Math.pow(2, semis / 12);
        this.mNote(f, t0, (60 / track.bpm) * 4, 'triangle', 0.045, dest);
      }
    }
  }

  dispose() {
    this.stopMusic();
    try { void this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
  }
}

export const audio = new AudioManager();
