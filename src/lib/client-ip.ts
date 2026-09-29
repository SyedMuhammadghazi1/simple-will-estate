import { isIP } from "node:net";

/**
 * Client IP resolution — the ONLY place that reads forwarding headers. Used for rate limits,
 * audit log entries and the IP Better Auth records on sessions (via src/server/request.ts).
 *
 * - `header` (CLIENT_IP_HEADER): a single header the hosting platform sets and clients cannot
 *   spoof (`x-real-ip` on Vercel, `fly-client-ip` on Fly.io, `cf-connecting-ip` behind
 *   Cloudflare). When set, nothing else is read.
 * - otherwise `hops` (TRUSTED_PROXY_HOPS): how many reverse proxies in front of the app append the
 *   address they received the request from to X-Forwarded-For. Everything left of those entries
 *   was sent by the client and can be forged, so the client IP is the entry `hops` positions
 *   from the RIGHT. 0 never trusts the header (the IP is unknown).
 *
 * Returns null when the IP is unknown or not a valid IPv4/IPv6 address.
 */
export interface ClientIpConfig {
  header?: string | undefined;
  hops: number;
}

export const FORWARDED_FOR_HEADER = "x-forwarded-for";

/** Canonical form of an IP address, or null if `value` isn't one. */
export function normalizeIp(value: string | null | undefined): string | null {
  let ip = value?.trim() ?? "";
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1); // [2001:db8::1]
  const zone = ip.indexOf("%"); // fe80::1%eth0
  if (zone !== -1) ip = ip.slice(0, zone);
  const version = isIP(ip);
  if (version === 0) return null;
  if (version === 4) return ip;
  ip = ip.toLowerCase();
  // IPv4-mapped IPv6 (what Node reports for IPv4 clients on a dual-stack socket).
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1];
  return mapped && isIP(mapped) === 4 ? mapped : ip;
}

export function resolveClientIp(
  headers: Pick<Headers, "get">,
  config: ClientIpConfig,
): string | null {
  if (config.header) return normalizeIp(headers.get(config.header)?.split(",")[0]);
  if (!Number.isInteger(config.hops) || config.hops < 1) return null;
  const entries = headers.get(FORWARDED_FOR_HEADER)?.split(",") ?? [];
  if (entries.length < config.hops) return null;
  return normalizeIp(entries[entries.length - config.hops]);
}
