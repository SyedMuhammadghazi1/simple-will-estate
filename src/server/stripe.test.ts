import { describe, expect, it } from "vitest";
import { stripeConnectionOptions } from "./stripe";

describe("stripeConnectionOptions", () => {
  it("routes test keys to an emulator when configured", () => {
    expect(stripeConnectionOptions("sk_test_abc", "http://localhost:12111")).toEqual({
      host: "localhost",
      port: 12111,
      protocol: "http",
    });
  });

  it("never overrides the API host for live keys", () => {
    expect(stripeConnectionOptions("sk_live_abc", "http://localhost:12111")).toEqual({});
    expect(stripeConnectionOptions("rk_live_abc", "http://evil.example")).toEqual({});
  });

  it("uses Stripe's default host when no override is set", () => {
    expect(stripeConnectionOptions("sk_test_abc", undefined)).toEqual({});
  });
});
