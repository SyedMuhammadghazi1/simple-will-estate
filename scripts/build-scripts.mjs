// Bundles operational scripts into self-contained ESM files for the production image.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  logLevel: "info",
  external: ["pg-native"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ["scripts/migrate.ts"], outfile: "dist/migrate.mjs" });
