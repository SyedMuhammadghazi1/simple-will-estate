import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv } from "@/env";
import { errorInfo, logger } from "@/server/logger";
import { processStripeEvent } from "@/server/services/payments";
import { getStripe } from "@/server/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. The signature is verified against the RAW body; processing is idempotent
 * (event ids are persisted in `stripe_events`).
 */
export async function POST(req: Request) {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    logger.warn({ err: errorInfo(err) }, "stripe webhook signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (err) {
    // 500 makes Stripe retry; the event id was rolled back with the failed transaction.
    logger.error(
      { err: errorInfo(err), eventId: event.id, type: event.type },
      "stripe webhook processing failed",
    );
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
