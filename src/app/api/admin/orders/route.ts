import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/http";
import { adminListOrders } from "@/server/services/admin";
import { requireApiActor, STAFF_ROLES } from "@/server/session";

export const dynamic = "force-dynamic";

/** Staff-only JSON order search (used by ops tooling). */
export const GET = withErrorHandling("admin.orders", async (req: Request) => {
  const actor = await requireApiActor(req, STAFF_ROLES);
  const p = new URL(req.url).searchParams;
  const result = await adminListOrders(actor, {
    status: p.get("status") ?? undefined,
    plan: p.get("plan") ?? undefined,
    q: p.get("q") ?? undefined,
    page: Number(p.get("page") ?? "1") || 1,
  });
  return NextResponse.json(result);
});
