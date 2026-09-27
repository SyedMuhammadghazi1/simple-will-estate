import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Validation is lazy (on first access) so that `next build` can run without
 * secrets when SKIP_ENV_VALIDATION=1. At runtime the first access fails fast
 * with a readable error listing every invalid variable.
 */

const booleanString = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const base64Key32 = z.string().refine(
  (v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "must be 32 bytes encoded as base64 (openssl rand -base64 32)" },
);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** Required in production; defaults to http://localhost:3001 otherwise (see transform). */
    APP_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    TRUST_PROXY: booleanString,

    DATA_ENCRYPTION_KEY: base64Key32,
    DATA_ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, "letters, digits, _ or - (max 32)")
      .default("k1"),
    /** Comma separated `keyId:base64key` pairs used only for decrypting older data. */
    DATA_ENCRYPTION_PREVIOUS_KEYS: z.string().optional().default(""),

    PAYMENTS_MODE: z.enum(["stripe", "test-bypass"]).default("stripe"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    /**
     * Points the Stripe SDK at an API emulator (e.g. stripe-mock or the e2e emulator).
     * Only honoured with a TEST secret key (sk_test_…) — live keys always talk to Stripe.
     */
    STRIPE_API_BASE: z.string().url().optional(),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: booleanString,
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default("Plainwill <no-reply@localhost>"),
    SUPPORT_EMAIL: z.string().email().default("support@example.com"),

    CRON_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.PAYMENTS_MODE === "test-bypass") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_MODE"],
        message: "test-bypass is forbidden when NODE_ENV=production",
      });
    }
    if (env.PAYMENTS_MODE === "stripe" && env.NODE_ENV === "production") {
      if (!env.STRIPE_SECRET_KEY)
        ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "required" });
      if (!env.STRIPE_WEBHOOK_SECRET)
        ctx.addIssue({ code: "custom", path: ["STRIPE_WEBHOOK_SECRET"], message: "required" });
    }
    if (env.NODE_ENV === "production" && !env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "required in production" });
    }
    if (env.NODE_ENV === "production" && !env.APP_URL) {
      // Better Auth derives the session cookie's Secure flag from it; links and redirects use it.
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "required in production" });
    }
  })
  .transform((env) => ({ ...env, APP_URL: env.APP_URL ?? "http://localhost:3001" }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Empty strings (e.g. `LOG_LEVEL=` in .env) are treated as "not set". */
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
    ),
  );
}

export function parseServerEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(withoutEmpty(source));
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

/** Returns validated server env. Throws on first access if invalid. */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  if (process.env.SKIP_ENV_VALIDATION === "1" || process.env.SKIP_ENV_VALIDATION === "true") {
    // Build-time only: best-effort parse with placeholders so modules can load.
    const placeholder = {
      DATABASE_URL: "postgres://build:build@localhost:5432/build",
      BETTER_AUTH_SECRET: "build-time-placeholder-secret-not-used-at-runtime",
      DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      ...withoutEmpty(process.env),
    };
    const result = serverEnvSchema.safeParse(placeholder);
    if (result.success) return result.data;
    return placeholder as unknown as ServerEnv;
  }
  cached = parseServerEnv(process.env);
  return cached;
}

/** Test helper: forget the cached env so tests can change process.env. */
export function resetEnvCache() {
  cached = undefined;
}

/** True only outside production AND when explicitly enabled. Never true in production. */
export function isPaymentBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return getEnv().PAYMENTS_MODE === "test-bypass";
}

export const publicEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Plainwill",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
};
