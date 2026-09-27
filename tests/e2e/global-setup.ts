import { execSync } from "node:child_process";
import { Pool } from "pg";
import { E2E_DATABASE_URL, E2E_ENV } from "./e2e-env";

/** Fresh, migrated and seeded database for the end-to-end run. */
export default async function globalSetup() {
  const dbName = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!/test|e2e/i.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const env = { ...process.env, ...E2E_ENV, NODE_ENV: "test" } as NodeJS.ProcessEnv;
  execSync("npm run db:migrate", { env, stdio: "inherit" });
  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
    if (tables) await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
  execSync("npm run db:seed", { env, stdio: "inherit" });
}
