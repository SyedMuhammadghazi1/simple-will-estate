import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getEnv } from "@/env";
import { passwordResetEmail } from "./emails";
import { sendEmail } from "./mailer";
import { AUTH_CLIENT_IP_HEADER } from "./request";

export const MIN_PASSWORD_LENGTH = 10;

function createAuth() {
  const env = getEnv();
  return betterAuth({
    appName: process.env.NEXT_PUBLIC_APP_NAME || "Plainwill",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(passwordResetEmail(user.email, user.name, url));
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "customer",
          input: false, // users can never set their own role
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    // Our own Postgres-backed limiter (per IP and per account, shared across instances) wraps
    // the auth route and the auth server actions instead.
    rateLimit: { enabled: false },
    advanced: {
      // Better Auth records the client IP on new sessions. It reads it only from the internal
      // header authHeaders() sets from the app's own resolution (CLIENT_IP_HEADER /
      // TRUSTED_PROXY_HOPS), never from X-Forwarded-For; 128 keeps IPv6 addresses whole.
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER], ipv6Subnet: 128 },
    },
    telemetry: { enabled: false },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

declare global {
  var __plainwillAuth: Auth | undefined;
}

/** Lazily created so `next build` does not need secrets. */
export function getAuth(): Auth {
  globalThis.__plainwillAuth ??= createAuth();
  return globalThis.__plainwillAuth;
}

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
