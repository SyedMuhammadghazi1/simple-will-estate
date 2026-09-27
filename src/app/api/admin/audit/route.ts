import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/http";
import { adminListAudit } from "@/server/services/admin";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** Admin-only audit log feed. */
export const GET = withErrorHandling("admin.audit", async (req: Request) => {
  const actor = await requireApiActor(req, ["admin"]);
  const p = new URL(req.url).searchParams;
  const result = await adminListAudit(actor, {
    action: p.get("action") ?? undefined,
    orderId: p.get("orderId") ?? undefined,
    page: Number(p.get("page") ?? "1") || 1,
  });
  return NextResponse.json(result);
});
