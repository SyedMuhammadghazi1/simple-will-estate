import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  var __plainwillPool: Pool | undefined;
  var __plainwillDb: Database | undefined;
}

function createPool(): Pool {
  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => {
    console.error("postgres pool error", err.message);
  });
  return pool;
}

/** Shared pool (cached on globalThis so dev hot-reload doesn't leak connections). */
export function getPool(): Pool {
  globalThis.__plainwillPool ??= createPool();
  return globalThis.__plainwillPool;
}

function getDb(): Database {
  globalThis.__plainwillDb ??= drizzle(getPool(), { schema });
  return globalThis.__plainwillDb;
}

/** Lazily-initialised Drizzle client; importing this module never opens a connection. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export async function closeDb(): Promise<void> {
  const pool = globalThis.__plainwillPool;
  globalThis.__plainwillPool = undefined;
  globalThis.__plainwillDb = undefined;
  if (pool) await pool.end();
}

export { schema };
