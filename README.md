# RIFT BRAWL

An original browser platform-fighter — percent-based knockback instead of health bars, stocks, 12 unique brawlers with signature weapons, 6 handcrafted stages, a utility-driven AI, and online lobby play with room codes for up to 4 players.

Built with **Next.js, TypeScript and Canvas**. All characters, art and audio are original — every sound effect is synthesized at runtime with the Web Audio API, no external assets.

## Features

- **12 original brawlers** — VANGUARD, EMBER, HOOK, TITAN, NOVA, VOLT, FROST, WRAITH, SERAPH, VIPER, TEMPEST and JAEGER. Every fighter has a signature weapon, its own archetype and stats, and a fully authored moveset with real frame data (startup / active / recovery), per-move hitboxes and knockback angles.
- **Platform-fighter combat** — damage percent + knockback (base / growth / angle), hitstun, stocks, blast zones, ledge play, shields, dodges, grabs and throw games.
- **6 stages** — Forest, Volcano, Neon, Frozen, Sky and Rift, each with its own layout.
- **Game modes** — Quick Match, Arcade, Survival, Training, Challenges and local VS.
- **Online lobby** — create a room, share the lobby code, fight with up to 4 players via the Socket.io lobby service.
- **Utility AI** — 6 personalities × 4 difficulty levels, non-omniscient, with spacing, edge safety and recovery decisions.
- **Original audio** — procedural Web Audio synthesis for every swing, hit and UI sound.
- **Full customization** — remappable keyboard bindings for both players, gamepad support, progress saved in localStorage.

## Controls (default, Player 1)

| Action | Key |
| --- | --- |
| Move | A / D |
| Up / down (fast fall) | W / S |
| Jump (double / triple) | Space |
| Attack | J |
| Special | K |
| Grab | L |
| Shield | I |
| Dodge | U |
| Dash | Q or E |

Player 2 (default): arrow keys to move, ↑ jump, `,` attack, `.` special, `/` grab, `M` shield, `N` dodge, right Shift dash.

All bindings are remappable in the in-game settings; gamepads work with the standard mapping.

## Getting started

Requires Node 20+ (developed on Node 22).

```bash
# install dependencies
npm install

# run the game
npm run dev        # → http://localhost:3000
```

### Online lobby service

Online play (room codes, up to 4 players) runs through a small Socket.io relay:

```bash
cd mini-services/lobby-service
npm install
npm run dev        # relay on :3003, health probe on :3004/healthz
```

Point the client at a relay other than the default with
`NEXT_PUBLIC_LOBBY_URL=https://your-relay.example`. Socket.io itself is loaded
lazily — it is only fetched when a player actually opens the online menu, so it
stays out of the initial bundle.

## Verification

There is no browser test runner; instead the real engine is driven headlessly
from Node (`tools/sim/`), which is what CI gates on.

```bash
npm run verify           # typecheck + lint + determinism + frame data + render smoke

npm run sim:determinism  # identical inputs must produce byte-identical state
npm run sim:frames       # startup/active/recovery + on-shield safety for all 164 moves
npm run sim:render       # every fighter × stage × visual state, checking for throws
npm run sim:balance      # AI round-robin win-rate spread (slow, noisy)
npm run sim:usage        # which moves/mechanics the AI actually reaches for
npm run sim:autotune     # searches the per-fighter BALANCE multipliers
```

## Project structure

```
src/lib/game/            # engine core: physics, combat, camera, save
  fighters/              # fighter configs, weapons, frame data, rendering
  ai/                    # utility-based AI controller
  net/                   # lobby protocol + net client
  stages/                # stage definitions
  audio/                 # procedural Web Audio synth
  effects/               # particles, glow sprites, gradient cache, post-processing
src/components/game/     # UI screens: landing, select, HUD, lobby, results, touch pad
mini-services/           # Socket.io lobby relay for online play
tools/sim/               # headless simulation harness (determinism, frames, balance)
docs/IMPROVEMENT-PLAN.md # audit + roadmap, with implementation status
```

## Touch

On coarse-pointer devices an on-screen layer appears automatically: a floating
analog thumbstick on the left (it re-centres wherever your thumb lands), the
attack/special/jump/grab cluster on the right, and a shield/dodge/dash strip
above it. It is driven by pointer events rather than clicks, so chords like
shield + attack work, and every virtual button is released on blur so inputs
can never stick.
