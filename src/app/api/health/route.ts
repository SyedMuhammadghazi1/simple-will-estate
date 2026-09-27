import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe — no dependencies. */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
