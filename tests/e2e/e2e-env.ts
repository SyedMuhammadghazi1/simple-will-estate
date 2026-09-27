/**
 * Environment for the Playwright run: a production build (`next start`, NODE_ENV=production)
 * talking to the test database, with Stripe's API replaced by a local emulator
 * (tests/e2e/stripe-emulator.mjs) — so the REAL payment + webhook code path runs, with no bypass.
 */
export const E2E_PORT = 3001;
export const STRIPE_EMULATOR_PORT = Number(process.env.E2E_STRIPE_PORT ?? 12111);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/simple_will_test";

export const E2E_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: `http://localhost:${E2E_PORT}`,
  NEXT_PUBLIC_APP_URL: `http://localhost:${E2E_PORT}`,
  NEXT_PUBLIC_APP_NAME: "Plainwill",
  BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  DATA_ENCRYPTION_KEY: "ZTJlLW9ubHkta2V5LTMyLWJ5dGVzLWxvbmctISEhISE=",
  DATA_ENCRYPTION_KEY_ID: "e2e",
  PAYMENTS_MODE: "stripe",
  STRIPE_SECRET_KEY: "sk_test_e2e_emulator",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_emulator_secret",
  STRIPE_API_BASE: `http://localhost:${STRIPE_EMULATOR_PORT}`,
  CRON_SECRET: "e2e-cron-secret-0123456789",
  SMTP_HOST: "",
  LOG_LEVEL: "warn",
  SEED_PASSWORD: "Plainwill-demo-2026",
};
