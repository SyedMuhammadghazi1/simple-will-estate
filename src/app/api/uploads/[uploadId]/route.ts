import { withErrorHandling } from "@/server/http";
import { readUpload } from "@/server/services/execution";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  "uploads.get",
  async (req: Request, ctx: { params: Promise<{ uploadId: string }> }) => {
    const actor = await requireApiActor(req);
    const { uploadId } = await ctx.params;
    const file = await readUpload(actor, uploadId);
    const safeName = file.filename.replace(/["\\\r\n]/g, "");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
