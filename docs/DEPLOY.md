# Deploying RIFT BRAWL

RIFT BRAWL is a **static site**. There is no server, no database and no API: the fighters, the
stages, the audio and the entire simulation are generated in the browser at runtime. `npm run
build` produces an `out/` folder and any host on earth can serve it.

The one exception is **online multiplayer**, which needs the small Socket.IO relay in
`mini-services/lobby-service`. Everything else — single player, local versus, arcade, survival,
training, challenges, replays — works with no backend at all, and offline once the service worker
has cached the shell.

```
npm run build     # -> out/    static export (the default)
npm start         # serve out/ on http://0.0.0.0:3000
```

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
2. Push to `main` (or run the workflow manually from the Actions tab).

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
