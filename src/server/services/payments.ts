import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, type Tx } from "@/db";
import { orders, stripeEvents, user, type OrderRow } from "@/db/schema";
import { getEnv, isPaymentBypassEnabled } from "@/env";
import { formatCents, getPlan, updateWindowEnd } from "@/lib/pricing";
import { getStateRule, isStateCode } from "@/lib/states";
import type { WillAnswers } from "@/lib/will/answers";
import { screenAnswers, type ScreeningCode, type ScreeningResult } from "@/lib/will/screening";
import { validateAnswers, type Issue } from "@/lib/will/validation";
import { SYSTEM_ACTOR, writeAudit } from "../audit";
import { documentsReadyEmail, orderConfirmationEmail } from "../emails";
import { ConflictError, ValidationError } from "../errors";
import { errorInfo, logger } from "../logger";
import { sendEmailOnce } from "../mailer";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import type { Actor } from "../session";
import { getStripe } from "../stripe";
import { createWillVersion, generateDocumentsForVersion } from "./documents";
import {
  auditActor,
  getOrderForActor,
  listWills,
  orderRef,
  statusOf,
  transitionOrder,
} from "./orders";
import { decryptDraft } from "./wills";

export interface WillReadiness {
  willId: string;
  position: number;
  testatorName: string;
  errors: Issue[];
  warnings: Issue[];
  screening: ScreeningResult;
}

export interface CheckoutReadiness {
  ready: boolean;
  blocked: boolean;
  problems: string[];
  wills: WillReadiness[];
  acknowledgementRequired: ScreeningCode[];
  stateCode: string | null;
}

/** Pure-ish evaluation of whether an order's wills can be paid for. */
export function evaluateReadiness(
  willAnswers: { willId: string; position: number; answers: WillAnswers }[],
  today = new Date(),
): CheckoutReadiness {
  const problems: string[] = [];
  const wills: WillReadiness[] = willAnswers.map(({ willId, position, answers }) => {
    const v = validateAnswers(answers, { today });
    return {
      willId,
      position,
      testatorName: answers.about.fullLegalName.trim(),
      errors: v.errors,
      warnings: v.warnings,
      screening: screenAnswers(answers),
    };
  });
  for (const w of wills) {
    if (w.errors.length > 0) {
      problems.push(
        `${w.testatorName || `Will ${w.position}`} has ${w.errors.length} question${w.errors.length === 1 ? "" : "s"} to fix.`,
      );
    }
  }
  const blocked = wills.some((w) => w.screening.outcome === "blocked");
  if (blocked) problems.push("A simple will isn't available for your situation (see below).");
  const states = new Set(willAnswers.map((w) => w.answers.about.stateCode));
  if (willAnswers.length > 1 && states.size > 1) {
    problems.push("Both partners must live in the same state for a couple order.");
  }
  const acknowledgementRequired = [
    ...new Set(wills.flatMap((w) => w.screening.acknowledgementRequired)),
  ];
  const stateCode = willAnswers[0]?.answers.about.stateCode ?? null;
  return {
    ready: problems.length === 0,
    blocked,
    problems,
    wills,
    acknowledgementRequired,
    stateCode: stateCode && isStateCode(stateCode) ? stateCode : null,
  };
}

export async function checkoutReadiness(order: Pick<OrderRow, "id">): Promise<CheckoutReadiness> {
  const willRows = await listWills(order.id);
  return evaluateReadiness(
    willRows.map((w) => ({ willId: w.id, position: w.position, answers: decryptDraft(w) })),
  );
}

/**
 * Starts payment for a draft order. Returns the URL to send the customer to: Stripe Checkout, or
 * (test-bypass mode outside production only) straight back to the order page, already paid.
 */
export async function startCheckout(
  actor: Actor,
  orderId: string,
  acknowledged: string[],
): Promise<{ redirectUrl: string }> {
  await enforceRateLimit(RATE_LIMITS.checkout, actor.userId);
  const order = await getOrderForActor(actor, orderId);
  if (statusOf(order) !== "draft") throw new ConflictError("This order has already been paid.");
  const readiness = await checkoutReadiness(order);
  if (!readiness.ready) throw new ValidationError(readiness.problems.join(" "), readiness.problems);
  const ack = readiness.acknowledgementRequired.filter((c) => acknowledged.includes(c));
  if (ack.length !== readiness.acknowledgementRequired.length) {
    throw new ValidationError("Please confirm you have read each recommendation before paying.");
  }
  const plan = getPlan(order.plan);
  await db
    .update(orders)
    .set({
      screeningAcknowledged: ack,
      stateCode: readiness.stateCode,
      amountCents: plan.amountCents,
    })
    .where(eq(orders.id, order.id));
  await writeAudit(auditActor(actor), {
    action: "checkout.started",
    targetType: "order",
    targetId: order.id,
    orderId: order.id,
    metadata: { plan: plan.id, acknowledged: ack, bypass: isPaymentBypassEnabled() },
  });

  const appUrl = getEnv().APP_URL;
  if (isPaymentBypassEnabled()) {
    await db.transaction((tx) =>
      markOrderPaid(tx, order.id, { source: "test_bypass", amountTotalCents: plan.amountCents }),
    );
    await sendPaidEmails(order.id);
    return { redirectUrl: `/dashboard/orders/${order.id}?paid=1` };
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: actor.email,
    metadata: { orderId: order.id, plan: plan.id },
    payment_intent_data: { metadata: { orderId: order.id } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: plan.amountCents,
          product_data: {
            name: `${process.env.NEXT_PUBLIC_APP_NAME || "Plainwill"} — ${plan.name}`,
            description:
              "Will documents, signing kit, 12 months of updates, vault storage and managed filing.",
          },
        },
      },
    ],
    success_url: `${appUrl}/dashboard/orders/${order.id}?checkout=success`,
    cancel_url: `${appUrl}/dashboard/orders/${order.id}?checkout=cancelled`,
  });
  await db
    .update(orders)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(orders.id, order.id));
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { redirectUrl: session.url };
}

export interface PaymentInfo {
  source: "stripe" | "test_bypass";
  amountTotalCents: number | null;
  checkoutSessionId?: string;
  paymentIntentId?: string | null;
}

export type MarkPaidResult =
  | { outcome: "paid"; versionIds: string[] }
  | { outcome: "already_processed" }
  | { outcome: "amount_mismatch" };

/**
 * Marks a draft order paid, snapshots every will into an immutable version, generates the final
 * documents and moves the order to documents_ready — atomically. Idempotent: an order that is
 * no longer a draft is left untouched.
 */
export async function markOrderPaid(
  tx: Tx,
  orderId: string,
  payment: PaymentInfo,
): Promise<MarkPaidResult> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update")
    .limit(1);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status !== "draft") return { outcome: "already_processed" };
  if (payment.amountTotalCents !== null && payment.amountTotalCents !== order.amountCents) {
    logger.error(
      { orderId, expected: order.amountCents, received: payment.amountTotalCents },
      "payment amount mismatch — order not marked paid",
    );
    await writeAudit(
      SYSTEM_ACTOR,
      {
        action: "payment.amount_mismatch",
        targetType: "order",
        targetId: orderId,
        orderId,
        metadata: { expected: order.amountCents, received: payment.amountTotalCents },
      },
      tx,
    );
    return { outcome: "amount_mismatch" };
  }

  const paidAt = new Date();
  await transitionOrder(tx, orderId, "paid", {
    actor: SYSTEM_ACTOR,
    actorType: "system",
    reason: payment.source === "stripe" ? "stripe_checkout_completed" : "test_payment_bypass",
    set: {
      paidAt,
      paymentSource: payment.source,
      updateWindowEndsAt: updateWindowEnd(paidAt),
      ...(payment.checkoutSessionId ? { stripeCheckoutSessionId: payment.checkoutSessionId } : {}),
      stripePaymentIntentId: payment.paymentIntentId ?? null,
    },
  });

  const willRows = await listWills(orderId, tx);
  const versionIds: string[] = [];
  for (const will of willRows) {
    const answers = decryptDraft(will);
    if (!isStateCode(answers.about.stateCode) || !getStateRule(answers.about.stateCode).supported) {
      throw new Error(`Order ${orderId} has an unsupported state at payment time`);
    }
    const version = await createWillVersion(tx, will, answers, "initial", order.userId);
    await generateDocumentsForVersion(tx, version, will.position);
    versionIds.push(version.id);
  }

  await transitionOrder(tx, orderId, "documents_ready", {
    actor: SYSTEM_ACTOR,
    actorType: "system",
    reason: "documents_generated",
    set: { documentsReadyAt: new Date() },
  });
  return { outcome: "paid", versionIds };
}

/** Sends confirmation + documents-ready emails once per order (safe to call repeatedly). */
export async function sendPaidEmails(orderId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ order: orders, email: user.email, name: user.name })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return;
    await sendEmailOnce(
      `order-confirmation:${orderId}`,
      "order_confirmation",
      orderConfirmationEmail(
        row.email,
        row.name,
        orderId,
        formatCents(row.order.amountCents, row.order.currency),
      ),
      { orderId, userId: row.order.userId },
    );
    await sendEmailOnce(
      `documents-ready:${orderId}:initial`,
      "documents_ready",
      documentsReadyEmail(row.email, row.name, orderId),
      { orderId, userId: row.order.userId },
    );
  } catch (err) {
    logger.error({ err: errorInfo(err), orderId }, "failed to send paid emails");
  }
}

/**
 * Processes a verified Stripe event exactly once. The event id is recorded in the same
 * transaction as its effects, so a failure rolls both back and Stripe's retry is processed.
 */
export async function processStripeEvent(
  event: Stripe.Event,
): Promise<"processed" | "duplicate" | "ignored"> {
  let paidOrderId: string | null = null;
  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return "duplicate" as const;

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (!orderId) {
        logger.warn({ eventId: event.id }, "checkout session without order id");
        return "ignored" as const;
      }
      if (session.payment_status !== "paid") {
        logger.info({ eventId: event.id, orderId }, "checkout completed but not yet paid");
        return "ignored" as const;
      }
      const res = await markOrderPaid(tx, orderId, {
        source: "stripe",
        amountTotalCents: session.amount_total,
        checkoutSessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
      });
      if (res.outcome === "paid") paidOrderId = orderId;
      logger.info(
        { eventId: event.id, orderId: orderRef(orderId), outcome: res.outcome },
        "checkout processed",
      );
      return "processed" as const;
    }
    return "ignored" as const;
  });
  if (paidOrderId) await sendPaidEmails(paidOrderId);
  return result;
}
