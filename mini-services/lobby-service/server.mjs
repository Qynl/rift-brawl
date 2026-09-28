// Node entrypoint for the lobby relay.
// The service is written in TypeScript and imports shared protocol types from
// the game source, so it is loaded through jiti (the same loader the offline
// simulation harness uses). This replaces the previous `bun --hot` script,
// which could not run in environments without Bun installed.
import { createJiti } from '../../node_modules/jiti/lib/jiti.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const jiti = createJiti(import.meta.url, {
  alias: { '@': ROOT + 'src' },
  interopDefault: true,
});

await jiti.import(new URL('./index.ts', import.meta.url).pathname);
