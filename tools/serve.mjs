// ============ RIFT BRAWL — static file server ============
//
// `next start` cannot serve a static export, and pulling in a web framework to
// hand back a folder of files would be silly, so this is the whole server:
// Node's http module, correct MIME types, and cache headers that match how
// Next names its assets.
//
//   node tools/serve.mjs [--dir out] [--port 3000] [--host 0.0.0.0]
//
// Caching:
//   /_next/static/**  content-hashed by the build  -> immutable, one year
//   /sw.js            must be revalidated or users are stuck on an old worker
//   everything else   revalidate, but allow a cached copy while doing so

import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = resolve(flag('dir', process.env.SERVE_DIR ?? 'out'));
const PORT = Number(flag('port', process.env.PORT ?? 3000));
const HOST = flag('host', process.env.HOST ?? '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function cacheControl(urlPath) {
  if (urlPath.includes('/_next/static/')) return 'public, max-age=31536000, immutable';
  if (urlPath.endsWith('/sw.js')) return 'no-cache';
  if (/\.(png|jpe?g|svg|ico|woff2?)$/.test(urlPath)) return 'public, max-age=86400, must-revalidate';
  return 'no-cache';
}

/** Map a URL path onto a file inside ROOT, refusing anything that escapes it. */
function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]));
  if (clean.includes('\0')) return null;
  const abs = resolve(join(ROOT, clean));
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null; // path traversal

  const candidates = abs.endsWith(sep) || clean.endsWith('/')
    ? [join(abs, 'index.html')]
    : [abs, `${abs}.html`, join(abs, 'index.html')];

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

if (!existsSync(ROOT)) {
  console.error(`\n  ${ROOT} does not exist — run \`npm run build\` first.\n`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('method not allowed');
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  let file = resolveFile(urlPath);
  let status = 200;

  if (!file) {
    // Single-page app: unknown paths fall back to the shell, and a missing
    // shell is a genuine 404.
    file = resolveFile('/404.html') ?? resolveFile('/');
    status = 404;
  }
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  const { size } = statSync(file);
  res.writeHead(status, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': cacheControl(urlPath),
    'x-content-type-options': 'nosniff',
    // The preview environment embeds the site in an iframe; blocking that
    // would make the live preview show an empty box.
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  RIFT BRAWL · serving ${ROOT}`);
  console.log(`  http://${HOST}:${PORT}\n`);
});
