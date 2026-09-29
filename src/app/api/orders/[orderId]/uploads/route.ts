import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { ForbiddenError, isAppError, PayloadTooLargeError, ValidationError } from "@/server/errors";
import { readBodyCapped } from "@/server/http";
import { errorInfo, logger } from "@/server/logger";
import { isSameOrigin } from "@/server/request";
import { uploadSignedWill } from "@/server/services/execution";
import { requireApiActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** Multipart overhead allowed on top of the file itself. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const TOO_LARGE = "The file is larger than 10 MB.";

/** Reads the form, giving up as soon as the body exceeds MAX_BODY_BYTES (`req.formData()` wouldn't). */
async function readForm(req: Request): Promise<FormData> {
  return new Response(await readBodyCapped(req, MAX_BODY_BYTES, TOO_LARGE), {
    headers: { "content-type": req.headers.get("content-type") ?? "" },
  }).formData();
}

/**
 * Upload of a signed will scan. Accepts a regular multipart form post (works without JS) and
 * redirects back to the order page; `Accept: application/json` clients get JSON instead.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/dashboard/orders/${orderId}?${query}`, req.url), 303);
  try {
    if (!isSameOrigin(req.headers)) throw new ForbiddenError("Cross-origin upload rejected.");
    const actor = await requireApiActor(req);
    const form = await readForm(req);
    const file = form.get("file");
    const willId = String(form.get("willId") ?? "");
    if (!(file instanceof File) || file.size === 0)
      throw new ValidationError("Choose a file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeError(TOO_LARGE);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadSignedWill(actor, orderId, willId, { bytes, filename: file.name });
    return wantsJson
      ? NextResponse.json({ ok: true, id: result.id }, { status: 201 })
      : back("uploaded=1");
  } catch (err) {
    if (isAppError(err)) {
      if (wantsJson) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.status },
        );
      }
      if (err.status === 401) {
        return NextResponse.redirect(
          new URL(`/sign-in?next=/dashboard/orders/${orderId}`, req.url),
          303,
        );
      }
      return back(`uploadError=${encodeURIComponent(err.message)}`);
    }
    logger.error({ err: errorInfo(err) }, "upload failed");
    return wantsJson
      ? NextResponse.json(
          { error: { code: "internal_error", message: "Upload failed." } },
          { status: 500 },
        )
      : back(`uploadError=${encodeURIComponent("Upload failed. Please try again.")}`);
  }
}
