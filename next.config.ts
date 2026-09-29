import type { NextConfig } from "next";

/**
 * RIFT BRAWL is a pure client-side game: no API routes, no server components
 * that read request state, no database. The art, the audio and the whole
 * simulation are produced in the browser at runtime.
 *
 * So the default build is a STATIC EXPORT — a folder of files that any host
 * will serve (GitHub Pages, Netlify, Cloudflare Pages, S3, nginx, a USB stick).
 * `NEXT_OUTPUT=standalone` switches to the Node server build instead, which is
 * what the Dockerfile uses when you want the game and the lobby relay behind
 * one origin.
 *
 * `NEXT_PUBLIC_BASE_PATH` handles being served from a sub-path, which is what
 * a GitHub project page does (https://user.github.io/rift-brawl). Leave it
 * empty for a root domain.
 */
const output = (process.env.NEXT_OUTPUT as NextConfig["output"]) ?? "export";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // Static hosts serve /path/ as /path/index.html; without this the export
  // produces /path.html and sub-path routing breaks on most of them.
  trailingSlash: output === "export",
  images: { unoptimized: output === "export" },
  // Type errors used to be ignored at build time, which meant a broken build
  // could ship. `npm run typecheck` is clean, so the safety net is back on.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Double-invoked effects in development surface mount/unmount bugs in the
  // engine attach/detach path early instead of in production.
  reactStrictMode: true,
};

export default nextConfig;
