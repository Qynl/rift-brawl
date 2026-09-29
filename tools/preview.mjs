#!/usr/bin/env node
// ============ RIFT BRAWL — one-command preview ============
//
// Brings the whole game up on a sandbox/VM the way a person would want it:
//
//   node tools/preview.mjs               build if needed, serve out/ on :3000
//   node tools/preview.mjs --with-lobby  ...and run the online relay on :3003
//   node tools/preview.mjs --rebuild     force a fresh build first
//
// Everything binds to 0.0.0.0, because the point of a preview is that someone
// else can open it. The static server and the relay are separate processes on
// purpose: the game works perfectly with the relay dead, and one crashing must
// never take the other down.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

const PORT = Number(process.env.PORT || 3000);
const LOBBY_PORT = Number(process.env.LOBBY_PORT || 3003);
const OUT = path.join(ROOT, 'out');

const children = [];

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', ...opts });
    c.on('error', reject);
    c.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

function keepAlive(name, cmd, cmdArgs, env) {
  const c = spawn(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
  });
  children.push(c);
  c.on('exit', (code) => {
    // A relay that dies is survivable; the game server dying is not.
    console.error(`[preview] ${name} exited with ${code ?? 'signal'}`);
    if (name === 'site') shutdown(code ?? 1);
  });
  return c;
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const needsBuild = has('--rebuild') || !existsSync(path.join(OUT, 'index.html'));
if (needsBuild) {
  console.log('[preview] building the static export...');
  await run('npx', ['next', 'build']);
} else {
  console.log('[preview] reusing the existing out/ (pass --rebuild to force)');
}

keepAlive('site', process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], {
  SERVE_DIR: OUT,
  PORT: String(PORT),
  HOST: '0.0.0.0',
});
console.log(`[preview] game   -> http://0.0.0.0:${PORT}`);

if (has('--with-lobby')) {
  keepAlive(
    'lobby',
    process.execPath,
    [path.join(ROOT, 'mini-services', 'lobby-service', 'server.mjs')],
    { PORT: String(LOBBY_PORT) },
  );
  console.log(
    `[preview] lobby  -> :${LOBBY_PORT} (health on :${LOBBY_PORT + 1}/healthz)`,
  );
  console.log(
    '[preview] the client finds the relay from the page host, so online play' +
      '\n[preview] works on a preview URL with no rebuild.',
  );
}
