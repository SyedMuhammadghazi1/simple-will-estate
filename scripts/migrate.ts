/**
 * Applies committed SQL migrations from ./drizzle (or $MIGRATIONS_DIR).
 *
 *   npm run db:migrate                 # dev (tsx)
 *   node dist/migrate.mjs              # production image (bundled by scripts/build-scripts.mjs)
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    try {
      const dotenv = await import("dotenv");
      dotenv.config({ quiet: true });
    } catch {
      // dotenv is a dev dependency; production images pass env vars directly.
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./drizzle";
  const pool = new Pool({ connectionString: url, max: 1 });
  const started = Date.now();
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log(
      JSON.stringify({ level: "info", msg: "migrations applied", ms: Date.now() - started }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "migration failed",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
