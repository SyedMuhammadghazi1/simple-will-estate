import { NotFoundError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { isDocumentKind, renderDraftPreview } from "@/server/services/documents";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** Watermarked DRAFT preview of the current answers (available before payment). */
export const GET = withErrorHandling(
  "wills.preview",
  async (req: Request, ctx: { params: Promise<{ willId: string }> }) => {
    const actor = await requireApiActor(req);
    const { willId } = await ctx.params;
    const kind = new URL(req.url).searchParams.get("kind") ?? "will";
    if (!isDocumentKind(kind)) throw new NotFoundError();
    const { bytes, filename } = await renderDraftPreview(actor, willId, kind);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
);
