import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/env";
import { runSigningReminders } from "@/jobs/signing-reminders";
import { errorInfo, logger } from "@/server/logger";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runSigningReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: errorInfo(err) }, "signing reminders job failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = handle;
/** Vercel Cron issues GET requests (with the same Authorization header). */
export const GET = handle;
