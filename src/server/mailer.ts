import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { getEnv } from "@/env";
import { errorInfo, logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const env = getEnv();
  if (!env.SMTP_HOST) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transporter;
}

/** Sends an email via SMTP, or logs it when SMTP is not configured (development). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    const preview = process.env.NODE_ENV === "production" ? undefined : message.text.slice(0, 2000);
    logger.info({ subject: message.subject, preview }, "email (SMTP not configured — not sent)");
    return;
  }
  await t.sendMail({
    from: getEnv().EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  logger.info({ subject: message.subject }, "email sent");
}

/**
 * Sends a logical email at most once (keyed by `dedupeKey`). Failed sends can be retried by
 * calling again with the same key.
 */
export async function sendEmailOnce(
  dedupeKey: string,
  kind: string,
  message: EmailMessage,
  refs: { orderId?: string | null; userId?: string | null } = {},
): Promise<"sent" | "skipped" | "failed"> {
  const claimed = await db
    .insert(emailLog)
    .values({
      dedupeKey,
      kind,
      status: "sent",
      orderId: refs.orderId ?? null,
      userId: refs.userId ?? null,
    })
    .onConflictDoUpdate({
      target: emailLog.dedupeKey,
      set: { status: "sent", error: null },
      setWhere: sql`${emailLog.status} = 'failed'`,
    })
    .returning({ id: emailLog.id });
  if (claimed.length === 0) return "skipped";
  try {
    await sendEmail(message);
    return "sent";
  } catch (err) {
    logger.error({ err: errorInfo(err), kind }, "email send failed");
    await db
      .update(emailLog)
      .set({ status: "failed", error: errorInfo(err).message.slice(0, 500) })
      .where(sql`${emailLog.dedupeKey} = ${dedupeKey}`);
    return "failed";
  }
}
