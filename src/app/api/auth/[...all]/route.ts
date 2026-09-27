import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { hitRateLimit, ipBucket, RATE_LIMITS, type RateLimitRule } from "@/server/rate-limit";
import { requestMeta } from "@/server/request";

export const dynamic = "force-dynamic";

function handlers() {
  return toNextJsHandler(getAuth());
}

export async function GET(req: Request) {
  return handlers().GET(req);
}

/** Email in a sign-in body (JSON or form, like Better Auth accepts), normalized like signInAction. */
async function signInEmail(req: Request): Promise<string | null> {
  try {
    const type = req.headers.get("content-type") ?? "";
    let email: unknown = null;
    if (
      type.includes("application/x-www-form-urlencoded") ||
      type.includes("multipart/form-data")
    ) {
      email = (await req.clone().formData()).get("email");
    } else {
      const body: unknown = await req.clone().json();
      if (body && typeof body === "object" && "email" in body) email = body.email;
    }
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    return normalized || null;
  } catch {
    return null; // Better Auth rejects the malformed body itself.
  }
}

async function limit(rule: RateLimitRule, key: string): Promise<Response | null> {
  const result = await hitRateLimit(rule, key);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: { code: "rate_limited", message: "Too many requests. Please wait a moment." } },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

/** Rate limits sign-in / sign-up / other auth writes before handing off to Better Auth. */
export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  const isSignIn = path.endsWith("/sign-in/email");
  const rule = isSignIn
    ? RATE_LIMITS.signIn
    : path.endsWith("/sign-up/email")
      ? RATE_LIMITS.signUp
      : RATE_LIMITS.authOther;
  const limited = await limit(...ipBucket(rule, requestMeta(req.headers).ip));
  if (limited) return limited;
  if (isSignIn) {
    // Per-account bucket shared with signInAction, so guessing one account's password from many
    // IPs (or through this public endpoint instead of the form) is throttled too.
    const email = await signInEmail(req);
    const limitedAccount = email ? await limit(RATE_LIMITS.signIn, `email:${email}`) : null;
    if (limitedAccount) return limitedAccount;
  }
  return handlers().POST(req);
}
