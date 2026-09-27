import "server-only";
import { NextResponse } from "next/server";
import { isAppError, RateLimitedError } from "./errors";
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
