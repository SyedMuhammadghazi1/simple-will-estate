import "server-only";
import { getEnv } from "@/env";
import { resolveClientIp } from "@/lib/client-ip";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The client's IP per CLIENT_IP_HEADER / TRUSTED_PROXY_HOPS (see src/lib/client-ip.ts), or null
 * when it can't be determined. Every IP the app uses comes from here.
 */
export function clientIp(headers: Headers): string | null {
  const env = getEnv();
  return resolveClientIp(headers, { header: env.CLIENT_IP_HEADER, hops: env.TRUSTED_PROXY_HOPS });
}

export function requestMeta(headers: Headers): RequestMeta {
  return {
    ip: clientIp(headers),
    userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/**
 * The only header Better Auth reads the client IP from (`advanced.ipAddress` in auth.ts). It is
 * internal: authHeaders() always overwrites or removes it, so a value sent by a client is never
 * used.
 */
export const AUTH_CLIENT_IP_HEADER = "x-plainwill-client-ip";

/** Request headers to hand to Better Auth, carrying the IP resolved by clientIp(). */
export function authHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  const ip = clientIp(headers);
  if (ip) out.set(AUTH_CLIENT_IP_HEADER, ip);
  else out.delete(AUTH_CLIENT_IP_HEADER);
  return out;
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
