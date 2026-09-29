# RIFT BRAWL — what actually shipped

Companion to [`IMPROVEMENT-PLAN.md`](./IMPROVEMENT-PLAN.md), which is the original audit and is
deliberately left as written. This file tracks the work against it.

Every number here is reproducible: `npm run verify` runs the gates, and the individual harnesses
live in `tools/sim/`.

---

## Headline numbers

| Measure | Before | Now |
|---|---|---|
| Character win-rate spread (`sim:balance hard`) | 9 % – 91 % (82 pts) | 38.6 % – 61.4 % (22.7 pts, worst deviation 11.4 of a 26-pt budget) |
| Moves safe on shield | 0 | 38 of 164 (23 %) |
| Moves plus on hit at 0 % | ~0 | 58 of 164 (35 %) |
| Unreachable moves | 12 (back-air, every character) | 0 |
| AI difficulty ladder | flat | 14.6 → 46.9 → 66.7 → 72.9 % monotonic |
| Determinism over 2 000 frames | diverged (stage RNG) | 6/6 bit-identical |
| Gradient allocations per frame | 60+ | 0.59 |
| Initial JS payload | 1 068 KB raw | 660 KB raw / **206 KB gzipped** |
| Runtime dependencies | 20 | 6 |
| UI components | 52 (46 unused) | 6 |
| CI | none | typecheck, lint, determinism, replay fidelity, frame data, render smoke, build |

---

## Phase 0 — measurement harness · **done**

`tools/sim/` runs the real TypeScript game sources in plain Node through `jiti`, with the browser
surface stubbed (`env.mjs`). No mocks of gameplay code — it is the shipping simulation.

| Harness | `npm run` | What it gates |
|---|---|---|
| `balance.mjs` | `sim:balance` | Round-robin AI matches; win rate, damage, KOs, combo length, techs |
| `frames.mjs` | `sim:frames` | Solves knockback/hitstun/frame advantage for all 164 hitbox moves |
| `determinism.mjs` | `sim:determinism` | Same inputs twice, 2 000 frames, bit-compared |
| `replay.mjs` | `sim:replay` | Records a match, plays it back, diffs frame by frame |
| `usage.mjs` | `sim:usage` | Per-move usage, parries, shield breaks, grabs, techs — finds dead moves |
| `render-smoke.mjs` | `sim:render` | Every fighter × stage × state × the KO cinematic through a validating context |
| `ladder.mjs` | `sim:ladder` | Difficulty must be monotonic |
| `autotune.mjs` | `sim:autotune` | Hill-climbs the `BALANCE` table against measured win rates |
| `shot.mjs` | `sim:shot` | **Rasterises real frames to PNG** so the renderer can be reviewed without a browser |

`shot.mjs` earned its place immediately — the bloom bug below was invisible in code review and
obvious in a screenshot.

## Phase 1 — combat core · **done**

- **Back-air reachable.** `facing` is now latched before the air-attack read.
- **Knockback/hitstun rebuilt** (COMBAT MODEL v5 in `core/constants.ts`): weight-scaled knockback,
  hitstun proportional to knockback, launch angle authority, DI, SDI, teching.
- **Shield/grab triangle**: shield HP and shieldstun per move, perfect-shield parries with a
  reward window, grab armour, throw knockback. 23 % of moves are now safe on shield.
- **Deterministic stage RNG** (`Stage.srand`) — the sky stage's wind used `Math.random` and broke
  replays, rollback feasibility and the balance harness all at once.

## Phase 2 — twelve genuinely different brawlers · **done**

Every fighter owns a **signature resource** with its own rules, its own HUD meter, its own aura
and its own AI awareness. They are not stat variations.

| Fighter | Resource | Rule |
|---|---|---|
| Vanguard | Aegis | Blocking and parrying charge an empowered special: ×1.45 damage, ×1.3 knockback, armour |
| Ember | Overheat | Builds on contact, decays 0.0022/frame; over 70 % it is ×1.32 damage but ×1.15 damage taken |
| Hook | Tension | +0.18 per grab; at 50 % throws deal ×1.3, grab range ×1.4 → ×2 |
| Titan | Bulwark | Hits under 9 damage cannot launch him at all (knockback ×0.12) |
| Nova | Starfall | Three charges, 270-frame refill; dry casts do ×0.55 |
| Volt | Static | Charged by dashing; full discharge chains lightning ≤190 px and grants 120 frames of ×1.22 speed |
| Frost | Permafrost | Four chill stacks freeze the target solid |
| Wraith | Siphon | FADE — 12 frames fully intangible, 240-frame cooldown |
| Seraph | Radiance | Full meter triggers ASCEND: 360 frames of an extra jump and ×1.22 damage |
| Viper | Venom | Poison to 4 stacks with lifesteal; ×1.25 against anything already poisoned |
| Tempest | Gale | Three airborne charges, an extra jump and an air dash |
| Jaeger | Ammo | Six bolts at +18 % damage, reload by holding shield, ×0.5 melee when dry |

Plus per-fighter status immunities (Viper ignores poison and burn, Frost ignores chill, and so on).

## Phase 3 — AI · **done**

- **Capability gating** (`CAPS`), not just faster reactions: easy cannot DI, tech, punish or
  combo; normal gains DI/tech/punish; hard gains combos, kill confirms, edgeguards and
  out-of-shield options; expert adds ledge traps and a 3-frame reaction.
- Reaction chain `tryOutOfShield → tryThreatReaction → tryPunish → tryLedgeTrap`.
- `buildMoveDB` derives real reach and a model-accurate `killAt` per move, so the AI knows when a
  move actually kills rather than guessing.
- Kit awareness: `kitReadiness` means Nova plays differently at 0 stars than at 3.
- Result: the ladder is monotonic (14.6 / 46.9 / 66.7 / 72.9 %).

## Phase 4 — balance · **done**

`configs.ts` carries a `BALANCE` tuning layer (damage, knockback, speed, weight multipliers,
clamped to sane ranges) which `sim:autotune` hill-climbs against measured win rates. 82-point
spread → 22.7.

## Phase 5 — presentation · **done**

- Signature auras, status FX and rim lighting per character; bloom and impact aberration;
  sprite and gradient caches.
- **Replays and a KO cinematic** (see below).
- **Per-stage lighting** (`stages/lighting.ts`): a bounce light thrown up onto fighters from the
  floor, mirrored reflections inside glossy platforms, and a screen-space colour grade, so
  characters and backgrounds share a light source.
- **A real bloom.** The old pass added a plain downsample of the frame back at 55 % opacity, which
  lifts every pixel — the volcanic cavern rendered as flat salmon. It now does a bright-pass
  (multiply the buffer by itself twice) before compositing. This was the single biggest visual
  change and it was found by looking at a `sim:shot` PNG.
- **A latent crash fixed**: `blitGlow` forwarded its `falloff` to `addColorStop`, which throws
  `IndexSizeError` outside 0..1, and four call sites passed 1.4–2.4. The headless gradient stub now
  rejects out-of-range stops so CI catches it.
- Volcanic Core and Frozen Lake backgrounds rebuilt with parallax ridges, an erupting cone, magma
  fissures, heat shimmer, a conifer treeline and ice mist.
- Hit flash is a one-frame whiteout collapsing to a rim, instead of five frames of opaque white.
- HUD rhythm fixed — the resource caption used to be drawn through the damage number.

## Phase 6 — replays · **done**

Input-track replays, not video. Eleven held bits plus quantised analog axes per player per frame,
RLE'd and base64'd: **~1.7 bytes per frame, about 6 KB per minute of match**. Playback
re-simulates with the AI off, so what you watch is what happened — `sim:replay` diffs a recording
against its playback frame by frame and is a CI gate. Replay Theatre lists, plays (0.25×–4×),
scrubs, exports and imports them.

The same determinism is what makes rollback netcode feasible later.

## Phase 7 — mobile & accessibility · **done**

- Touch layer with an analog stick and a four-button cluster, wired into the same `InputState` the
  keyboard and gamepad produce.
- Installable PWA: manifest, generated icon set, service worker. Single-player RIFT BRAWL
  synthesises its art and audio at runtime, so once the shell is cached it works offline.
- Accessibility settings: **reduce motion** (no shake, zoom punch, speed lines or KO freeze; also
  honours the OS preference), **player shape markers** (triangle/square/circle/diamond, so players
  are tellable apart without colour), and **HUD size** at 80–140 %.

## Phase 8 — hygiene & weight · **done**

- 46 unused UI components, Prisma, an unused API route and 20 → 6 runtime dependencies removed.
- Real ESLint rules (including the React Compiler set) with zero problems.
- The simulation, and every screen except the landing menu, are code-split; the twelve live roster
  portraits stream in after first paint. 1 068 KB → 660 KB raw, **206 KB gzipped**.
- `socket.io-client` is lazily imported and only paid for by players who go online.
- Lobby service hardened: rate limiting, room TTL, payload caps, a health probe on its own port.

---

## Shipping it as a website

The game is 100 % client-side, so the default build is now a **static export**: `npm run build`
emits `out/`, a 1.9 MB folder that any host will serve, offline-capable once the service worker
has cached the shell. `NEXT_OUTPUT=standalone` still produces a Node server build for anyone who
wants one.

- **Base-path aware end to end** — `NEXT_PUBLIC_BASE_PATH` feeds Next's `basePath`/`assetPrefix`,
  the manifest uses relative `./` URLs, and `sw.js` derives its scope from
  `new URL('./', self.location)`. Verified by serving the build from a `/rift-brawl/` sub-path.
- **`tools/serve.mjs`** — a zero-dependency static server with the right cache headers
  (immutable for `/_next/static/*`, `no-cache` for `sw.js`), a path-traversal guard and a 404
  fallback. It is what `npm start` and the Docker image run.
- **Deploy paths committed** — a GitHub Pages workflow that gates on typecheck + determinism +
  render smoke before publishing, plus `netlify.toml`, `vercel.json`, a `Dockerfile` and a
  `docker-compose.yml` that brings up the game and the lobby relay together.
- **Website-grade presentation** — `VideoGame` JSON-LD, a `<noscript>` description of the game
  for crawlers and no-JS visitors, `sitemap.xml`, and a `robots.txt` that points at it. OpenGraph
  and Twitter cards resolve against `NEXT_PUBLIC_SITE_URL`, so shared links unfurl properly.

Online play is the only piece that needs a backend. Without `NEXT_PUBLIC_LOBBY_URL` the online
menu reports no server and everything else — single player, local versus, arcade, survival,
training, challenges, replays — works unchanged. See `docs/DEPLOY.md`.

---

## Still open

- **Rollback netcode.** The relay is host-authoritative at 30 Hz with interpolation, so remote
  latency is a full round trip. Replay fidelity proves the simulation is deterministic enough for
  rollback; that is the next big netcode step.
- **Unit tests.** The simulation harnesses are strong integration tests, but there is no unit
  layer over the pure maths (`knockbackOf`, the replay codec, the gradient cache).
- `ParticleSystem.spawn()` still linear-scans a 700-slot pool.
- The `jumpsquat` state exists but `tryJump` calls `doJump` directly.
- Debug globals `window.__match/__net/__rb` are still exposed.
