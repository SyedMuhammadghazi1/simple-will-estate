import { afterEach, describe, expect, it } from "vitest";
import { getEnv, parseServerEnv, resetEnvCache, shouldSkipEnvValidation } from "./env";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
} as const;

describe("env validation", () => {
  it("accepts a minimal development config and applies defaults", () => {
    const env = parseServerEnv({ ...base });
    expect(env.PAYMENTS_MODE).toBe("stripe");
    expect(env.DATA_ENCRYPTION_KEY_ID).toBe("k1");
    expect(env.APP_URL).toBe("http://localhost:3001");
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ ...base, LOG_LEVEL: "", CRON_SECRET: "", STRIPE_SECRET_KEY: "" });
    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("rejects a short auth secret and a wrong-size encryption key", () => {
    expect(() => parseServerEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() =>
      parseServerEnv({ ...base, DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("configures client IP resolution with a platform header or a proxy hop count", () => {
    const defaults = parseServerEnv({ ...base });
    expect(defaults.TRUSTED_PROXY_HOPS).toBe(1);
    expect(defaults.CLIENT_IP_HEADER).toBeUndefined();
    const env = parseServerEnv({
      ...base,
      CLIENT_IP_HEADER: " X-Real-IP ",
      TRUSTED_PROXY_HOPS: "2",
    });
    expect(env.CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(env.TRUSTED_PROXY_HOPS).toBe(2);
    expect(parseServerEnv({ ...base, TRUSTED_PROXY_HOPS: "0" }).TRUSTED_PROXY_HOPS).toBe(0);
    expect(() => parseServerEnv({ ...base, TRUSTED_PROXY_HOPS: "-1" })).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
    expect(() => parseServerEnv({ ...base, TRUSTED_PROXY_HOPS: "true" })).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
    // The leftmost X-Forwarded-For entry is whatever the client sent.
    expect(() => parseServerEnv({ ...base, CLIENT_IP_HEADER: "X-Forwarded-For" })).toThrow(
      /CLIENT_IP_HEADER/,
    );
    expect(() => parseServerEnv({ ...base, CLIENT_IP_HEADER: "x-real-ip, fly-client-ip" })).toThrow(
      /CLIENT_IP_HEADER/,
    );
  });

  it("forbids the payment bypass in production", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        NODE_ENV: "production",
        PAYMENTS_MODE: "test-bypass",
        STRIPE_SECRET_KEY: "sk",
        STRIPE_WEBHOOK_SECRET: "wh",
        CRON_SECRET: "c".repeat(16),
      }),
    ).toThrow(/test-bypass is forbidden/);
  });

  it("requires Stripe and cron secrets in production", () => {
    expect(() => parseServerEnv({ ...base, NODE_ENV: "production" })).toThrow(
      /STRIPE_SECRET_KEY[\s\S]*STRIPE_WEBHOOK_SECRET[\s\S]*CRON_SECRET/,
    );
  });

  it("requires APP_URL in production instead of defaulting to localhost", () => {
    // Session cookies are only marked Secure when APP_URL is https; links and redirects use it.
    const production = {
      ...base,
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      CRON_SECRET: "c".repeat(16),
    } as const;
    expect(() => parseServerEnv(production)).toThrow(/APP_URL/);
    expect(parseServerEnv({ ...production, APP_URL: "https://plainwill.example" }).APP_URL).toBe(
      "https://plainwill.example",
    );
  });
});

describe("SKIP_ENV_VALIDATION", () => {
  const original = process.env;
  afterEach(() => {
    process.env = original;
    resetEnvCache();
  });

  /** Runs getEnv() against exactly `vars` (no secrets unless given). */
  function getEnvWith(vars: Record<string, string>) {
    process.env = { ...vars } as NodeJS.ProcessEnv;
    resetEnvCache();
    return getEnv();
  }

  it("applies to builds and non-production runs only", () => {
    const skip = (vars: Record<string, string>) =>
      shouldSkipEnvValidation(vars as unknown as NodeJS.ProcessEnv);
    expect(skip({ NODE_ENV: "development" })).toBe(false);
    expect(skip({ NODE_ENV: "development", SKIP_ENV_VALIDATION: "1" })).toBe(true);
    expect(skip({ NODE_ENV: "test", SKIP_ENV_VALIDATION: "true" })).toBe(true);
    expect(
      skip({
        NODE_ENV: "production",
        SKIP_ENV_VALIDATION: "1",
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBe(true);
    expect(skip({ NODE_ENV: "production", SKIP_ENV_VALIDATION: "1" })).toBe(false);
    expect(
      skip({
        NODE_ENV: "production",
        SKIP_ENV_VALIDATION: "true",
        NEXT_PHASE: "phase-production-server",
      }),
    ).toBe(false);
  });

  it("is ignored by a production server: missing secrets fail fast instead of using placeholders", () => {
    expect(() => getEnvWith({ NODE_ENV: "production", SKIP_ENV_VALIDATION: "1" })).toThrow(
      /Invalid environment variables[\s\S]*DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/,
    );
    expect(() =>
      getEnvWith({ ...base, NODE_ENV: "production", SKIP_ENV_VALIDATION: "true" }),
    ).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("still lets `next build` load modules without secrets", () => {
    const env = getEnvWith({
      NODE_ENV: "production",
      SKIP_ENV_VALIDATION: "1",
      NEXT_PHASE: "phase-production-build",
    });
    expect(env.BETTER_AUTH_SECRET).toBe("build-time-placeholder-secret-not-used-at-runtime");
  });
});
