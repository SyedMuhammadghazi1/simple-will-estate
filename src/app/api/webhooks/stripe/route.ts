import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv } from "@/env";
import { PayloadTooLargeError } from "@/server/errors";
import { readBodyCapped } from "@/server/http";
import { errorInfo, logger } from "@/server/logger";
import { processStripeEvent } from "@/server/services/payments";
import { getStripe } from "@/server/stripe";

export const dynamic = "force-dynamic";

/** Stripe events are a few KB; nothing this large comes from Stripe. */
const MAX_BODY_BYTES = 1024 * 1024;

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

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await readBodyCapped(req, MAX_BODY_BYTES));
  } catch (err) {
    if (!(err instanceof PayloadTooLargeError)) throw err;
    logger.warn({ maxBytes: MAX_BODY_BYTES }, "stripe webhook body too large");
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
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
