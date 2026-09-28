import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
