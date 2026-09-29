# Deploying RIFT BRAWL

RIFT BRAWL is a **static site**. There is no server, no database and no API: the fighters, the
stages, the audio and the entire simulation are generated in the browser at runtime. `npm run
build` produces an `out/` folder and any host on earth can serve it.

The one exception is **online multiplayer**, which needs the small Socket.IO relay in
`mini-services/lobby-service`. Everything else — single player, local versus, arcade, survival,
training, challenges, replays — works with no backend at all, and offline once the service worker
has cached the shell.

```
npm run build         # -> out/    static export (the default)
npm start             # serve out/ on http://0.0.0.0:3000
npm run preview:full  # build if needed + serve + run the online relay
```

---

## Arena / sandbox preview (the whole game, one command)

On an Arena sandbox — or any VM that exposes ports as `<port>-<id>.example.com` — this is the
whole deployment:

```bash
npm run preview:full
```

It builds the static export if `out/` is missing, serves it on `0.0.0.0:3000`, and starts the
lobby relay on `3003` (health on `3004`). Both bind to `0.0.0.0`, so the preview URL is
shareable as-is.

**Online multiplayer works here with no configuration.** `NEXT_PUBLIC_LOBBY_URL` is a build-time
variable, and the sandbox hostname is not knowable at build time, so the client works the relay
out from the page it was served from:

| Served from | Relay it dials |
| --- | --- |
| `3000-abc123.e2b.app` | `https://3003-abc123.e2b.app` |
| `localhost:3000` | `http://localhost:3003` |
| `game.example.com:8080` | `http://game.example.com:3003` |
| anything else | `/?XTransformPort=3003` (reverse-proxy transform) |

An explicit `NEXT_PUBLIC_LOBBY_URL` always overrides this. A wrong guess costs nothing: the
socket fails to connect and the online screen says no server is available, while the rest of the
game is untouched.

Two things do **not** survive a sandbox restart: `node_modules` and `out/`. Bring it back with:

```bash
npm ci && npm run preview:full
```

A sandbox URL lives as long as the sandbox does. For a permanent address, use one of the hosts
below.

---

## Environment variables

All of these are read at **build** time (they are `NEXT_PUBLIC_`, so they are baked into the
bundle the browser downloads).

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | `""` | Sub-directory the site is served from, e.g. `/rift-brawl` for a GitHub project page. Leave empty for a domain root. |
| `NEXT_PUBLIC_SITE_URL` | `https://qynl.github.io/rift-brawl` | Canonical URL. Used for the sitemap, OpenGraph and structured data, i.e. what a shared link looks like. |
| `NEXT_PUBLIC_LOBBY_URL` | *(unset)* | Where the online lobby relay lives. Unset means online play is unavailable; nothing else is affected. |
| `NEXT_OUTPUT` | `export` | Set to `standalone` for a Node server build instead of static files. |

Getting `NEXT_PUBLIC_BASE_PATH` wrong is the one way to break the deploy: every asset 404s and
you get a black page. If that happens, check that the paths in `out/index.html` match where the
site actually lives.

---

## GitHub Pages (free, public URL, automatic)

A workflow is already committed at `.github/workflows/deploy.yml`. It needs **one switch flipped
by a repo admin**, which an automated token is not allowed to do:

1. **Settings → Pages → Build and deployment → Source → "GitHub Actions"**
2. Push to `main` — merging the working branch counts.

Everything before that switch already passes on CI (typecheck, determinism, render smoke and the
export itself); `configure-pages` is the only step that fails, and only because the site does not
exist yet. Neither the workflow's own `GITHUB_TOKEN` nor an app token is permitted to create it,
so a human has to click it once.

The workflow also triggers on `arena/**` branches, but the `github-pages` environment only
accepts deployments from the default branch unless you widen its deployment-branch rule — so in
practice, merge to `main`.

The site publishes to `https://<owner>.github.io/<repo>/` — for this repo,
**https://qynl.github.io/rift-brawl/**.

The workflow typechecks, runs the determinism probe and the render smoke test before publishing,
so a broken build cannot go live. It sets the base path automatically from the repository name
and writes `.nojekyll` so Pages does not strip the `_next` directory.

To enable online play, add a repository variable `NEXT_PUBLIC_LOBBY_URL` (Settings → Secrets and
variables → Actions → Variables) pointing at your deployed relay.

**Custom domain?** Put a `CNAME` file in `public/` and change `NEXT_PUBLIC_BASE_PATH` in the
workflow to an empty string — a custom domain serves from the root.

## Netlify

`netlify.toml` is committed and correct.

- **Fastest:** run `npm run build` and drag the `out/` folder onto
  [app.netlify.com/drop](https://app.netlify.com/drop).
- **Continuous:** connect the repository; Netlify reads the config. Build `npm run build`,
  publish `out`.

## Vercel

`vercel.json` is committed. Import the repository, or:

```bash
npx vercel --prod
```

Vercel serves from a root domain, so the base path stays empty.

## Cloudflare Pages / S3 / nginx / anything else

```bash
npm run build          # -> out/
```

Upload `out/`. Two headers are worth setting:

- `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable` (content-hashed)
- `/sw.js` → `Cache-Control: no-cache` (otherwise players get stuck on an old worker)

`tools/serve.mjs` already does both if you are serving it yourself.

## Docker

```bash
docker compose up --build        # game on :3000, lobby on :3003
```

Or the game alone:

```bash
docker build -t rift-brawl .
docker run -p 3000:3000 rift-brawl
```

The runtime image carries no dependencies at all — just the exported files and the ~120-line
static server.

---

## Online play

Online is the only piece that needs something running. The relay is deliberately tiny: it passes
inputs between clients, holds no game state, and can run on the cheapest box available.

```bash
npm run lobby          # :3003 socket.io, :3004 /healthz
```

Then rebuild the game with `NEXT_PUBLIC_LOBBY_URL=https://your-relay.example.com`.

Hardening already in place: per-connection rate limiting (60 messages / 10 s), a 30-minute room
TTL, a 64 KB payload cap, and a maximum of 4 players per room. The health probe is on a separate
port because Socket.IO is mounted at `/` and swallows every request on its own.

Keep in mind the relay is host-authoritative at 30 Hz with interpolation, so remote latency is a
full round trip. Rollback is the planned fix and the deterministic replay system already proves
the simulation supports it — see `docs/PROGRESS.md`.

---

## Checking a deploy

```bash
curl -sI https://your-site/                     # 200, text/html
curl -s  https://your-site/ | grep -o og:image  # metadata survived the build
curl -sI https://your-site/manifest.webmanifest # 200, application/manifest+json
curl -sI https://your-site/sw.js                # 200, Cache-Control: no-cache
```

Then open it and check the browser console is clean. The most common failure is a wrong base
path, and it shows up immediately as 404s on `/_next/static/*`.
