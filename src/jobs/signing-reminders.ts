import "server-only";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, user } from "@/db/schema";
import { SIGNING_REMINDER_AFTER_DAYS, SIGNING_REMINDER_INTERVAL_DAYS } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { SYSTEM_ACTOR, writeAudit } from "@/server/audit";
import { signingReminderEmail } from "@/server/emails";
import { errorInfo, logger } from "@/server/logger";
import { sendEmail } from "@/server/mailer";

export interface SigningReminderResult {
  candidates: number;
  sent: number;
  failed: number;
}

/**
 * Reminds customers whose documents have been ready for 7+ days without being signed.
 * Idempotent and safe to run concurrently: each order is claimed with a conditional UPDATE, so
 * an order is reminded at most once per 7-day interval no matter how often the job runs.
 */
export async function runSigningReminders(now = new Date()): Promise<SigningReminderResult> {
  const readyBefore = addDays(now, -SIGNING_REMINDER_AFTER_DAYS);
  const remindedBefore = addDays(now, -SIGNING_REMINDER_INTERVAL_DAYS);
  const due = and(
    inArray(orders.status, ["documents_ready", "awaiting_execution"]),
    lte(orders.documentsReadyAt, readyBefore),
    or(isNull(orders.lastSigningReminderAt), lte(orders.lastSigningReminderAt, remindedBefore)),
  );

  const candidates = await db
    .select({ id: orders.id, previous: orders.lastSigningReminderAt })
    .from(orders)
    .where(due)
    .limit(500);

  let sent = 0;
  let failed = 0;
  for (const { id, previous } of candidates) {
    // Claim: only one runner can move lastSigningReminderAt forward for this window.
    const [claimed] = await db
      .update(orders)
      .set({
        lastSigningReminderAt: now,
        signingReminderCount: sql`${orders.signingReminderCount} + 1`,
      })
      .where(and(eq(orders.id, id), due))
      .returning({
        id: orders.id,
        userId: orders.userId,
        documentsReadyAt: orders.documentsReadyAt,
      });
    if (!claimed) continue;
    try {
      const [u] = await db
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, claimed.userId));
      if (!u) continue;
      const days = Math.floor(
        (now.getTime() - (claimed.documentsReadyAt?.getTime() ?? now.getTime())) / 86_400_000,
      );
      await sendEmail(signingReminderEmail(u.email, u.name, claimed.id, days));
      await writeAudit(SYSTEM_ACTOR, {
        action: "reminder.signing_sent",
        targetType: "order",
        targetId: claimed.id,
        orderId: claimed.id,
        metadata: { days },
      });
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err: errorInfo(err), orderId: id }, "signing reminder failed");
      // Release the claim so the next run retries.
      await db
        .update(orders)
        .set({
          lastSigningReminderAt: previous,
          signingReminderCount: sql`greatest(${orders.signingReminderCount} - 1, 0)`,
        })
        .where(eq(orders.id, id));
    }
  }
  logger.info({ candidates: candidates.length, sent, failed }, "signing reminders run complete");
  return { candidates: candidates.length, sent, failed };
}
