import type { Server } from "node:http";

export interface EmulatedCheckoutSession {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid";
  payment_intent: string;
  expires_at: number;
  amount_total: number;
  currency: string;
  url: string;
  metadata: Record<string, string>;
  client_reference_id: string | null;
  [key: string]: unknown;
}

export function createStripeEmulator(options?: { appUrl?: string; webhookSecret?: string }): {
  server: Server;
  sessions: Map<string, EmulatedCheckoutSession>;
  intents: Map<string, string>;
  stats: { creates: number; idempotencyKeys: (string | null)[] };
};
