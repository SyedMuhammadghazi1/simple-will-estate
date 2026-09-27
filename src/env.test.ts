import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

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
});
