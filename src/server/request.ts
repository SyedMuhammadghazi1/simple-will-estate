import "server-only";
import { getEnv } from "@/env";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Client IP: X-Forwarded-For is only trusted when TRUST_PROXY=true. */
export function requestMeta(headers: Headers): RequestMeta {
  const trustProxy = getEnv().TRUST_PROXY;
  let ip: string | null = null;
  if (trustProxy) {
    ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip");
  }
  return {
    ip: ip || null,
    userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Rejects cross-origin state-changing requests to route handlers (CSRF defence in depth). */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true; // same-origin form posts from older browsers / non-browser clients
  try {
    const allowed = new URL(getEnv().APP_URL).origin;
    const host = headers.get("host");
    const originUrl = new URL(origin);
    return originUrl.origin === allowed || (host !== null && originUrl.host === host);
  } catch {
    return false;
  }
}
