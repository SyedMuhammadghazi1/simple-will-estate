import { withErrorHandling } from "@/server/http";
import { exportUserData } from "@/server/services/account";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("account.export", async (req: Request) => {
  const actor = await requireApiActor(req);
  const data = await exportUserData(actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
