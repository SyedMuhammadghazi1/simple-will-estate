import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { errorInfo, logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Readiness probe — checks the database. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ready", checks: { database: "ok" } });
  } catch (err) {
    logger.error({ err: errorInfo(err) }, "readiness check failed");
    return NextResponse.json(
      { status: "unavailable", checks: { database: "error" } },
      { status: 503 },
    );
  }
}
