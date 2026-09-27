/**
 * Re-encrypts MUTABLE encrypted data with the current DATA_ENCRYPTION_KEY after a key rotation.
 *
 *   npm run job:reencrypt            # dry run (counts only)
 *   npm run job:reencrypt -- --apply # rewrite rows
 *
 * Immutable legal records (will_versions, documents) are protected by DB triggers and keep
 * their original key id — keep that key in DATA_ENCRYPTION_PREVIOUS_KEYS (see docs/RUNBOOK.md).
 */
import "./load-env";
import { closeDb } from "@/db";
import { reencryptMutableData } from "@/jobs/reencrypt";

reencryptMutableData({ apply: process.argv.includes("--apply") })
  .then((result) => console.log(JSON.stringify({ job: "reencrypt", ...result })))
  .catch((err: unknown) => {
    console.error("reencrypt failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
