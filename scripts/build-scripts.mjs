// Bundles operational scripts into self-contained ESM files for the production image:
//   dist/migrate.mjs                 – applies SQL migrations from ./drizzle
//   dist/job-signing-reminders.mjs   – runs the signing-reminder job once
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  logLevel: "warning",
  tsconfig: "tsconfig.scripts.json",
  external: ["pg-native"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ["scripts/migrate.ts"], outfile: "dist/migrate.mjs" });
await build({
  ...common,
  entryPoints: ["scripts/job-signing-reminders.ts"],
  outfile: "dist/job-signing-reminders.mjs",
  // dotenv is optional at runtime (env comes from the container).
  external: ["pg-native"],
});
console.log("built dist/migrate.mjs and dist/job-signing-reminders.mjs");
