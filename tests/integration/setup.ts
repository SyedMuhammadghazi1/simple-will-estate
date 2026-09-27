import { afterAll, beforeEach, vi } from "vitest";
import { applyTestEnv } from "./test-env";

applyTestEnv();

// Server components' request APIs are unavailable outside Next; services never need them.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => {
    throw new Error("`cookies` was called outside a request scope.");
  },
}));

const TABLES = [
  "account_deletion_requests",
  "email_log",
  "rate_limits",
  "stripe_events",
  "audit_log",
  "order_status_history",
  "order_notes",
  "filing_tasks",
  "uploads",
  "documents",
  "will_versions",
  "wills",
  "orders",
  "verification",
  "account",
  "session",
  '"user"',
];

beforeEach(async () => {
  const { getPool } = await import("@/db");
  await getPool().query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  const { closeDb } = await import("@/db");
  await closeDb();
});
