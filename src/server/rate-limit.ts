import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { RateLimitedError } from "./errors";

/**
 * Postgres-backed fixed-window rate limiter. Works across multiple app instances because the
 * counter lives in the shared database (one upsert per request).
 */

export interface RateLimitRule {
  /** Logical bucket name, e.g. "auth:sign-in". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  signIn: { name: "auth:sign-in", limit: 10, windowSeconds: 60 },
  signUp: { name: "auth:sign-up", limit: 5, windowSeconds: 600 },
  passwordReset: { name: "auth:password-reset", limit: 5, windowSeconds: 900 },
  authOther: { name: "auth:other", limit: 30, windowSeconds: 60 },
  draftSave: { name: "draft:save", limit: 180, windowSeconds: 60 },
  checkout: { name: "checkout", limit: 10, windowSeconds: 600 },
  upload: { name: "upload", limit: 20, windowSeconds: 3600 },
  preview: { name: "preview", limit: 60, windowSeconds: 600 },
  export: { name: "account:export", limit: 5, windowSeconds: 3600 },
  orderCreate: { name: "order:create", limit: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function hitRateLimit(
  rule: RateLimitRule,
  identifier: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${rule.name}:${identifier}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
  );
  // Opportunistic cleanup of stale windows (cheap thanks to the window index).
  if (Math.random() < 0.01) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
  }
  return {
    allowed: count <= rule.limit,
    count,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  };
}

/**
 * Per-IP bucket, or null when the client IP is unknown (see clientIp in ./request). Endpoints
 * that act on an account (sign-in, sign-up, password reset) then rely on their per-account
 * bucket alone: a shared "unknown IP" bucket would let one client lock everyone out.
 */
export function ipBucket(rule: RateLimitRule, ip: string | null): [RateLimitRule, string] | null {
  return ip ? [rule, `ip:${ip}`] : null;
}

/**
 * For endpoints with no account to key on: per IP, or — when the IP is unknown — one bucket
 * shared by all such requests, with its limit scaled up as a global backstop.
 */
export function ipOrSharedBucket(rule: RateLimitRule, ip: string | null): [RateLimitRule, string] {
  return ipBucket(rule, ip) ?? [{ ...rule, limit: rule.limit * 20 }, "ip:unknown"];
}

/** Per-account bucket keyed by the normalized (trimmed, lower-case) email address. */
export function accountBucket(rule: RateLimitRule, email: string): [RateLimitRule, string] {
  return [rule, `email:${email.trim().toLowerCase()}`];
}

/**
 * Buckets for an auth request: per IP (when known) and, when it acts on an account, per account
 * — which is all that applies when the IP is unknown. Used by the auth route and server actions.
 */
export function authBuckets(
  ipRule: RateLimitRule,
  ip: string | null,
  account?: { rule: RateLimitRule; email: string },
): [RateLimitRule, string][] {
  if (!account) return [ipOrSharedBucket(ipRule, ip)];
  const perIp = ipBucket(ipRule, ip);
  return [...(perIp ? [perIp] : []), accountBucket(account.rule, account.email)];
}

/** Throws RateLimitedError when the limit is exceeded. */
export async function enforceRateLimit(rule: RateLimitRule, identifier: string): Promise<void> {
  const result = await hitRateLimit(rule, identifier);
  if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
}
