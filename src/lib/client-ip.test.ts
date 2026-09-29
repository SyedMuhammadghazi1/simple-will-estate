import { describe, expect, it } from "vitest";
import { normalizeIp, resolveClientIp } from "./client-ip";

const xff = (value: string) => new Headers({ "X-Forwarded-For": value });

describe("resolveClientIp with TRUSTED_PROXY_HOPS", () => {
  it("takes the entry appended by the proxy in front of the app, ignoring a spoofed leftmost entry", () => {
    const headers = xff("6.6.6.6, 203.0.113.7");
    expect(resolveClientIp(headers, { hops: 1 })).toBe("203.0.113.7");
    expect(resolveClientIp(xff("203.0.113.7"), { hops: 1 })).toBe("203.0.113.7");
    // Several header lines are one list, in order.
    const lines = new Headers([
      ["X-Forwarded-For", "6.6.6.6"],
      ["X-Forwarded-For", "198.51.100.4"],
    ]);
    expect(resolveClientIp(lines, { hops: 1 })).toBe("198.51.100.4");
  });

  it("skips one entry per trusted proxy (hops = 2)", () => {
    // client-supplied, real client (added by the CDN), CDN address (added by the load balancer)
    const headers = xff("6.6.6.6, 203.0.113.7, 10.0.0.2");
    expect(resolveClientIp(headers, { hops: 2 })).toBe("203.0.113.7");
    expect(resolveClientIp(headers, { hops: 3 })).toBe("6.6.6.6");
  });

  it("returns null when there are fewer entries than proxies, or no header", () => {
    expect(resolveClientIp(xff("203.0.113.7"), { hops: 2 })).toBeNull();
    expect(resolveClientIp(new Headers(), { hops: 1 })).toBeNull();
    expect(resolveClientIp(xff(""), { hops: 1 })).toBeNull();
  });

  it("never trusts X-Forwarded-For with hops = 0", () => {
    expect(resolveClientIp(xff("203.0.113.7"), { hops: 0 })).toBeNull();
    expect(resolveClientIp(xff("203.0.113.7"), { hops: -1 })).toBeNull();
  });

  it("rejects values that are not IP addresses", () => {
    for (const value of ["unknown", "203.0.113.7:4711", "999.1.1.1", "evil.example", "1.2.3"]) {
      expect(resolveClientIp(xff(`6.6.6.6, ${value}`), { hops: 1 })).toBeNull();
    }
    expect(resolveClientIp(xff("203.0.113.7, "), { hops: 1 })).toBeNull();
  });

  it("handles IPv6 clients", () => {
    expect(resolveClientIp(xff("6.6.6.6, 2001:DB8::1"), { hops: 1 })).toBe("2001:db8::1");
    expect(resolveClientIp(xff("[2001:db8::2]"), { hops: 1 })).toBe("2001:db8::2");
    expect(resolveClientIp(xff("::ffff:203.0.113.7"), { hops: 1 })).toBe("203.0.113.7");
  });
});

describe("resolveClientIp with CLIENT_IP_HEADER", () => {
  it("uses only the platform header (first value, trimmed)", () => {
    const headers = new Headers({
      "X-Real-IP": " 203.0.113.7 ",
      "X-Forwarded-For": "6.6.6.6, 198.51.100.4",
    });
    expect(resolveClientIp(headers, { header: "x-real-ip", hops: 1 })).toBe("203.0.113.7");
    const list = new Headers({ "CF-Connecting-IP": "203.0.113.8, 6.6.6.6" });
    expect(resolveClientIp(list, { header: "cf-connecting-ip", hops: 1 })).toBe("203.0.113.8");
  });

  it("does not fall back to X-Forwarded-For when the header is missing or invalid", () => {
    const headers = xff("203.0.113.7");
    expect(resolveClientIp(headers, { header: "fly-client-ip", hops: 1 })).toBeNull();
    const invalid = new Headers({ "Fly-Client-IP": "not-an-ip", "X-Forwarded-For": "203.0.113.7" });
    expect(resolveClientIp(invalid, { header: "fly-client-ip", hops: 1 })).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("canonicalizes valid addresses and rejects everything else", () => {
    expect(normalizeIp(" 198.51.100.4 ")).toBe("198.51.100.4");
    expect(normalizeIp("FE80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("::ffff:999.1.1.1")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});
