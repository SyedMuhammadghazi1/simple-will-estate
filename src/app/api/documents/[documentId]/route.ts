import { withErrorHandling } from "@/server/http";
import { readDocument } from "@/server/services/documents";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  "documents.get",
  async (req: Request, ctx: { params: Promise<{ documentId: string }> }) => {
    const actor = await requireApiActor(req);
    const { documentId } = await ctx.params;
    const { bytes, filename } = await readDocument(actor, documentId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
