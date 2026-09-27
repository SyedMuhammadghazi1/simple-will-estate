import "server-only";
import Stripe from "stripe";
import { getEnv } from "@/env";

let client: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(getEnv().STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(key, { appInfo: { name: "plainwill" }, maxNetworkRetries: 2 });
  return client;
}
