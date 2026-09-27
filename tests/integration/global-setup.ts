import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TEST_DATABASE_URL, applyTestEnv } from "./test-env";

/** Applies migrations to the test database once per test run. */
export default async function setup() {
  applyTestEnv();
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
