/** Environment shared by the integration test global setup and every test file. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/simple_will_test";

export function applyTestEnv() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run integration tests against non-test database "${dbName}"`);
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_MAX: "5",
    APP_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef-0123456789",
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    DATA_ENCRYPTION_KEY_ID: "test1",
    PAYMENTS_MODE: "test-bypass",
    STRIPE_SECRET_KEY: "sk_test_integration_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_integration_test_secret",
    CRON_SECRET: "integration-cron-secret-123",
    LOG_LEVEL: "silent",
    SMTP_HOST: "",
    NEXT_PUBLIC_APP_NAME: "Plainwill",
  });
}
