import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { authBuckets, hitRateLimit, RATE_LIMITS, type RateLimitRule } from "@/server/rate-limit";
import { authHeaders, clientIp } from "@/server/request";

export const dynamic = "force-dynamic";

function handlers() {
  return toNextJsHandler(getAuth());
}

export async function GET(req: Request) {
  return handlers().GET(new Request(req, { headers: authHeaders(req.headers) }));
}

/** Endpoints that act on the account named in the body, with their per-IP and per-account limits. */
const ACCOUNT_ENDPOINTS: { path: string; ipRule: RateLimitRule; accountRule: RateLimitRule }[] = [
  { path: "/sign-in/email", ipRule: RATE_LIMITS.signIn, accountRule: RATE_LIMITS.signIn },
  { path: "/sign-up/email", ipRule: RATE_LIMITS.signUp, accountRule: RATE_LIMITS.signUp },
  {
    path: "/request-password-reset",
    ipRule: RATE_LIMITS.authOther,
    accountRule: RATE_LIMITS.passwordReset,
  },
];

/** Email in the body (JSON or form, like Better Auth accepts), normalized like the auth actions. */
async function bodyEmail(req: Request): Promise<string | null> {
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

/**
 * Rate limits auth writes before handing off to Better Auth: per IP, and per account for
 * sign-in / sign-up / password reset (the same buckets as the auth server actions), so guessing
 * one account's password from many IPs — or through this public endpoint instead of the forms —
 * is throttled too.
 */
export async function POST(req: Request) {
  const forwarded = new Request(req.url, {
    method: req.method,
    headers: authHeaders(req.headers),
    body: await req.arrayBuffer(),
  });
  const path = new URL(req.url).pathname;
  const endpoint = ACCOUNT_ENDPOINTS.find((e) => path.endsWith(e.path));
  const email = endpoint ? await bodyEmail(forwarded) : null;
  const buckets = authBuckets(
    endpoint?.ipRule ?? RATE_LIMITS.authOther,
    clientIp(req.headers),
    endpoint && email ? { rule: endpoint.accountRule, email } : undefined,
  );
  for (const bucket of buckets) {
    const limited = await limit(...bucket);
    if (limited) return limited;
  }
  return handlers().POST(forwarded);
}
