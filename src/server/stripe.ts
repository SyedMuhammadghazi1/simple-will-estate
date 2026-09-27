import "server-only";
import Stripe from "stripe";
import { getEnv } from "@/env";

let client: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(getEnv().STRIPE_SECRET_KEY);
}

/** Connection override for an API emulator; never applied to live keys. */
export function stripeConnectionOptions(
  secretKey: string,
  apiBase: string | undefined,
): Pick<Stripe.StripeConfig, "host" | "port" | "protocol"> {
  if (!apiBase || !secretKey.startsWith("sk_test_")) return {};
  const url = new URL(apiBase);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol === "https:" ? "https" : "http",
  };
}

export function getStripe(): Stripe {
  const env = getEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(key, {
    appInfo: { name: "plainwill" },
    maxNetworkRetries: 2,
    ...stripeConnectionOptions(key, env.STRIPE_API_BASE),
  });
  return client;
}
