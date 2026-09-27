import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { hitRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { requestMeta } from "@/server/request";

export const dynamic = "force-dynamic";

function handlers() {
  return toNextJsHandler(getAuth());
}

export async function GET(req: Request) {
  return handlers().GET(req);
}

/** Rate limits sign-in / sign-up / other auth writes before handing off to Better Auth. */
export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  const rule = path.endsWith("/sign-in/email")
    ? RATE_LIMITS.signIn
    : path.endsWith("/sign-up/email")
      ? RATE_LIMITS.signUp
      : RATE_LIMITS.authOther;
  const ip = requestMeta(req.headers).ip ?? "unknown";
  const result = await hitRateLimit(rule, `ip:${ip}`);
  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many requests. Please wait a moment." } },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return handlers().POST(req);
}
