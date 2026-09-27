/**
 * CLI entry for the signing-reminder job (same logic as POST /api/cron/signing-reminders).
 *
 *   npm run job:signing-reminders
 */
import "./load-env";
import { closeDb } from "@/db";
import { runSigningReminders } from "@/jobs/signing-reminders";

runSigningReminders()
  .then((result) => console.log(JSON.stringify({ job: "signing-reminders", ...result })))
  .catch((err: unknown) => {
    console.error("signing-reminders failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
