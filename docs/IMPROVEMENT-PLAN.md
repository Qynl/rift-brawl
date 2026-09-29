# RIFT BRAWL — Deep Audit & Overhaul Plan

**Date:** 2026-09-28 · **Branch:** `arena/01a0e93f-rift-brawl` · **Status:** in progress — see [PROGRESS.md](./PROGRESS.md)

> This document is the original audit, preserved as written. Every finding
> below was true of the code as it stood on 2026-09-28. For what has since
> been fixed, measured and shipped, read `docs/PROGRESS.md`.

---

## 0. How I audited it

I didn't just read the code. I built a **headless simulation harness** so the claims below are
measurements, not opinions.

| Method | What it did |
|---|---|
| Static read | All ~13k lines of `src/lib/game/**` + `src/components/game/**`, lobby service, configs, build config |
| `tsc --noEmit`, `eslint`, `next build` | Type/lint/build health + bundle weight |
| **Headless sim harness** (`jiti` + DOM/audio stubs, ran `Match.step()` with no renderer) | **~700 full AI-vs-AI matches** across all 12 fighters × 6 stages × 4 difficulties, ≈150k simulated frames |
| State instrumentation | Per-frame state occupancy, per-move usage counts, parry/shield-break counters |
| Frame-data solver | Computed knockback, hitstun and frame advantage on hit/shield for **all 164 hitbox moves** |
| Determinism probe | Same scripted inputs, two runs, 2,000 frames, bit-compared final state |
| Targeted repro | Scripted input test that proves a specific move is unreachable |

A single match simulates in ~250 ms headless, so a 264-match round robin runs in 24 seconds.
**That harness should be the first thing that gets committed** — see Phase 0.

---

## 1. Verdict up front

**This is not trash.** It is a genuinely ambitious, well-structured codebase: 12 fighters with
authored frame data, 6 hand-drawn procedural stages, a utility-scoring AI, a runtime Web-Audio
synth, ledges, parries, wavedash momentum, host-authoritative netplay. Most "browser fighting
game" repos are a tenth of this.

**But it doesn't play like a fighting game**, and I can now say exactly why:

> The knockback model launches the victim out of range on almost every hit at 0 %, **nothing in the
> game is safe on shield**, the grab game is statistically nonexistent, **one entire move per
> character is physically impossible to input**, and character win rates run from **9 % to 91 %**.

So the fix isn't "polish". Four systems — knockback/hitstun, the shield/grab triangle, balance,
and netcode — need to be rebuilt on correct foundations. Everything else (art, UI, meta, mobile)
is upside stacked on top of that.

---

## 2. Findings

Severity: 🔴 breaks the game · 🟠 major · 🟡 worth doing

### 2.1 Combat core — this is why it feels bad

**🔴 A1 — Back-air is unreachable. On every single character.**

`Fighter.updateFree()` sets `facing` from the stick *before* `tryAirAttack()` reads it:

```ts
// airborne branch
if (ax !== 0) { this.vx += …; if (!this.move) this.facing = ax > 0 ? 1 : -1; }   // facing flips here
…
const fwd = (input.axisX > 0 ? 1 : -1) === this.facing;                          // …so fwd is ALWAYS true
this.startMove(this.cfg.moves[fwd ? 'fair' : 'bair']);
```

Scripted repro (face right → jump → hold left → attack) returns `fair`, never `bair`.
Across 24 instrumented matches, `bair` has **0 starts out of 3,574**.

That's 12 dead moves — and per my frame-data solver, **bair is the single best combo/kill tool in
the game** (`vanguard.bair`: +5 on hit at 0 %, +26 at 50 %). The best moves in the game cannot be
performed.

**🔴 A2 — There is no combo game, by construction.**

```ts
kb = (bkb + kbg*(dmg%/100)*0.9 + kbg*dmg*0.004) * weightMod * 0.57;
hitstun = clamp(round(kb*1.15 + dmg*0.4), 10, 54);
state = kb > 8 ? 'launch' : 'hitstun';
```

**126 of 164 hitbox moves (77 %) already exceed the launch threshold at 0 % damage.** The victim is
thrown clear before you can act. Measured across 264 hard-AI matches: **max combo = 1–2 hits**;
`hitstun` state occupies **0.70 %** of match time while `launch` occupies **7.66 %**.

The formula also isn't a knockback curve — `bkb` dominates at low %, so hits don't *scale*, which
removes the core "percent = tension" feedback loop of the genre.

**🔴 A3 — Nothing is safe on shield. Zero moves. Out of 164.**

`shieldstun = round(3 + dmg*0.45)` against full move recovery → **every move in the game is
minus on shield**, the best being −2. Consequences, measured:

- shield used **0.94 %** of match time
- **0 shield breaks** in 24 matches
- 13 parries in 24 matches
- shield HP **never decays while held and never regenerates** — holding shield is free forever

The attack/shield/grab triangle is not merely weak, it is absent.

**🔴 A4 — The grab game is statistically dead.**

**10 grab starts and 5 throws out of 3,574 move starts (0.28 %).** `grabbing`/`grabbed` states
occupy **0.00 %** of match time. Four throws per character × 12 characters = 48 authored moves
that never fire.

**🟠 A5 — Defensive tech options are inert.** 8 techs across 24 matches. DI is ±8–10° (Smash is
~±18° plus SDI); there is no SDI during hitlag, no tech-roll, no wall/ceiling tech.

**🟠 A6 — Getting hit *refills* your recovery.**

```ts
// inside applyKnockback
this.jumpsUsed = 0; this.airDodgeUsed = false; this.upSpecialUsed = false;
```

Every hit restores triple jump + air dodge + up-special. Edgeguarding — the most exciting part of
a platform fighter — is worth almost nothing.

**🟠 A7 — No match timer exists.** Stock-only, no clock, no time-out ranking. **2 of 132** easy-AI
matches hit my 4-minute safety cap with no resolution. A stalling opponent online can hold a match
hostage indefinitely.

**🟡 A8 — Missing genre staples:** crouch cancel, ledge trump, ledge-invincibility budget, 2-frame
punish window, out-of-shield up-special/aerial, shield tilting, tilt-vs-smash split (there are no
smash attacks at all — only jab/f/u/d + dash attack).

### 2.2 Balance — 9 % vs 91 %

264 matches, all 12 fighters, round robin, hard AI, 6 stages:

```
titan     WR  90.9%      hook      WR  38.6%
seraph    WR  81.8%      jaeger    WR  36.4%
frost     WR  79.5%      nova      WR  31.8%
viper     WR  68.2%      tempest   WR  31.8%
vanguard  WR  59.1%      volt      WR  13.6%
wraith    WR  59.1%      ember     WR   9.1%
```

**🔴 B1** — An 82-point spread. Heavies (Titan 128 w, Frost 118 w, Seraph 112 w) dominate because
knockback scales with weight but the lightweights got no compensating combo game (there is no
combo game at all — see A2). Ember is unplayable.

**🔴 B2 — Difficulty barely changes outcomes.** Titan's win rate: **easy 90.9 % → expert 81.8 %**.
Seraph: normal 90.9 %. The only thing difficulty reliably changes is pace (median match: easy 118 s
→ expert 94 s). Six personalities × four difficulties is, in outcome terms, mostly cosmetic.

**🟠 B3** — There is no balance harness in the repo, so none of this was ever detectable.

### 2.3 AI

**🟠 C1** — 55 % of all AI move starts are just four moves (`fair` 16 %, `fattack` 16 %, `uair` 13 %,
`dair` 10 %). It never uses `bair` (can't), barely uses `nair` (1.8 %), `grab` (0.3 %), or jab
chains (`jab` 230 → `jab2` 25 → `jab3` 9 — the chain almost never completes).

**🟠 C2** — Difficulty is implemented as *noise and reaction-delay knobs*, not as capability gating,
which is why it doesn't move the win rate. It has no combo routes, no ledge trapping, no
out-of-shield punishes.

### 2.4 Netcode

**🟢 D0 — The best news in this audit: the simulation is provably deterministic.**
Two runs, identical scripted inputs, 2,000 frames → bit-identical fighter state. Gameplay RNG is
confined to particles and SFX variation. **Rollback netcode is therefore achievable**, which is the
single highest-ceiling upgrade available to this project.

**🔴 D1** — Current model is host-authoritative with 30 Hz snapshots + interpolation. Remote players
eat the **full RTT as input delay**. For a fighting game that is unshippable above ~40 ms.

**🔴 D2 — Online is broken outside this sandbox.** `NetClient` hardcodes:

```ts
const s = io('/?XTransformPort=3003', …)
```

That's a Caddy-specific rewrite unique to this environment. Following the README's own instructions
(`npm run dev` + `bun run dev` in `mini-services/`) on a normal machine, online play cannot connect.

**🟠 D3** — Relay has no auth, no rate limiting, no room TTL, no reconnect-into-match, no spectators.
`queueRemoteInput` caps at 8 packets but nothing validates the sender owns that player slot.

### 2.5 Presentation & performance

**🟠 E1** — **60 gradient allocations per frame** in hot render paths (`stages.ts` 20, `render.ts` 20,
`combat.ts` 15, `Match.ts` 7). Stage backgrounds, platform art, HUD plates and portraits are
re-rasterised every frame with zero offscreen caching. This is the #1 frame-time cost and it's
entirely avoidable.

**🟠 E2** — No mobile or touch support whatsoever. `<body className="… overflow-hidden">`,
keyboard-only, README says "desktop recommended". For a browser game that's the majority of
potential traffic gone.

**🟡 E3** — Fighter visuals are per-state hand-tuned joint-angle tables. It works, but at 12
characters the silhouettes read similarly, and there's no impact-frame / hit-pause pose language.

**🟡 E4** — No OG/Twitter cards, no favicon, no manifest, no PWA, no replays, no share links.
`layout.tsx` metadata still says *"Four original fighters"* — there are twelve.

**🟡 E5** — `tailwind.config.ts` content globs point at `./app`, `./components`, `./pages`. The
project lives in `./src`. Under Tailwind v4 (CSS-first config) that file is dead weight with wrong
paths.

### 2.6 Engineering hygiene

| # | Finding |
|---|---|
| 🟠 F1 | **48 shadcn components shipped, 2 actually used** (`toast`, `toaster`). |
| 🟠 F2 | **~20 unused dependencies**: `@mdxeditor/editor`, `next-auth`, `next-intl`, `@dnd-kit/*` ×3, `@tanstack/*` ×2, `zustand`, `zod`, `framer-motion`, `recharts`, `react-markdown`, `react-syntax-highlighter`, `date-fns`, `uuid`, `z-ai-web-dev-sdk`, `@reactuses/core`… |
| 🟠 F3 | **~1.0 MB of static JS**, single chunk set, no code-splitting. Engine + `socket.io-client` + all of shadcn load before the menu paints. |
| 🟠 F4 | `next.config.ts`: `typescript.ignoreBuildErrors: true`, `reactStrictMode: false`. |
| 🟠 F5 | **Zero tests, no CI.** `eslint .` currently reports 7 errors. |
| 🟠 F6 | `Match.ts` (1,722 lines) is simulation + netcode + HUD rendering in one class. `Fighter.ts` 1,742, `render.ts` 1,957. This coupling is what blocks rollback, unit tests, and web-worker simulation. |
| 🟡 F7 | Untouched scaffolding: Prisma schema is the `User`/`Post` template, `src/lib/db.ts` unused, `/api` returns `"Hello, world!"`, package name is `nextjs_tailwind_shadcn_ts`. |

---

## 3. The plan

Nine phases. Phases 0–2 are the ones that turn it from "tech demo" to "good game"; 4 and 5 are the
ones that make it *remarkable*. Each phase has a **measurable** exit criterion, because the harness
makes that possible.

---

### Phase 0 — Make quality measurable (foundation)

*Nothing here is visible to players. Everything after it depends on it.*

1. **Land the sim harness** as `tools/sim/` with scripts:
   - `npm run sim:balance` — N-match round robin → win-rate table (24 s for 264 matches)
   - `npm run sim:frames` — frame-advantage table for all 164 moves (on hit @0/50/100 %, on shield)
   - `npm run sim:determinism` — bit-compare two identical input replays
   - `npm run sim:usage` — state occupancy + move-usage histogram
2. **Split simulation from presentation.** New `src/lib/game/sim/` containing pure logic; the
   `World` interface stops calling `particles.emit()` / `audio.play()` directly and instead pushes
   to an **event sink** the renderer drains. No DOM, no canvas, no audio in the sim tree.
   *(This is also the hard prerequisite for rollback and for running the sim in a worker.)*
3. **Sim state serialization**: `serialize(): ArrayBuffer` / `deserialize()` + `checksum()`.
4. **Seeded RNG** (`mulberry32` already exists) injected into the sim; ban bare `Math.random()`
   inside `sim/` with an ESLint rule.
5. **Vitest + CI** (GitHub Actions): determinism test, frame-data invariants, balance regression
   (fails if spread exceeds threshold), golden replay tests, `tsc` + `eslint` gates.
6. Flip `ignoreBuildErrors: false`, `reactStrictMode: true`, fix the fallout.

**Exit:** CI green and blocking; `npm run sim:balance` reproducible in <30 s; determinism test passes.

---

### Phase 1 — Rebuild the combat core 🔴

This is the phase that fixes "it feels trash".

1. **Knockback on the standard model**, tuned to this game's scale:
   `kb = ((p/10 + p·d/20) · 1.4 · 200/(w+100) + 18) · (kbg/100) + bkb`
   → knockback genuinely scales with percent, so damage creates tension.
2. **Hitstun = kb · 0.4** (genre standard), and replace `kb > 8 → launch` with a
   *tumble threshold* derived from knockback distance, not raw speed. Target: **<25 % of moves
   tumble at 0 %** (today: 77 %).
3. **Fix back-air** — snapshot facing at the moment the aerial is buffered, and add an explicit
   turnaround-aerial rule. Ship a regression test that inputs back-air on all 12 characters.
4. **Build the neutral triangle:**
   - `shieldstun = dmg·0.8 + 2` → target **12–18 % of moves safe or plus on shield**
   - shield shrinks while held, regenerates when dropped; shield size gates hurtbox coverage
   - out-of-shield options with real windows: jump (3 f), up-special, grab (6 f), shield-drop 7 f
   - grabs: faster startup, real range, beat shield, 4 throws with distinct combo/kill roles,
     mash-out scaling by damage
5. **Remove the free-recovery bug** (stop resetting jumps/air-dodge/up-special on hit); add ledge
   trump, a ledge-invincibility budget, and the 2-frame edge punish.
6. **Defensive depth:** widen the tech window, add tech-roll left/right/in-place and wall/ceiling
   techs; SDI during hitlag; DI to ±18° with on-screen feedback.
7. **Smash attacks:** add charged f-smash/u-smash/d-smash per character (currently only tilts
   exist), which gives the game its kill-move layer.
8. **Match timer** (default 3:00 + stocks), sudden death, time-out ranking by stocks→damage.
9. **Combo counter + damage-scaling UI** so the new combo game is legible.

**Exit (all measured by the harness):**
- median best-combo ≥ 4 at hard AI (today 1–2)
- ≥ 12 % of moves safe-or-plus on shield (today 0 %)
- grab usage 3–8 % of move starts (today 0.28 %)
- tech rate > 30 % of techable landings (today ~0 %)
- median match 60–90 s, **0 timeouts**

---

### Phase 2 — Balance, driven by data 🔴

1. Re-run the round robin after every tuning change; treat the win-rate table as a test.
2. Give every character an explicit **role sheet**: kill confirms, combo starters, recovery
   distance, one designed weakness. Heavies trade combo weight for exploitable recovery;
   lightweights get real combo strings now that Phase 1 enables them.
3. Generate `docs/frame-data.md` from `configs.ts` at build time so the data is public and reviewable.
4. Kill-percent targets per archetype; weight ↔ fall-speed ↔ recovery coherence pass.

**Exit:** all 12 characters within **38–62 % WR** over ≥ 500 matches at hard; no character holding
a > 70 % matchup against more than two others; regression test enforces it.

---

### Phase 3 — An AI that actually scales 🟠

1. Replace noise/reaction knobs with **capability gating**: easy cannot tech, DI, edgeguard, or
   punish out-of-shield; expert does frame-perfect punishes, ledge traps, and combo routes.
2. **Offline combo search**: brute-force 2–4 move links from the new frame data per character,
   bake them into a combo table, let the AI execute them. (The harness already makes this cheap.)
3. Habit modelling that actually adapts (conditioning, then breaking the pattern).
4. Fix the move-usage flatness: usage entropy target, so no four moves exceed 35 % of starts.

**Exit:** measured win-rate ladder against a fixed reference bot — easy ~15 %, normal ~35 %,
hard ~60 %, expert ~85 %. Difficulty must change *outcomes*, not just pace.

---

### Phase 4 — Rollback netcode 🔴 *(the headline feature)*

The determinism proof means this is real, not aspirational.

1. **GGPO-style rollback**: 2-frame input delay, rollback up to 8 frames, ring buffer of serialized
   sim states, per-frame checksum exchange for desync detection + automatic desync reports.
2. **WebRTC DataChannel P2P** for match traffic (unreliable/unordered), Socket.io kept as
   signalling + TURN fallback.
3. **Fix the hardcoded lobby URL** — `NEXT_PUBLIC_LOBBY_URL` with a sane `localhost:3003` default
   plus a dev proxy route, so the README instructions actually work anywhere.
4. Harden the relay: slot-ownership validation, rate limiting, room TTL, reconnect-into-match,
   spectator slots.
5. Run the sim in a **Web Worker** so rollback re-simulation never drops a render frame.

**Exit:** indistinguishable from local at 120 ms RTT; **0 desyncs** across 100 automated 60-second
matches with injected jitter (±40 ms) and 3 % packet loss.

---

### Phase 5 — Presentation overhaul 🟠

1. **Kill the 60 gradients/frame.** Pre-bake every static gradient, platform, stage layer and HUD
   plate into `OffscreenCanvas` atlases at load. Re-render background layers only when camera or
   zoom changes. Target: **0 gradient allocations per frame** in the hot loop.
2. **Bake fighters once at boot** into per-character part atlases (still 100 % original procedural
   art — just rasterised once instead of 60×/s), driven by a proper skeletal rig.
3. **Impact language:** impact-frame poses, directional hit sparks tiered by knockback, freeze
   frames, screen-space KO cinematic (zoom + slow-mo + star-KO + stage-specific blast), launch
   trails, and a readable combo/percent HUD.
4. Silhouette-first palette pass so 12 characters read apart at a glance; colour-blind-safe player
   indicators.
5. Quality tiers that actually gate work (low = no offscreen layers, capped particles, no vignette).

**Exit:** locked 60 fps at 1440p with 4 players and max particles on a mid-range laptop;
frame-time p99 < 12 ms; measured via an in-repo perf harness.

---

### Phase 6 — Mobile, reach, shareability 🟠

1. **Touch controls**: virtual stick + 4 action buttons, tuned dead zones, swipe-for-smash, haptics;
   responsive HUD; fullscreen + orientation lock; safe-area insets.
2. **PWA**: manifest, icons, service worker, offline single-player.
3. OG/Twitter cards rendered from character art, favicon set, real metadata (it still says "Four
   original fighters"), sitemap.
4. Accessibility: remappable everything (already good), reduced-motion mode, colour-blind palettes,
   scalable HUD, screen-reader menu pass.

**Exit:** playable at 60 fps on a 390 px phone; Lighthouse PWA installable; correct share previews.

---

### Phase 7 — Meta, retention, the reason to come back 🟡

1. **Replays as input recordings** (kilobytes, not video) — enabled by determinism. Share links,
   spectate, "watch the KO" clips.
2. Replace the Prisma template with a real schema: accounts, per-character stats, match history,
   ELO, leaderboards, daily challenges.
3. **Ranked matchmaking** on top of rollback.
4. Progression: mastery levels, unlockable palettes/taunts, arcade with per-character endings and
   a boss, a proper tutorial that teaches the Phase-1 mechanics.

---

### Phase 8 — Repo hygiene 🟠

1. Delete the 46 unused shadcn components and ~20 unused dependencies.
2. Remove Prisma template + `/api` hello route (or replace with the Phase-7 API). Rename the package.
3. Split `Match.ts` → `sim/Match.ts`, `hud/MatchHud.ts`, `net/MatchNet.ts`. Same for `render.ts`.
4. Lazy-load the engine on "PLAY"; code-split online behind a dynamic import.
5. Delete the stale `tailwind.config.ts` (or fix its globs to `./src/**`).
6. CONTRIBUTING, ADRs for the knockback model and the netcode choice.

**Exit:** initial JS **< 250 KB** (from ~1.0 MB); engine loads on demand; lint/type/test gates green.

---

## 4. Priority

| Phase | Impact on "does this feel good" | Effort | Order |
|---|---|---|---|
| 0 · Harness + sim/render split | enabler | M | **1st** |
| 1 · Combat core rebuild | ★★★★★ | L | **2nd** |
| 2 · Data-driven balance | ★★★★★ | M | **3rd** |
| 5 · Render caching + impact FX | ★★★★ | M | 4th |
| 3 · AI capability gating | ★★★ | M | 5th |
| 4 · Rollback netcode | ★★★★★ (ceiling) | XL | 6th |
| 6 · Mobile + PWA | ★★★ (reach) | M | 7th |
| 8 · Hygiene | ★★ | S | continuous |
| 7 · Meta/retention | ★★★ | L | last |

### One-day quick wins (can ship before Phase 0 if you want momentum)

- Fix back-air facing — **12 dead moves, ~5 lines** 🔴
- Stop resetting jumps/air-dodge/up-special on hit — edgeguarding starts existing 🔴
- Add a match timer + time-out ranking 🔴
- `shieldstun = dmg·0.8 + 2` — instantly gives some moves shield safety 🔴
- Env-driven lobby URL so online works outside this sandbox 🔴
- Fix the "Four original fighters" metadata, add favicon + OG image 🟡
- Delete 46 unused shadcn components + ~20 deps 🟠

### What I'd do in the first PR

`Phase 0.1` + `Phase 0.2` + the back-air fix, together: land the harness, split sim from
presentation, prove determinism in CI, and fix the one bug that's provably deleting a twelfth of
the moveset. That gives us the instrument panel *and* a visible win, and every later phase gets
cheaper and safer.

---

## 5. Appendix — raw measurements

**Round robin, 264 matches, hard AI, all 12 fighters, 6 stages, 3 stocks:**

```
diff=hard matches=264 timeouts=0 elapsed=23.8s
duration sec: p10=59 med=90 p90=138 max=219

titan     WR  90.9%  avgDmgDealt 132  maxCombo 2  techs 0
seraph    WR  81.8%  avgDmgDealt 138  maxCombo 1  techs 0
frost     WR  79.5%  avgDmgDealt 161  maxCombo 2  techs 0
viper     WR  68.2%  avgDmgDealt 117  maxCombo 2  techs 0
vanguard  WR  59.1%  avgDmgDealt 124  maxCombo 2  techs 0
wraith    WR  59.1%  avgDmgDealt 158  maxCombo 2  techs 1
hook      WR  38.6%  avgDmgDealt 173  maxCombo 2  techs 3
jaeger    WR  36.4%  avgDmgDealt 134  maxCombo 1  techs 0
nova      WR  31.8%  avgDmgDealt 120  maxCombo 2  techs 0
tempest   WR  31.8%  avgDmgDealt 128  maxCombo 4  techs 4
volt      WR  13.6%  avgDmgDealt 132  maxCombo 5  techs 0
ember     WR   9.1%  avgDmgDealt  95  maxCombo 2  techs 0
```

**Difficulty barely moves outcomes:**

```
easy    titan 90.9%  seraph 86.4%   med 118s  (2 timeouts / 132)
normal  seraph 90.9% titan  86.4%   med 101s
hard    titan 90.9%  seraph 81.8%   med  90s
expert  frost 86.4%  titan  81.8%   med  94s
```

**State occupancy, 24 matches / 149,187 frames:**

```
air 25.86%   attack 24.32%  walk 11.25%  idle 10.91%  launch 7.66%
land 5.37%   respawn 2.75%  dodge 2.51%  ledge 2.35%  ko 2.28%
dash 2.10%   shield 0.94%   hitstun 0.70%  shieldstun 0.27%
crouch 0.22% grabbed 0.00%  grabbing 0.00%
→ parries 13, shield breaks 0
```

**Move usage (3,574 starts):**

```
fair 16.1%  fattack 15.7%  uair 12.8%  dair 10.4%  nspecial 9.2%
sspecial 6.5%  jab 6.4%  dspecial 6.2%  uattack 5.7%  dattack 3.3%
dashattack 2.9%  uspecial 1.9%  nair 1.8%  jab2 0.7%  grab 0.3%
jab3 0.3%  throw_f 0.1%  throw_b 0.03%   ·   bair 0.0%  (unreachable)
```

**Frame-data solver, all 164 hitbox moves:**

```
plus-on-hit at 0%:              78 / 164  (48%)
plus-or-safe on shield:          0 / 164  (0%)
already tumbling at 0% (kb>8): 126 / 164  (77%)
best move on hit @0%: +5 (bair — unreachable)
worst: tempest.sspecial −19 on hit, −25 on shield
```

**Determinism:** two runs × 2,000 frames × identical scripted inputs → identical final state.
✅ rollback is viable.

**Build:** `next build` OK · `tsc --noEmit` clean · `eslint` 7 errors · static JS ≈ **1,004 KB**
(largest chunk 394 KB) · 48 shadcn components shipped, 2 used.
