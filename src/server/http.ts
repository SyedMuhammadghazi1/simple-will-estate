import "server-only";
import { NextResponse } from "next/server";
import { isAppError, PayloadTooLargeError, RateLimitedError } from "./errors";
import { errorInfo, logger } from "./logger";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: typed errors → JSON responses, unknown errors → generic 500. */
export function withErrorHandling<C = undefined>(
  name: string,
  handler: Handler<C>,
): (req: Request, ctx?: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx as C);
    } catch (err) {
      if (isAppError(err)) {
        const res = NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.status },
        );
        if (err instanceof RateLimitedError) {
          res.headers.set("Retry-After", String(err.retryAfterSeconds));
        }
        return res;
      }
      logger.error({ err: errorInfo(err), route: name }, "unhandled route error");
      return NextResponse.json(
        { error: { code: "internal_error", message: "Something went wrong." } },
        { status: 500 },
      );
    }
  };
}

/**
 * Reads a request body into memory, giving up (PayloadTooLargeError → 413) as soon as it exceeds
 * `maxBytes`. Content-Length is only a hint (a chunked request has none), and `req.text()`,
 * `req.json()` or `req.formData()` would buffer any amount.
 */
export async function readBodyCapped(
  req: Request,
  maxBytes: number,
  message?: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new PayloadTooLargeError(message);
  if (Number(req.headers.get("content-length") ?? "0") > maxBytes) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) break;
    size += next.value.byteLength;
    if (size > maxBytes) {
      await reader?.cancel();
      throw tooLarge();
    }
    chunks.push(next.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
