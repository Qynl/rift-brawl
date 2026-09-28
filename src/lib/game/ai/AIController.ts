// ============ RIFT BRAWL — AI Controller v2 ============
// Utility-scored decision AI with real move knowledge (reach / startup / kill-%),
// delayed perception, reaction-gated defense, whiff punishment, combo pursuit,
// kill awareness, edge guarding, per-character special playbooks, DI survival
// and statistical adaptation. Plays through the same virtual input interface as a human.

import { InputState, AIPersonality, AIDifficulty, ActionName, FighterId } from '../core/types';
import { clamp, chance, rand, pick, knockbackOf } from '../core/constants';
import { FIGHTER_CONFIGS } from '../fighters/configs';
import type { Match } from '../Match';
import type { Fighter } from '../fighters/Fighter';
import { moveActive, moveTotal } from '../fighters/Fighter';

type PlanType =
  | 'move' | 'wait' | 'attack' | 'special' | 'grab' | 'shield' | 'dodge'
  | 'jump' | 'recover' | 'edgeguard' | 'mash';

interface Plan {
  type: PlanType;
  dir: number;          // -1, 0, 1
  dur: number;          // frames
  elapsed: number;
  kind?: string;        // move id or special slot ('n' | 's' | 'u' | 'd')
  targetX?: number;     // for move / aiming
  dash?: boolean;
  drop?: boolean;       // drop through a pass-platform when jumping
  holdSpecial?: number; // frames to hold special (charge shots)
  fired?: boolean;
}

interface DiffParams {
  react: number;     // perception delay frames
  interval: number;  // min frames between decisions
  noise: number;     // score noise
  mistake: number;   // chance of a bad decision
  tech: number;      // execution quality 0..1
  adapt: number;     // habit adaptation strength
  aggr: number;      // aggression multiplier
  aimErr: number;    // projectile aim error px
  defend: number;    // reaction defense probability
}

const DIFF: Record<AIDifficulty, DiffParams> = {
  easy:   { react: 26, interval: 22, noise: 22, mistake: 0.30, tech: 0.25, adapt: 0,    aggr: 0.8,  aimErr: 55, defend: 0.22 },
  normal: { react: 12, interval: 10, noise: 10, mistake: 0.12, tech: 0.68, adapt: 0.5,  aggr: 1.3,  aimErr: 24, defend: 0.55 },
  hard:   { react: 8,  interval: 6,  noise: 5,  mistake: 0.05, tech: 0.88, adapt: 0.8,  aggr: 1.65, aimErr: 12, defend: 0.8 },
  expert: { react: 4,  interval: 4,  noise: 1.5, mistake: 0.02, tech: 1,    adapt: 1,    aggr: 2.05, aimErr: 5,  defend: 0.95 },
};

// preferred engagement band [min, max] px per personality
const BAND: Record<AIPersonality, [number, number]> = {
  rusher: [30, 74], balanced: [52, 100], defender: [70, 120],
  grappler: [26, 58], trickster: [42, 92], zoner: [200, 360],
};

interface Snap {
  x: number; y: number; vx: number; vy: number;
  state: string; shielding: boolean; airborne: boolean;
  moveId: string | null; moveFrame: number; moveTotal: number;
  facing: 1 | -1; damage: number; hitId: number;
}

interface MoveInfo {
  id: string;
  slot: 'n' | 'f' | 'b' | 'u' | 'd';
  kind: string;          // ground | air | special | dashattack
  air: boolean;
  reachF: number;        // effective forward reach px (incl. victim radius)
  reachV: number;        // upward reach px
  reachD: number;        // downward reach px
  startup: number;
  active: number;
  total: number;
  dmg: number;
  angle: number;
  bkb: number;
  kbg: number;
  killAt: number;        // estimated victim % where this KOs from midstage
  projectile: boolean;
  projSpeed: number;
  chargeable: boolean;
  armor: boolean;
  counter: boolean;
  strong: boolean;
  chainTo?: string;
  mobilityRange: number; // how far the move itself travels (dash attacks etc.)
}

// ---------------- move knowledge ----------------

const moveDBCache: Partial<Record<FighterId, Record<string, MoveInfo>>> = {};

function buildMoveDB(id: FighterId): Record<string, MoveInfo> {
  const cached = moveDBCache[id];
  if (cached) return cached;
  const cfg = FIGHTER_CONFIGS[id];
  const s = cfg.stats.scale;
  const db: Record<string, MoveInfo> = {};
  for (const key of Object.keys(cfg.moves)) {
    const m = cfg.moves[key];
    if (m.kind === 'grab' || m.id === 'counterattack' || m.kind === 'throw') continue;
    let reachF = 0, reachV = 0, reachD = 0;
    if (m.hitboxes) {
      // signature weapon extends melee hitboxes (mirrors Fighter.getActiveHitboxes:
      // offset += reach*2.2, radius = r*1.3 + reach*2.0)
      const wr = cfg.weapon?.reach ?? 0;
      // thrust motions extend the hitbox outward over the active window — AI spaces for max reach
      const extMax = m.motion?.extend ? Math.max(m.motion.extend[0], m.motion.extend[1]) : 1;
      for (const hb of m.hitboxes) {
        reachF = Math.max(reachF, (Math.abs(hb.x) + wr * 2.2 + hb.r * 1.3 + wr * 2.0) * (hb.x >= 0 ? extMax : 1));
        if (hb.y < 0) reachV = Math.max(reachV, Math.abs(hb.y) + hb.r * 1.3 + wr * 3.2);
        else reachD = Math.max(reachD, Math.abs(hb.y) + hb.r * 1.3 + wr * 3.2);
      }
    }
    let projectile = false, projSpeed = 0;
    if (m.projectile) {
      projectile = true;
      projSpeed = m.projectile.speed;
      const range = m.projectile.kind === 'boomerang'
        ? m.projectile.speed * m.projectile.life * 0.4
        : m.projectile.speed * m.projectile.life;
      reachF = Math.max(reachF, Math.min(700, range));
    }
    let mobilityRange = 0;
    if (m.mobility) {
      for (const imp of m.mobility) if (imp.vx) mobilityRange += Math.abs(imp.vx) * 10;
    }
    // Estimated KO% for a 100-weight opponent from midstage.
    // Solved numerically against the SHARED knockback model rather than an
    // open-coded approximation, so the AI's kill reads stay correct whenever
    // the combat constants are retuned.
    const horiz = Math.abs(Math.cos(m.angle * Math.PI / 180)) >= 0.6;
    const koKB = horiz ? 24 : 27;
    let killAt = 400;
    for (let pct = 0; pct <= 400; pct += 5) {
      if (knockbackOf(pct + m.damage, m.damage, m.bkb, m.kbg, 100) >= koKB) { killAt = pct; break; }
    }
    // slot from move id
    let slot: MoveInfo['slot'] = 'n';
    if (key.startsWith('f') && key !== 'fair') slot = 'f';
    else if (key.startsWith('b')) slot = 'b';
    else if (key.startsWith('u')) slot = 'u';
    else if (key.startsWith('d')) slot = 'd';
    db[key] = {
      id: key, slot, kind: m.kind, air: m.kind === 'air',
      reachF: reachF * s + 17, reachV: reachV * s + 16, reachD: reachD * s + 16,
      startup: m.startup, active: moveActive(m), total: moveTotal(m),
      dmg: m.damage, angle: m.angle, bkb: m.bkb, kbg: m.kbg,
      killAt, projectile, projSpeed, chargeable: !!m.chargeable,
      armor: !!m.armor, counter: !!m.counter, strong: !!m.strong,
      chainTo: m.chainTo, mobilityRange,
    };
  }
  moveDBCache[id] = db;
  return db;
}

interface MainPlat { cx0: number; cx1: number; top: number; w: number; cx: number }

function mainPlatform(stage: import('../stages/Stage').Stage): MainPlat | null {
  let best: import('../stages/Stage').Platform | null = null;
  for (const p of stage.platforms) {
    if (p.type !== 'solid') continue;
    if (!best || p.w > best.w) best = p;
  }
  if (!best) return null;
  return { cx0: best.cx, cx1: best.cx + best.w, top: best.cy, w: best.w, cx: best.cx + best.w / 2 };
}

interface Candidate { score: number; plan: Plan }

interface HabitModel {
  jumpIns: number; shields: number; attacks: number; dodges: number;
  retreats: number; recoveryLeft: number; recoveryRight: number;
}

export class AIController {
  match: Match;
  idx: number;
  personality: AIPersonality;
  diff: DiffParams;
  private me: Fighter;
  private op: Fighter;
  private db: Record<string, MoveInfo>;

  private plan: Plan = { type: 'wait', dir: 0, dur: 1, elapsed: 0 };
  private decideTimer = 0;
  private held: Partial<Record<ActionName, boolean>> = {};
  private prevHeld: Partial<Record<ActionName, boolean>> = {};

  private opSnapshot: Snap[] = [];
  private habits: HabitModel = { jumpIns: 0, shields: 0, attacks: 0, dodges: 0, retreats: 0, recoveryLeft: 0, recoveryRight: 0 };
  private lastOpState = 'idle';
  private lastDefendedHit = -1;
  private lastDILaunch = -1;
  private diX = 0;
  private diY = 0;
  private mashTick = 0;
  private techPlanned = false;
  private techAt = 0;

  constructor(match: Match, idx: number, personality: AIPersonality, difficulty: AIDifficulty) {
    this.match = match;
    this.idx = idx;
    this.personality = personality;
    this.diff = DIFF[difficulty];
    this.me = match.fighters[idx];
    this.op = match.fighters[1 - idx] ?? match.fighters[0];
    this.db = buildMoveDB(this.me.id);
  }

  /** Called once per fixed step. Writes AI inputs into `outInput`. */
  update(outInput: InputState) {
    const m = this.match;
    if (m.phase !== 'fight') { this.clear(outInput); return; }
    this.me = m.fighters[this.idx];
    // target the nearest living foe (supports 3-4 player free-for-alls)
    let best = m.fighters[1 - this.idx] ?? m.fighters[0];
    let bestD = Infinity;
    for (const f of m.fighters) {
      if (f === this.me || f.state === 'ko' || f.stocks <= 0) continue;
      const d = Math.hypot(f.x - this.me.x, f.y - this.me.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    this.op = best;

    // delayed perception snapshot
    const op = this.op;
    this.opSnapshot.push({
      x: op.x, y: op.y, vx: op.vx, vy: op.vy,
      state: op.state, shielding: op.shielding, airborne: !op.grounded,
      moveId: op.move?.id ?? null, moveFrame: op.moveFrame,
      moveTotal: op.move ? moveTotal(op.move) : 0,
      facing: op.facing, damage: op.damage, hitId: op.moveHitId,
    });
    if (this.opSnapshot.length > 50) this.opSnapshot.shift();
    const seen = this.opSnapshot[Math.max(0, this.opSnapshot.length - 1 - this.diff.react)] ?? this.opSnapshot[0];

    this.observe();

    const main = mainPlatform(m.stage);

    // ---- forced states ----
    if (this.me.state === 'ko' || this.me.state === 'respawn') {
      this.write(outInput, {}); return;
    }
    if (this.me.state === 'grabbed' || this.me.state === 'dizzy') {
      // mash to escape
      this.mashTick++;
      const h: Partial<Record<ActionName, boolean>> = {};
      if (this.mashTick % 3 === 0) h.attack = true;
      if (this.mashTick % 3 === 1) h.jump = true;
      if (this.mashTick % 6 === 2) h[Math.random() < 0.5 ? 'left' : 'right'] = true;
      this.write(outInput, h); return;
    }
    if (this.me.state === 'hitstun' || this.me.state === 'launch') {
      // DI: pick once per launch, hold every frame of hitstun
      if (this.me.state === 'launch' && this.me.stateTimer < 2 && this.lastDILaunch !== this.match.tick) {
        this.chooseDI(main);
        this.lastDILaunch = this.match.tick;
      }
      const h: Partial<Record<ActionName, boolean>> = {};
      if (this.diX < 0) h.left = true; if (this.diX > 0) h.right = true;
      if (this.diY < 0) h.up = true; if (this.diY > 0) h.down = true;
      // TECH: press dodge right before ground impact (quality scales with difficulty)
      if ((this.me.state === 'launch' || this.me.state === 'hitstun') && this.me.vy > 2.5) {
        const frames = this.framesToGround();
        if (!this.techPlanned && frames >= 1 && frames <= 9 && chance(this.diff.tech * 0.85)) {
          this.techPlanned = true;
          this.techAt = this.match.tick + Math.max(0, frames - 4);
        }
        if (this.techPlanned && this.match.tick >= this.techAt && this.match.tick <= this.techAt + 2) {
          h.dodge = true;
          h.left = false; h.right = false; // keep the press clean
        }
      }
      this.write(outInput, h); return;
    }
    this.techPlanned = false;
    if (this.me.state === 'ledge') {
      // hanging: enjoy the safety, then get up — attack if the foe is close, else ledge jump
      const h: Partial<Record<ActionName, boolean>> = {};
      const held = 300 - this.me.ledgeTimer;   // frames hung so far
      const opNear = Math.hypot(this.op.x - this.me.x, this.op.y - this.me.y) < 130;
      if (held > 26 && (held % 30) < 2) {
        if (opNear && chance(0.5)) h.attack = true;       // getup attack catches enemies at the edge
        else h.jump = true;                               // ledge jump (safe + positional)
      }
      this.write(outInput, h); return;
    }
    if (this.me.state === 'attack' && this.plan.type === 'attack' && this.plan.elapsed < this.plan.dur) {
      // stay committed to the current attack (chain follow-ups handled in execute)
      this.execute(seen, main);
      this.write(outInput, this.held); return;
    }

    // ---- reaction overrides ----
    let overrode = false;
    const off = main ? this.isOffstage(this.me, main) : false;
    if (off) {
      this.plan = { type: 'recover', dir: 0, dur: 8, elapsed: 0 };
      overrode = true;
    } else {
      if (this.plan.type === 'recover') {
        // made it back: drop the recovery plan immediately
        this.plan = { type: 'wait', dir: 0, dur: 2, elapsed: 0 };
      }
      if (this.tryThreatReaction(seen, main)) {
        overrode = true;
      } else if (this.tryPunish(seen, main)) {
        overrode = true;
      }
    }

    // ---- plan lifecycle ----
    this.decideTimer--;
    const planDone = ++this.plan.elapsed >= this.plan.dur;
    if ((planDone && !overrode && this.plan.type !== 'recover') || (this.decideTimer <= 0 && !this.planCommitted())) {
      if (!off) this.decide(seen, main);
    }

    this.execute(seen, main);
    this.write(outInput, this.held);
  }

  private planCommitted(): boolean {
    // committed plans (charging, recovering, shielding) survive the decide timer
    return this.plan.type === 'recover' || this.plan.type === 'shield' ||
      (this.plan.type === 'special' && !!this.plan.holdSpecial && this.plan.elapsed < this.plan.dur);
  }

  /** frames until this fighter hits a platform below (99 = falling past everything) */
  private framesToGround(): number {
    const me = this.me;
    const feet = me.y + me.h / 2;
    let best: number | null = null;
    for (const p of this.match.stage.platforms) {
      if (p.broken > 0) continue;
      if (me.x > p.cx - 6 && me.x < p.cx + p.w + 6 && p.cy >= feet - 4) {
        if (best === null || p.cy < best) best = p.cy;
      }
    }
    if (best === null) return 99;
    return Math.max(0, Math.round((best - feet) / Math.max(0.6, me.vy)));
  }

  private clear(out: InputState) {
    for (const a of Object.keys(out.held) as ActionName[]) {
      out.held[a] = false; out.pressed[a] = false; out.released[a] = false;
    }
    out.axisX = 0; out.axisY = 0;
    this.held = {}; this.prevHeld = {};
  }

  private write(out: InputState, held: Partial<Record<ActionName, boolean>>) {
    this.held = held;
    for (const a of ['left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'grab', 'shield', 'dodge', 'dash'] as ActionName[]) {
      const h = !!held[a];
      const ph = !!this.prevHeld[a];
      out.held[a] = h;
      out.pressed[a] = h && !ph;
      out.released[a] = !h && ph;
    }
    out.axisX = (out.held.right ? 1 : 0) - (out.held.left ? 1 : 0);
    out.axisY = (out.held.down ? 1 : 0) - (out.held.up ? 1 : 0);
    this.prevHeld = { ...held };
  }

  // ---------------- observation & adaptation ----------------

  private observe() {
    const op = this.op;
    for (const k of Object.keys(this.habits) as (keyof HabitModel)[]) {
      this.habits[k] *= 0.9965;
    }
    const me = this.me;
    const dx = op.x - me.x;
    if (!op.grounded && op.state !== 'hitstun' && op.state !== 'launch') {
      const toward = Math.sign(dx) === Math.sign(op.vx) && Math.abs(op.vx) > 1.2;
      if (toward && Math.abs(dx) < 260) this.habits.jumpIns += 0.6;
    }
    if (op.shielding) this.habits.shields += 0.5;
    if (op.state === 'attack' && this.lastOpState !== 'attack') this.habits.attacks += 0.4;
    if (op.state === 'dodge') this.habits.dodges += 0.7;
    const movingAway = Math.sign(dx) === -Math.sign(op.vx) && Math.abs(op.vx) > 2;
    if (movingAway && Math.abs(dx) > 120) this.habits.retreats += 0.3;
    const main = mainPlatform(this.match.stage);
    if (main) {
      if (op.x < main.cx0 && !op.grounded && op.state !== 'ko') this.habits.recoveryLeft += 0.5;
      if (op.x > main.cx1 && !op.grounded && op.state !== 'ko') this.habits.recoveryRight += 0.5;
    }
    this.lastOpState = op.state;
  }

  private w(name: 'approach' | 'attack' | 'defend' | 'retreat' | 'grab' | 'zone' | 'dodge' | 'trick'): number {
    const P = this.personality;
    const table: Record<AIPersonality, Record<string, number>> = {
      rusher:    { approach: 1.9, attack: 1.6, defend: 0.5,  retreat: 0.15, grab: 0.9, zone: 0.2,  dodge: 0.6, trick: 0.5 },
      defender:  { approach: 0.65, attack: 1.1, defend: 2.2, retreat: 0.9, grab: 1.4, zone: 0.6, dodge: 1.3, trick: 0.7 },
      zoner:     { approach: 0.5, attack: 0.75, defend: 1.2, retreat: 1.5, grab: 0.5, zone: 3.2, dodge: 1.1, trick: 0.8 },
      trickster: { approach: 1.0, attack: 0.95, defend: 1.0, retreat: 0.8, grab: 0.8, zone: 0.7, dodge: 2.4, trick: 2.6 },
      grappler:  { approach: 1.5, attack: 1.0, defend: 0.9, retreat: 0.4, grab: 2.8, zone: 0.1, dodge: 1.0, trick: 0.8 },
      balanced:  { approach: 1.0, attack: 1.1, defend: 1.1, retreat: 0.8, grab: 1.0, zone: 0.9, dodge: 1.1, trick: 1.0 },
    };
    return table[P][name] ?? 1;
  }

  private chooseDI(main: MainPlat | null) {
    const me = this.me;
    const q = this.diff.tech;
    const cx = main ? main.cx : 0;
    const toward = Math.sign(cx - me.x) || 1;
    const horiz = Math.abs(me.vx) > Math.abs(me.vy);
    if (!main || Math.random() > q * 0.9) {
      this.diX = toward; this.diY = 0; // at least drift to stage
      return;
    }
    if (horiz) {
      // strong horizontal launch: hold up (survive the side blast) + drift toward stage
      this.diY = chance(q * 0.85) ? -1 : (chance(0.4) ? 1 : 0);
      this.diX = toward;
    } else {
      // vertical launch: flatten trajectory toward the stage
      this.diX = chance(q * 0.85) ? toward : 0;
      this.diY = 0;
    }
  }

  // ---------------- decision making ----------------

  private decide(seen: Snap, main: MainPlat | null) {
    const me = this.me, op = this.op;
    if (!main) { this.plan = { type: 'wait', dir: 0, dur: 10, elapsed: 0 }; return; }

    // opponent gone: hold center
    if (op.state === 'ko' || op.state === 'respawn') {
      const cx = main.cx;
      this.plan = Math.abs(me.x - cx) > 60
        ? { type: 'move', dir: Math.sign(cx - me.x) || 1, dur: 40, elapsed: 0, targetX: cx }
        : { type: 'wait', dir: 0, dur: 14, elapsed: 0 };
      this.decideTimer = 14;
      return;
    }

    // mistake roll (believable errors, never suicidal)
    if (chance(this.diff.mistake * 0.4)) {
      this.plan = this.makeMistake(seen, main);
      this.decideTimer = this.diff.interval;
      return;
    }

    const dx = seen.x - me.x, dy = seen.y - me.y;
    const dist = Math.hypot(dx, dy);
    const dirTo = Math.sign(dx) || 1;
    const band = BAND[this.personality];
    const canAct = !['attack', 'dodge', 'shield', 'grabbing', 'land'].includes(me.state) || me.state === 'air';
    const opVulnerable = (seen.state === 'attack' && seen.moveTotal > 0 && seen.moveFrame > seen.moveTotal * 0.55)
      || seen.state === 'land' || seen.state === 'dizzy';
    const opInMyCombo = op.comboable && op.lastHitBy === me;
    const opNearEdge = Math.min(Math.abs(seen.x - main.cx0), Math.abs(main.cx1 - seen.x)) < 130;
    // HARD SAFETY: an opponent offstage is edge-guarded from the stage — never chased into the void
    const opOff = this.isOffstage(op, main);
    const candidates: Candidate[] = [];
    const cands = (score: number, plan: Plan) => candidates.push({ score, plan });

    // ============ melee attack candidates ============
    if (canAct) {
      for (const info of Object.values(this.db)) {
        if (info.projectile) continue;                    // handled by zoning below
        if (info.counter) continue;                       // defensive only
        if (info.air !== !me.grounded) continue;          // right move class for my position
        if (info.kind === 'special' && (info.slot === 'u') && me.grounded && !this.isOffstage(me, main)) continue; // save up-special
        const reach = info.slot === 'u' ? info.reachV : info.reachF;
        let fit = false;
        if (info.slot === 'u') fit = dist < reach + 20 && dy < -14 && Math.abs(dx) < reach * 0.9;
        else if (info.slot === 'd' && me.grounded) fit = dist < reach + 14 && Math.abs(dx) < reach;
        else if (info.slot === 'd') fit = dist < reach + 20 && dy > 18 && Math.abs(dx) < reach * 0.9;
        else fit = dist < reach + 14 && Math.abs(dy) < 64;
        if (!fit) continue;
        if (opOff && Math.abs(dy) > 46) continue;      // no swinging at far-offstage foes
        // dash attacks have momentum: never into the void, never at an offstage foe
        if (info.kind === 'dashattack' && (opOff || !this.roomAhead(dirTo, info.mobilityRange + 90, main))) continue;
        if (me.state === 'attack' && !(me.move?.chainTo)) continue; // already swinging

        let score = 20 + info.dmg * 1.35 + (info.strong ? 6 : 0);
        // combo logic: keep juggling with low-kb links, finish when it kills
        if (opInMyCombo) {
          const kills = op.damage >= info.killAt - 12;
          if (kills) score += 66 + (opNearEdge ? 20 : 0);
          else if (info.kbg < 32 && info.startup <= 7) score += 36;   // true-combo links
          else score -= 20;                                            // launching ends the string
        } else if (op.damage >= info.killAt - 20) {
          score += 42 + (opNearEdge ? 22 : 0);                         // kill move available
        }
        // whiff punish: prefer fast startups
        if (opVulnerable) score += (26 - info.startup) * 1.6;
        // anti-air
        if (seen.airborne && dy < -26 && (info.slot === 'u' || info.air)) score += 20;
        // armor through aggression
        if (info.armor && this.habits.attacks > 3 && dist > 70) score += 14 * this.diff.adapt;
        // don't use kill-strong moves at 0% (wasted knockback ends chances of a string)
        if (op.damage < 25 && info.kbg > 60 && !opVulnerable) score -= 14;
        score *= this.w('attack') * this.diff.aggr;
        score += this.diff.noise > 0 ? rand(-this.diff.noise, this.diff.noise) * 1.5 : 0;
        cands(score, this.planForMove(info, dirTo, seen));
      }

      // ============ grab ============
      if (me.grounded && me.state !== 'attack') {
        const grabReach = 46 * me.scale + 18;
        if (dist < grabReach + 8 && Math.abs(dy) < 40) {
          let score = 14;
          score += this.habits.shields * 4.5 * this.diff.adapt;              // grab shield-happy opponents
          if (seen.shielding || op.shielding) score += 40;
          if (opNearEdge && op.damage > 82) score += 38;                     // kill throw at the edge
          if (this.habits.dodges > 2.5) score += 8 * this.diff.adapt;        // catch dodge-happy players
          score *= this.w('grab');
          const throwTowardEdge = opNearEdge && op.damage > 82 ? (Math.abs(seen.x - main.cx0) < Math.abs(main.cx1 - seen.x) ? -1 : 1) : dirTo;
          cands(score, { type: 'grab', dir: throwTowardEdge, dur: 34, elapsed: 0 });
        }
      }

      // ============ specials playbook (per character) ============
      // Wrap the playbook so every special candidate is scaled by whether the
      // fighter's signature resource can actually pay for it.
      const kitCands = (score: number, plan: Plan) => {
        const mul = plan.type === 'special' ? this.kitReadiness((plan.kind as 'n' | 's' | 'u' | 'd') ?? 'n') : 1;
        cands(score * mul, plan);
      };
      this.specialCandidates(seen, main, kitCands, dist, dy, dirTo);

      // ============ kit-driven shield holding (Jaeger reload) ============
      if (me.grounded && this.wantsToHoldShield() && dist > 120 && me.shieldHp > me.shieldMax * 0.55) {
        cands(34, { type: 'shield', dir: 0, dur: 46, elapsed: 0 });
      }

      // ============ zoning / projectiles ============
      if (canAct) {
        for (const info of Object.values(this.db)) {
          if (!info.projectile || me.state === 'attack') continue;
          if (me.specialCooldown > 0 && !this.match.mods.infiniteSpecials) continue;
          const lo = info.chargeable ? 130 : 150;
          if (dist < lo || dist > info.reachF * 0.9 || Math.abs(dy) > 62) continue;
          let score = 15 + (dist > 230 ? 10 : 0) - (1 - dist / info.reachF) * 6;
          score *= this.w('zone');
          // lead the shot
          const flight = dist / Math.max(2, info.projSpeed);
          const aimErr = rand(-this.diff.aimErr, this.diff.aimErr);
          const targetX = seen.x + clamp(seen.vx * flight, -110, 110) * (0.35 + this.diff.tech * 0.65) + aimErr;
          const charge = info.chargeable && dist > 270 && chance(0.35 + this.diff.tech * 0.3)
            ? clamp(Math.round(dist / 8), 12, me.id === 'vanguard' ? 34 : 26)
            : undefined;
          cands(score, { type: 'special', dir: Math.sign(targetX - me.x) || dirTo, dur: 26 + (charge ?? 0), elapsed: 0, kind: info.slot === 'f' ? 's' : 'n', targetX, holdSpecial: charge });
        }
        // Titan ground waves = his long-range game
        if (me.id === 'titan' && me.grounded && me.state !== 'attack' && me.specialCooldown === 0) {
          if (dist > 95 && dist < 270 && Math.abs(dy) < 42) {
            const slamScore = 20 + (op.shielding ? 18 : 0) + (dist > 150 ? 8 : 0);
            cands(slamScore * this.w('zone'), { type: 'special', dir: dirTo, dur: 34, elapsed: 0, kind: 'd', targetX: seen.x });
          }
          if (dist > 75 && dist < 190 && Math.abs(dy) < 40 && this.roomAhead(dirTo, 170, main)) {
            cands(13 * this.w('zone'), { type: 'attack', dir: dirTo, dur: 24, elapsed: 0, kind: 'dattack' });
          }
        }
        // Hook's snare controls space
        if (me.id === 'hook' && me.grounded && me.state !== 'attack' && me.specialCooldown === 0 && dist > 110 && dist < 300 && Math.abs(dy) < 46) {
          cands((11 + (this.habits.retreats > 2 ? 8 : 0)) * this.w('zone'), { type: 'special', dir: dirTo, dur: 24, elapsed: 0, kind: 'd' });
        }
      }

      // ============ edge guard ============
      if (opOff && me.grounded && me.state !== 'attack') {
        const egWeight = this.w('attack') * (0.4 + this.diff.tech) * this.diff.aggr;
        cands(32 * egWeight, { type: 'edgeguard', dir: dirTo, dur: 46, elapsed: 0 });
      }

      // ============ spacing / approach ============
      if (me.grounded || !me.grounded) {
        let targetX = seen.x - dirTo * rand(band[0], band[1]);
        // never plan a move toward a point hanging off the stage
        if (opOff || seen.x < main.cx0 || seen.x > main.cx1) {
          targetX = clamp(seen.x, main.cx0 + 40, main.cx1 - 40) - dirTo * rand(band[0], band[1]);
        }
        let moveScore = 8;
        if (dist > band[1]) moveScore += 9 * this.w('approach');
        if (dist < band[0]) {
          moveScore += 7 * this.w('retreat');
          targetX = me.x - dirTo * 70;
        }
        // retreat when hurt and opponent is a kill threat
        if (me.damage > 115 && dist < 150 && opVulnerable) moveScore += 8 * this.w('retreat');
        // RELentless pursuit: while the foe is stuck in my combo, run them down
        if (opInMyCombo && dist > 80) moveScore += 16 * this.diff.aggr;
        // dash when there's ground to cover
        const dash = me.grounded && Math.abs(targetX - me.x) > 110 && chance(0.45 + this.diff.tech * 0.55);
        // aerial approach mixup vs projectile-spammers & tricksters (never toward an offstage foe)
        const hopIn = me.grounded && !opOff && dist > 120 && dist < 300 && Math.abs(dy) < 40 &&
          chance((this.habits.retreats * 0.05 + (this.w('trick') - 1) * 0.12) * (0.4 + this.diff.tech));
        if (hopIn) {
          cands(moveScore * this.w('approach'), { type: 'jump', dir: dirTo, dur: 26, elapsed: 0, targetX });
        } else {
          cands(moveScore, { type: 'move', dir: Math.sign(targetX - me.x) || dirTo, dur: rand(16, 34) | 0, elapsed: 0, targetX, dash });
        }
        // dash-dance bait (trickster signature)
        if (me.grounded && dist < 150 && dist > 60 && chance((this.w('trick') - 0.8) * 0.16)) {
          cands(11 * this.w('trick'), { type: 'move', dir: -dirTo, dur: rand(8, 16) | 0, elapsed: 0, dash: chance(this.diff.tech * 0.6) });
        }
        // ---- vertical pursuit: never get camped out (ONLY when the target is over the stage) ----
        if (me.grounded && !opOff && dy < -55 && Math.abs(dx) < 190) {
          const jumpScore = 15 * this.w('approach') * this.diff.aggr + (this.personality === 'rusher' ? 10 : 0) + Math.min(14, (-dy - 55) * 0.12);
          cands(jumpScore, { type: 'jump', dir: Math.sign(dx) || 0, dur: 32, elapsed: 0, targetX: clamp(seen.x, main.cx0 + 40, main.cx1 - 40) });
        }
        if (me.grounded && !opOff && dy > 55 && Math.abs(dx) < 150) {
          const onPass = !!me.standingOn && me.standingOn.type !== 'solid';
          cands(14 * this.w('approach'), { type: 'jump', dir: Math.sign(dx) || 0, dur: 26, elapsed: 0, targetX: clamp(seen.x, main.cx0 + 40, main.cx1 - 40), drop: onPass });
        }
        // opponent far above or below while I'm airborne: drift toward their height band
        if (!me.grounded && (dy < -60 || dy > 60) && Math.abs(dx) < 120) {
          cands(12, { type: 'move', dir: Math.sign(dx) || dirTo, dur: rand(14, 24) | 0, elapsed: 0, targetX: seen.x });
        }
      }
    }

    // ---- pick the best candidate ----
    let best: Candidate | null = null;
    for (const c of candidates) {
      if (!best || c.score > best.score) best = c;
    }
    if (best && best.score > -8) {
      this.plan = best.plan;
    } else {
      this.plan = { type: 'move', dir: chance(0.5) ? dirTo : -dirTo, dur: rand(12, 26) | 0, elapsed: 0 };
    }
    this.decideTimer = this.diff.interval;
  }

  /** Per-character special usage beyond plain projectiles. */
  private specialCandidates(seen: Snap, main: MainPlat | null, cands: (s: number, p: Plan) => void, dist: number, dy: number, dirTo: number) {
    const me = this.me;
    const cd = me.specialCooldown > 0 && !this.match.mods.infiniteSpecials;
    if (cd || me.state === 'attack') return;
    const approachW = this.w('approach');
    const meOff = main ? this.isOffstage(me, main) : false;
    if (meOff) return; // recovery handles itself
    // mobility specials lunge forward — only when the lunge can't carry us off the stage
    const gapOK = this.roomAhead(dirTo, 190, main);

    switch (me.id) {
      case 'vanguard': {
        // dash slash: gap close then punish
        if (gapOK && dist > 95 && dist < 200 && Math.abs(dy) < 50 && me.grounded) {
          cands(19 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 's' });
        }
        // counter: read the attack (defensive tech)
        if (seen.state === 'attack' && dist < 130 && chance(this.diff.tech * 0.35 * this.w('defend'))) {
          cands(30, { type: 'special', dir: 0, dur: 34, elapsed: 0, kind: 'd' });
        }
        // rising blade as anti-air when opponent is above and close
        if (!me.grounded && dy < -40 && dist < 90) {
          cands(22, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'ember': {
        // flame dash: aggressive close-out
        if (gapOK && dist > 85 && dist < 180 && Math.abs(dy) < 46 && me.grounded) {
          cands(20 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 's' });
        }
        // flare burst: anti-air / point-blank nuke (gated to its true reach)
        const flareReach = (this.db['dspecial']?.reachF ?? 46) + 14;
        if (dist < flareReach && (dy < -20 || chance(0.5))) {
          cands(21 + (dy < -20 ? 10 : 0), { type: 'special', dir: dirTo, dur: 32, elapsed: 0, kind: 'd' });
        }
        // teleport mixup when cornered or opponent above
        const cornered = main ? (Math.abs(me.x - main.cx0) < 70 || Math.abs(me.x - main.cx1) < 70) : false;
        if (me.grounded && cornered && dist < 130 && chance(0.3 * this.w('trick'))) {
          cands(20, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'hook': {
        // grapple: yank shielded / distant opponents in, then punish
        if (dist > 70 && dist < 250 && Math.abs(dy) < 60 && (seen.shielding || chance(0.5))) {
          const score = 17 + (seen.shielding ? 22 : 0) + this.habits.shields * 3 * this.diff.adapt;
          cands(score * this.w('grab') * 0.7, { type: 'special', dir: dirTo, dur: 36, elapsed: 0, kind: 's', targetX: seen.x });
        }
        break;
      }
      case 'titan': {
        // armored tackle through attacks
        if (gapOK && dist > 80 && dist < 230 && Math.abs(dy) < 44 && me.grounded) {
          let score = 19 * approachW * this.diff.aggr;
          if (seen.state === 'attack') score += 20; // armor trades in our favor
          cands(score, { type: 'special', dir: dirTo, dur: 34, elapsed: 0, kind: 's' });
        }
        // charge punch at midrange
        if (dist > 60 && dist < 150 && Math.abs(dy) < 44 && me.grounded && chance(0.6)) {
          const charge = dist > 105 ? clamp(Math.round((dist - 60) / 4), 8, 40) : undefined;
          cands(23, { type: 'special', dir: dirTo, dur: 28 + (charge ?? 0), elapsed: 0, kind: 'n', holdSpecial: charge });
        }
        // uppercut anti-air
        if (dy < -40 && dist < 100) {
          cands(24, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'nova': {
        // comet ride: star-trail gap closer
        if (gapOK && dist > 90 && dist < 210 && Math.abs(dy) < 50 && me.grounded) {
          cands(18 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 's' });
        }
        // stellar rise anti-air
        if (!me.grounded && dy < -40 && dist < 95) {
          cands(21, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        // gravity well to drag campers / shielders out of position
        if (dist > 140 && dist < 330 && Math.abs(dy) < 70 && (seen.shielding || chance(0.4))) {
          cands(16 + (seen.shielding ? 14 : 0), { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 'd' });
        }
        break;
      }
      case 'volt': {
        // lightning dash: blinding close-out; also armor-beats nothing but is fast
        if (gapOK && dist > 70 && dist < 200 && Math.abs(dy) < 46 && me.grounded) {
          cands(22 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 's' });
        }
        // static field when foes crowd us or shield
        const fieldReach = (this.db['dspecial']?.reachF ?? 34) + 26;
        const cornered = main ? (Math.abs(me.x - main.cx0) < 80 || Math.abs(me.x - main.cx1) < 80) : false;
        if (dist < fieldReach && (seen.shielding || cornered || chance(0.35))) {
          cands(19 + (seen.shielding ? 12 : 0), { type: 'special', dir: 0, dur: 32, elapsed: 0, kind: 'd' });
        }
        // thunder clap anti-air
        if (dy < -36 && dist < 90) {
          cands(23, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'frost': {
        // glacier slide: armored approach
        if (gapOK && dist > 85 && dist < 210 && Math.abs(dy) < 46 && me.grounded) {
          let score = 18 * approachW * this.diff.aggr;
          if (seen.state === 'attack') score += 16;
          cands(score, { type: 'special', dir: dirTo, dur: 32, elapsed: 0, kind: 's' });
        }
        // frost nova when crowded or at point-blank
        const novaReach = (this.db['dspecial']?.reachF ?? 38) + 20;
        if (dist < novaReach && (dy < -20 || chance(0.4))) {
          cands(20 + (dy < -20 ? 8 : 0), { type: 'special', dir: 0, dur: 32, elapsed: 0, kind: 'd' });
        }
        // icicle ascension anti-air
        if (dy < -38 && dist < 100) {
          cands(21, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'wraith': {
        // phase strike: blink through the foe's guard
        if (gapOK && dist > 60 && dist < 180 && Math.abs(dy) < 46 && me.grounded) {
          let score = 20 * approachW * this.diff.aggr;
          if (seen.shielding) score += 16;
          cands(score, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 's' });
        }
        // abyss spikes: claim the ground the foe walks toward
        if (dist > 110 && dist < 300 && Math.abs(dy) < 46 && me.grounded && chance(0.5)) {
          cands(15 + (this.habits.retreats > 2 ? 7 : 0), { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'd' });
        }
        // shadow ascent anti-air + escape
        if (dy < -40 && dist < 85) {
          cands(22, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'seraph': {
        // grand thrust: lance skewers from just outside their reach
        const thrustReach = (this.db['fattack']?.reachF ?? 40) + 14;
        if (dist > thrustReach * 0.55 && dist < thrustReach + 30 && Math.abs(dy) < 40 && me.grounded) {
          cands(20 * approachW * this.diff.aggr, { type: 'attack', dir: dirTo, dur: 34, elapsed: 0, kind: 'fattack' });
        }
        // sacred charge: armored lane-close
        if (gapOK && dist > 110 && dist < 260 && Math.abs(dy) < 46 && me.grounded) {
          let score = 18 * approachW * this.diff.aggr;
          if (seen.state === 'attack') score += 14;
          cands(score, { type: 'special', dir: dirTo, dur: 32, elapsed: 0, kind: 's' });
        }
        // sunspot ward: deny the space campers love
        if (dist > 120 && dist < 300 && Math.abs(dy) < 60 && me.grounded && chance(0.4)) {
          cands(14 + (seen.shielding ? 10 : 0), { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'd' });
        }
        // winged ascension anti-air
        if (dy < -40 && dist < 100) {
          cands(21, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'viper': {
        // serpent dash: low, fast, venomous gap-close
        if (gapOK && dist > 70 && dist < 200 && Math.abs(dy) < 46 && me.grounded) {
          cands(23 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 's' });
        }
        // venom dart chip when they turtle or retreat
        if ((seen.shielding || this.habits.retreats > 2) && dist > 130 && dist < 360 && me.grounded) {
          cands(17, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'n' });
        }
        // toxic snare to cut off landings
        if (dist > 100 && dist < 280 && Math.abs(dy) < 46 && me.grounded && chance(0.45)) {
          cands(15, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'd' });
        }
        // coil spring anti-air
        if (dy < -38 && dist < 80) {
          cands(22, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'u' });
        }
        break;
      }
      case 'tempest': {
        // cyclone rush: spin-through approach
        if (gapOK && dist > 70 && dist < 190 && Math.abs(dy) < 46 && me.grounded) {
          cands(22 * approachW * this.diff.aggr, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 's' });
        }
        // gale burst: shove shielded foes and edge-campers — a real gimping tool
        const opNearEdge = main ? (seen.x < main.cx0 + 60 || seen.x > main.cx1 - 60) : false;
        if (me.grounded && dist > 110 && dist < 320 && Math.abs(dy) < 50 && (seen.shielding || opNearEdge || this.habits.shields > 2)) {
          const score = 15 + (seen.shielding ? 14 : 0) + (opNearEdge ? 12 : 0) + this.habits.shields * 2 * this.diff.adapt;
          cands(score, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'n' });
        }
        // zephyr dive: meteor chasing landings / offstage foes
        if (!me.grounded && dist < 120 && dy > 30) {
          cands(21, { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 'd' });
        }
        break;
      }
      case 'jaeger': {
        // power bolt: long-range poke & kill attempt
        if (me.grounded && dist > 150 && dist < 480 && Math.abs(dy) < 60 && (seen.shielding || chance(0.45))) {
          cands(16 + (seen.shielding ? 10 : 0), { type: 'special', dir: dirTo, dur: 30, elapsed: 0, kind: 'n' });
        }
        // scatter volley: devastating point-blank blast
        const scatterReach = (this.db['sspecial']?.reachF ?? 130) + 10;
        if (me.grounded && dist < scatterReach && Math.abs(dy) < 40) {
          cands(24, { type: 'special', dir: dirTo, dur: 28, elapsed: 0, kind: 's' });
        }
        // snare trap: cut off approaches and landings
        if (me.grounded && dist > 90 && dist < 240 && Math.abs(dy) < 46 && chance(0.4)) {
          cands(14, { type: 'special', dir: dirTo, dur: 26, elapsed: 0, kind: 'd' });
        }
        break;
      }
    }
  }

  private planForMove(info: MoveInfo, dirTo: number, seen: Snap): Plan {
    const kind = info.id;
    if (info.air) {
      return { type: 'attack', dir: dirTo, dur: info.total + 8, elapsed: 0, kind };
    }
    if (info.kind === 'dashattack') {
      return { type: 'attack', dir: dirTo, dur: info.total + 10, elapsed: 0, kind: 'dashattack', targetX: seen.x };
    }
    return { type: 'attack', dir: dirTo, dur: info.total + 8, elapsed: 0, kind };
  }

  private makeMistake(seen: Snap, main: MainPlat | null): Plan {
    const dirTo = Math.sign(seen.x - this.me.x) || 1;
    // even mistakes keep the bot inside the stage — bad plays, never suicides
    const safeX = main ? clamp(seen.x, main.cx0 + 60, main.cx1 - 60) : seen.x;
    const opts: Plan[] = [
      { type: 'attack', dir: dirTo, dur: 20, elapsed: 0, kind: 'jab' },           // whiffed jab
      { type: 'dodge', dir: chance(0.5) ? dirTo : -dirTo, dur: 24, elapsed: 0 },  // unnecessary dodge
      { type: 'move', dir: -dirTo, dur: rand(12, 26) | 0, elapsed: 0, targetX: safeX }, // bad retreat
      { type: 'shield', dir: 0, dur: rand(20, 34) | 0, elapsed: 0 },              // panic shield
      { type: 'jump', dir: dirTo, dur: 22, elapsed: 0, targetX: safeX },          // careless jump
    ];
    return pick(opts);
  }

  // ---------------- reactions ----------------

  /**
   * Does this fighter's signature resource make a special worth throwing right
   * now? Nova and Jaeger fizzle when dry; Vanguard/Seraph/Volt/Wraith want to
   * cash a full bar. Without this the AI spent kits it did not have.
   */
  private kitReadiness(slot: 'n' | 's' | 'u' | 'd'): number {
    const t = this.me.trait;
    switch (this.me.traitSpec.id) {
      case 'starfall': return t.charges > 0 ? 1.15 : 0.25;          // out of stars = fizzle
      case 'ammo': return t.charges > 0 ? 1.15 : 0.3;               // dry click
      case 'aegis': return t.meter >= 1 ? 1.9 : 1;                  // cash the empowered special
      case 'radiance': return t.meter >= 1 && !t.active ? 2.4 : 1;  // ASCEND as soon as it is up
      case 'siphon': return slot === 'd' && t.meter >= 0.5 ? 1.7 : 1;
      case 'overheat': return t.active ? 1.25 : 1;
      case 'static': return t.meter >= 1 ? 1.3 : 1;
      case 'gale': return t.charges > 0 ? 1.1 : 0.9;
      default: return 1;
    }
  }

  /** True when the kit wants us to sit in shield (Jaeger reloads by blocking). */
  private wantsToHoldShield(): boolean {
    return this.me.traitSpec.id === 'ammo' && this.me.trait.charges <= 1;
  }

  /** React to an incoming attack with shield / dodge / counter — once per attack instance. */
  private tryThreatReaction(seen: Snap, main: MainPlat | null): boolean {
    const me = this.me;
    if (me.state === 'attack' || me.state === 'dodge' || me.state === 'hitstun') return false;
    if (seen.state !== 'attack' || !seen.moveId) return false;
    if (seen.hitId === this.lastDefendedHit) return false;
    const info = this.db[seen.moveId];
    if (!info) return false;
    const dist = Math.hypot(seen.x - me.x, seen.y - me.y);
    const threat = info.projectile ? false : dist < info.reachF + 40 && Math.abs(seen.y - me.y) < 84;
    if (!threat) return false;
    const framesUntilHit = Math.max(1, info.startup - seen.moveFrame);
    if (framesUntilHit > this.diff.react + 8) return false; // too early to react meaningfully
    this.lastDefendedHit = seen.hitId;

    const grabThreat = seen.moveId === 'grab';
    if (!chance(this.diff.defend * clamp(this.w('defend'), 0.35, 1.7))) return false;

    const opts: Plan[] = [];
    if (!grabThreat) {
      // Shield is now a real option: it has finite HP, but blocking buys an
      // out-of-shield punish and a parry on a tight read. Skilled AI raises it
      // late (into the parry window) and drops it quickly.
      const tight = chance(this.diff.tech * 0.55) && framesUntilHit <= 6;
      opts.push({ type: 'shield', dir: 0, dur: tight ? rand(8, 14) | 0 : rand(16, 30) | 0, elapsed: 0 });
      if (tight) opts.push({ type: 'shield', dir: 0, dur: rand(8, 12) | 0, elapsed: 0 }); // weight the parry attempt
    }
    opts.push({ type: 'dodge', dir: 0, dur: 24, elapsed: 0 });                    // spot dodge
    opts.push({ type: 'dodge', dir: -Math.sign(seen.x - me.x) || 1, dur: 26, elapsed: 0 }); // roll away
    if (me.grounded) opts.push({ type: 'jump', dir: -Math.sign(seen.x - me.x) || 1, dur: 18, elapsed: 0 });
    // character tech answers
    if (me.id === 'vanguard' && me.specialCooldown === 0 && !grabThreat && chance(this.diff.tech * 0.5)) {
      opts.push({ type: 'special', dir: 0, dur: 36, elapsed: 0, kind: 'd' });     // Aegis Counter
    }
    if (me.id === 'titan' && me.specialCooldown === 0 && dist > 80 && chance(this.diff.tech * 0.4)) {
      opts.push({ type: 'special', dir: Math.sign(seen.x - me.x) || 1, dur: 34, elapsed: 0, kind: 's' }); // armor through
    }
    this.plan = pick(opts);
    this.decideTimer = this.diff.interval;
    return true;
  }

  /** Whiff / landing punishment: attack into the opponent's vulnerable frames. */
  private tryPunish(seen: Snap, main: MainPlat | null): boolean {
    void main;
    const me = this.me;
    if (me.state === 'attack' || me.state === 'dodge' || me.state === 'hitstun' || me.state === 'shield') return false;
    let window = 0;
    if (seen.state === 'attack' && seen.moveId && seen.moveTotal > 0) {
      const info = this.db[seen.moveId];
      if (info && seen.moveFrame > info.startup + info.active) window = seen.moveTotal - seen.moveFrame;
    } else if (seen.state === 'land') {
      window = 8;
    } else if (seen.state === 'dizzy') {
      window = 90;
    }
    if (window <= 0) return false;
    const dist = Math.hypot(seen.x - me.x, seen.y - me.y);
    const dy = seen.y - me.y;
    // pick the strongest move that connects in time
    let bestInfo: MoveInfo | null = null;
    let bestScore = -1;
    for (const info of Object.values(this.db)) {
      if (info.projectile || info.counter) continue;
      if (info.air !== !me.grounded) continue;
      const reach = info.slot === 'u' ? info.reachV : info.reachF;
      const travel = Math.max(0, dist - reach) / Math.max(6, me.stats.dashSpeed);
      const startLag = dist > reach ? travel + info.startup : info.startup;
      if (startLag > window + 2) continue;
      if (info.slot === 'u' && dy > -14) continue;
      if (info.slot !== 'u' && Math.abs(dy) > 58) continue;
      const score = info.dmg + (26 - info.startup) * 0.4 + (opHurt(seen) ? info.kbg * 0.2 : 0);
      if (score > bestScore) { bestScore = score; bestInfo = info; }
    }
    if (!bestInfo) return false;
    if (!chance(0.5 + this.diff.tech * 0.45)) return false;
    this.plan = this.planForMove(bestInfo, Math.sign(seen.x - me.x) || 1, seen);
    this.decideTimer = this.diff.interval;
    return true;
  }

  // ---------------- execution ----------------

  private execute(seen: Snap, main: MainPlat | null) {
    const me = this.me, op = this.op;
    const p = this.plan;
    const h: Partial<Record<ActionName, boolean>> = {};
    const safe = (dir: number) => this.safeDir(dir, main);

    switch (p.type) {
      case 'move': {
        let tx = p.targetX ?? me.x + p.dir * 130;
        // HARD LEDGE SAFETY: pursuit targets never leave the stage footprint (grounded OR air)
        if (main) tx = clamp(tx, main.cx0 + 26, main.cx1 - 26);
        const d = tx - me.x;
        if (Math.abs(d) > 10) {
          const dir = safe(Math.sign(d));
          if (dir < 0) h.left = true; if (dir > 0) h.right = true;
          // only fire a dash burst whose momentum stops safely inside the stage
          if (p.dash && p.elapsed === 1 && me.dashCooldown === 0 && this.dashSafe(dir, main)) h.dash = true;
        } else {
          p.dur = Math.min(p.dur, p.elapsed + 1);
        }
        this.flybyStrike(seen, main, h);
        break;
      }
      case 'wait': break;
      case 'jump': {
        const dir = safe(p.dir);
        if (dir < 0) h.left = true; if (dir > 0) h.right = true;
        if (p.targetX !== undefined) {
          let tx = p.targetX;
          if (main) tx = clamp(tx, main.cx0 + 26, main.cx1 - 26);
          const d = tx - me.x;
          if (Math.abs(d) > 16) { const dd = safe(Math.sign(d)); if (dd < 0) h.left = true; if (dd > 0) h.right = true; }
        }
        // never jump if the arc would carry us off the stage (mistake plans included)
        let jumpSafe = true;
        if (main) {
          // prediction = current momentum + active drift toward the target
          const dirJ = (dir || p.dir || 1);
          const pred = me.x + clamp(me.vx, -7, 7) * 40 + dirJ * 85;
          jumpSafe = pred > main.cx0 + 14 && pred < main.cx1 - 14;
        }
        if (p.drop) {
          if (p.elapsed === 1 && jumpSafe) h.down = true; // drop through, then drift down at them
        } else if ((p.elapsed === 1 || p.elapsed === 14) && jumpSafe) h.jump = true;
        this.flybyStrike(seen, main, h);
        break;
      }
      case 'attack': {
        const k = p.kind ?? 'jab';
        const info = this.db[k];
        // face the target early
        if (p.elapsed <= 2 && !info?.air) {
          const dir = safe(p.dir);
          if (dir < 0) h.left = true; if (dir > 0) h.right = true;
        }
        if (k === 'uattack' || k === 'uair' || k === 'uspecial') h.up = true;
        if (k === 'dattack' || k === 'dair' || k === 'dspecial') h.down = true;
        if (k === 'fair') h[me.facing > 0 ? 'right' : 'left'] = true;
        if (k === 'bair') h[me.facing > 0 ? 'left' : 'right'] = true;
        if (k === 'dashattack') {
          if (p.elapsed === 1 && me.dashCooldown === 0 && this.dashSafe(p.dir, main)) h.dash = true;
          if (p.elapsed === 4 && !p.fired) { h.attack = true; p.fired = true; }
        } else if (p.elapsed === 2 && !p.fired) {
          h.attack = true; p.fired = true;
        }
        // chain follow-up: keep pressing during recovery so the buffered chain fires
        if (p.fired && me.state === 'attack' && me.move?.chainTo && op.comboable && me.moveFrame > me.move.startup + moveActive(me.move) - 2) {
          h.attack = true;
        }
        break;
      }
      case 'special': {
        const k = p.kind ?? 'n';
        const pressFrame = p.holdSpecial ? 6 : 2;
        if (k === 'u') h.up = true;
        if (k === 'd') h.down = true;
        // face the target on separate frames from the press — holding a direction on the
        // press frame would turn a neutral special into a side special
        if (k === 's' || (!p.fired && p.elapsed < pressFrame)) {
          const aimAt = p.targetX ?? seen.x;
          const dir = safe(Math.sign(aimAt - me.x) || p.dir);
          if (dir < 0) h.left = true; if (dir > 0) h.right = true;
        }
        if (!p.fired) {
          if (p.elapsed === pressFrame) { h.special = true; p.fired = true; }
        } else if (p.holdSpecial && p.elapsed - pressFrame < p.holdSpecial) {
          h.special = true; // hold to charge
        } else {
          p.dur = Math.min(p.dur, p.elapsed + 6);
        }
        break;
      }
      case 'grab': {
        if (me.state === 'grabbing') {
          // throw: toward the chosen side (edge kills) or up for juggle setups
          if (op.damage < 30 && chance(0.25)) {
            h.up = true; // up throw sets up juggles
          } else {
            const fwd = p.dir === me.facing;
            h[fwd ? 'right' : 'left'] = true;
          }
          if (p.elapsed > 4 && !p.fired) { h.attack = true; p.fired = true; }
        } else {
          const dir = safe(p.dir);
          if (dir < 0) h.left = true; if (dir > 0) h.right = true;
          if (p.elapsed === 2 && !p.fired) { h.grab = true; p.fired = true; }
        }
        break;
      }
      case 'shield': {
        h.shield = true;
        break;
      }
      case 'dodge': {
        // never roll toward an edge — a blocked roll becomes a spot dodge
        let dd = p.dir;
        if (dd !== 0 && !this.roomAhead(dd, 70, main)) dd = 0;
        if (dd < 0) h.left = true; if (dd > 0) h.right = true;
        if (p.elapsed === 1 && !p.fired) { h.dodge = true; p.fired = true; }
        break;
      }
      case 'edgeguard': {
        if (!main) break;
        const mid = (main.cx0 + main.cx1) / 2;
        const edgeX = op.x < mid ? main.cx0 : main.cx1;
        // hold INSIDE the ledge — punish the recovery without ever leaving the stage
        const standX = clamp(edgeX + (edgeX === main.cx0 ? 54 : -54), main.cx0 + 26, main.cx1 - 26);
        const d = standX - me.x;
        if (Math.abs(d) > 14) {
          const dir = safe(Math.sign(d));
          if (dir < 0) h.left = true; if (dir > 0) h.right = true;
          if (Math.abs(d) > 160 && p.elapsed === 1 && me.dashCooldown === 0 && this.dashSafe(dir, main)) h.dash = true;
        }
        const dOp = Math.hypot(op.x - me.x, op.y - me.y);
        const faceOp = Math.sign(op.x - me.x) || 1;
        if (dOp < 190 && p.elapsed > 8) {
          // pressure the recovery with projectiles / waves (face first, then clean press)
          const projUser = me.id === 'hook' || me.id === 'ember' || me.id === 'vanguard' || me.id === 'nova' || me.id === 'volt' || me.id === 'frost' || me.id === 'wraith' || me.id === 'seraph' || me.id === 'viper';
          if (projUser && me.specialCooldown === 0 && p.elapsed % 34 === 10) {
            if (faceOp > 0) h.right = true; else h.left = true;
          }
          if (projUser && me.specialCooldown === 0 && p.elapsed % 34 === 15) {
            h.special = true;
          }
          // time a swing as they rise past the ledge
          if (dOp < 125 && op.y > me.y - 6 && op.vy < 1 && chance(0.22 + this.diff.tech * 0.2)) {
            if (faceOp > 0) h.right = true; else h.left = true;
            h.attack = true;
          }
        }
        break;
      }
      case 'recover': {
        this.executeRecover(main, h);
        break;
      }
      case 'mash': break;
    }

    this.held = h;
    void seen;
  }

  /** Aerial flyby strike: while executing a jump/move plan mid-air, swing when the foe
   *  crosses our reach — punishes platform campers instead of whiffing past them. */
  private flybyStrike(seen: Snap, main: MainPlat | null, h: Partial<Record<ActionName, boolean>>) {
    const me = this.me;
    if (me.grounded || me.state !== 'air') return;
    // never swing into the void — the target must be over the stage, and not offstage themselves
    if (!main || seen.x < main.cx0 || seen.x > main.cx1 || seen.y > main.top + 60) return;
    if (this.isOffstage(this.op, main)) return;
    const dx = seen.x - me.x, dy = seen.y - me.y;
    if (Math.abs(dx) > 58 || Math.abs(dy) > 64) return;
    h.attack = true;
    if (dy < -18) h.up = true;
    else if (dy > 18) h.down = true;
    else if (dx !== 0) h[dx > 0 ? 'right' : 'left'] = true;
  }

  /** Multi-stage recovery: get outside the hull, climb, then land. Resource-safe and stubborn. */
  private executeRecover(main: MainPlat | null, h: Partial<Record<ActionName, boolean>>) {
    if (!main) return;
    const me = this.me;
    const aboveTop = me.y < main.top - 8;
    const outsideHull = me.x < main.cx0 - 10 || me.x > main.cx1 + 10;
    const tech = this.diff.tech;

    // where do we drift?
    let targetX: number;
    if (aboveTop) {
      // above the deck: home in for the landing
      targetX = clamp(me.x, main.cx0 + 56, main.cx1 - 56);
    } else {
      // below deck: hug just outside the ledge so the LEDGE GRAB can catch the climb
      targetX = me.x < main.cx ? main.cx0 - 16 : main.cx1 + 16;
    }
    const dir = Math.sign(targetX - me.x) || (me.x < 0 ? 1 : -1);
    if (dir < 0) h.left = true; if (dir > 0) h.right = true;

    if (aboveTop) {
      if (me.vy > 0 && chance(tech * 0.4)) h.down = true;
    } else if (outsideHull) {
      // LEDGE CATCH: falling at the edge band — the snap-grab is imminent, stop wasting jumps
      const edgeX = me.x < main.cx ? main.cx0 : main.cx1;
      const ledgeCatch = me.y > main.top + 4 && me.y < main.top + 56 && me.vy > -0.5 &&
        Math.abs(me.x - edgeX) < 42;
      if (ledgeCatch) {
        // hold the drift; the ledge grab will catch us (its getup is handled by the ledge state)
        this.plan.dur = Math.max(this.plan.dur, this.plan.elapsed + 4);
        return;
      }
      // beside the stage: climb with jumps, then up-special when deep
      if (me.vy > 3.2 && me.jumpsUsed < 3 && chance(0.6 + tech * 0.4)) h.jump = true;
      if (me.y > main.top + 100 && !me.upSpecialUsed && me.vy > 0.5 && chance(0.45 + tech * 0.55)) {
        h.up = true; h.special = true;
      }
      // out of jumps and still falling: the directional air dodge is the last save
      const noJumps = me.jumpsUsed >= 3;
      if (!me.airDodgeUsed && me.vy > 1.2 && me.y > main.top + 60 && (noJumps || me.y > main.top + 140)
        && chance(0.3 + tech * 0.6)) {
        h.dodge = true; // drift is already held toward the stage — the burst throws us that way
      }
      // panic: deep below and still falling — spend everything
      if (me.y > main.top + 300 && me.vy > 0) {
        if (me.jumpsUsed < 3) h.jump = true;
        if (!me.upSpecialUsed) { h.up = true; h.special = true; }
        else if (!me.airDodgeUsed) h.dodge = true;
      }
    }
    // under the hull: drift out only (jumping would bonk the hull)
    // keep the plan alive while offstage
    this.plan.dur = Math.max(this.plan.dur, this.plan.elapsed + 4);
  }

  /** Direction guard: never casually walk or drift off an edge. */
  private safeDir(dir: number, main: MainPlat | null): number {
    if (!main || dir === 0) return dir;
    const me = this.me;
    const edgeMargin = 42;
    if (me.grounded) {
      // HARD: a grounded bot never walks off the stage — no exceptions
      if (me.x < main.cx0 + edgeMargin && dir < 0) return 0;
      if (me.x > main.cx1 - edgeMargin && dir > 0) return 0;
    } else if (!this.isOffstage(me, main)) {
      // airborne inside the stage hull: no outward drift at ANY height (below-deck chases included)
      if (me.x < main.cx0 + edgeMargin && dir < 0) return 0;
      if (me.x > main.cx1 - edgeMargin && dir > 0) return 0;
    }
    return dir;
  }

  /** Would a dash burst started now in `dir` stop safely inside the stage? */
  private dashSafe(dir: number, main: MainPlat | null): boolean {
    if (!main || dir === 0) return true;
    const me = this.me;
    const travel = me.stats.dashSpeed * me.stats.dashFrames * 0.95;
    const stop = me.x + dir * travel;
    return stop > main.cx0 + 30 && stop < main.cx1 - 30;
  }

  /** Is there at least `need` px of stage room ahead in `dir`? */
  private roomAhead(dir: number, need: number, main: MainPlat | null): boolean {
    if (!main || dir === 0) return true;
    const me = this.me;
    const stop = me.x + dir * need;
    return stop > main.cx0 + 26 && stop < main.cx1 - 26;
  }

  private isOffstage(f: Fighter, main: MainPlat): boolean {
    return f.x < main.cx0 - 16 || f.x > main.cx1 + 16 || f.y > main.top + 60;
  }
}

function opHurt(seen: Snap): boolean {
  return seen.state === 'hitstun' || seen.state === 'launch' || seen.state === 'dizzy';
}
