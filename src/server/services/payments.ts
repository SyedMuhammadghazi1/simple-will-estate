import "server-only";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, type Tx } from "@/db";
import { orders, stripeEvents, user, type OrderRow } from "@/db/schema";
import { getEnv, isPaymentBypassEnabled } from "@/env";
import { formatCents, getPlan, updateWindowEnd } from "@/lib/pricing";
import { isStateCode } from "@/lib/states";
import type { WillAnswers } from "@/lib/will/answers";
import { screenAnswers, type ScreeningCode, type ScreeningResult } from "@/lib/will/screening";
import { validateAnswers, type Issue } from "@/lib/will/validation";
import { SYSTEM_ACTOR, writeAudit, type AuditActor } from "../audit";
import { documentsReadyEmail, orderConfirmationEmail } from "../emails";
import { ConflictError, ValidationError } from "../errors";
import { errorInfo, logger } from "../logger";
import { sendEmailOnce } from "../mailer";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import type { Actor } from "../actor";
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
 *
 * For an order that is already paid but whose documents were held (its answers stopped passing
 * these checks while the customer was on the Stripe page), this generates the documents once the
 * answers are fixed — without charging again.
 */
export async function startCheckout(
  actor: Actor,
  orderId: string,
  acknowledged: string[],
): Promise<{ redirectUrl: string }> {
  await enforceRateLimit(RATE_LIMITS.checkout, actor.userId);
  const order = await getOrderForActor(actor, orderId);
  const status = statusOf(order);
  if (status !== "draft" && status !== "paid") {
    throw new ConflictError("This order has already been paid.");
  }
  const readiness = await checkoutReadiness(order);
  if (!readiness.ready) throw new ValidationError(readiness.problems.join(" "), readiness.problems);
  const ack = readiness.acknowledgementRequired.filter((c) => acknowledged.includes(c));
  if (ack.length !== readiness.acknowledgementRequired.length) {
    throw new ValidationError("Please confirm you have read each recommendation before paying.");
  }
  const plan = getPlan(order.plan);
  const updated = await db
    .update(orders)
    .set({
      screeningAcknowledged: ack,
      stateCode: readiness.stateCode,
      // The amount of a paid order is what was charged; never change it afterwards.
      ...(status === "draft" ? { amountCents: plan.amountCents } : {}),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, status)))
    .returning({ id: orders.id });
  if (updated.length === 0) {
    throw new ConflictError("This order changed while we were updating it. Please refresh.");
  }

  if (status === "paid") {
    const result = await db.transaction((tx) =>
      generateInitialDocuments(tx, order.id, { actor: auditActor(actor), actorType: "customer" }),
    );
    if (result.outcome !== "paid") {
      throw new ValidationError("Some answers changed. Please review them and try again.");
    }
    await sendPaidEmails(order.id);
    return { redirectUrl: `/dashboard/orders/${order.id}?paid=1` };
  }

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
  /** Payment recorded, but the answers need fixing before documents can be generated. */
  | { outcome: "needs_attention" }
  | { outcome: "already_processed" }
  | { outcome: "amount_mismatch" };

/** Whether `payment` is the one already recorded on the order (a re-delivery, not a new charge). */
function isRecordedPayment(order: OrderRow, payment: PaymentInfo): boolean {
  return (
    order.paidAt !== null &&
    order.paymentSource === payment.source &&
    (payment.checkoutSessionId === undefined ||
      order.stripeCheckoutSessionId === payment.checkoutSessionId)
  );
}

/**
 * Marks a draft order paid, snapshots every will into an immutable version, generates the final
 * documents and moves the order to documents_ready — atomically. Idempotent: an order that is
 * no longer a draft is left untouched (a different payment for it is flagged for a refund).
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
  if (order.status !== "draft") {
    if (!isRecordedPayment(order, payment)) {
      // e.g. a second checkout session paid, or the order was cancelled during checkout.
      logger.error(
        { orderId, status: order.status, checkoutSessionId: payment.checkoutSessionId ?? null },
        "payment received for an order that is not awaiting payment — refund needed",
      );
      await writeAudit(
        SYSTEM_ACTOR,
        {
          action: "payment.unexpected",
          targetType: "order",
          targetId: orderId,
          orderId,
          metadata: {
            status: order.status,
            source: payment.source,
            checkoutSessionId: payment.checkoutSessionId ?? null,
            amountTotalCents: payment.amountTotalCents,
          },
        },
        tx,
      );
    }
    return { outcome: "already_processed" };
  }
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
  return generateInitialDocuments(tx, orderId, { actor: SYSTEM_ACTOR, actorType: "system" });
}

/**
 * Snapshots every will of a paid order into an immutable version, generates the final documents
 * and moves the order to documents_ready. Drafts stay editable while the customer is on the
 * Stripe page, so they are checked again exactly like at checkout; if they no longer pass (or
 * raise a warning that wasn't acknowledged) the order stays "paid" with no documents until the
 * customer fixes them and confirms again (see startCheckout).
 */
async function generateInitialDocuments(
  tx: Tx,
  orderId: string,
  by: { actor: AuditActor; actorType: "customer" | "system" },
): Promise<{ outcome: "paid"; versionIds: string[] } | { outcome: "needs_attention" }> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update")
    .limit(1);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status !== "paid")
    throw new ConflictError("Your documents have already been prepared.");

  const drafts = (await listWills(orderId, tx)).map((will) => ({
    will,
    answers: decryptDraft(will),
  }));
  const readiness = evaluateReadiness(
    drafts.map(({ will, answers }) => ({ willId: will.id, position: will.position, answers })),
  );
  const missingAcknowledgements = readiness.acknowledgementRequired.filter(
    (code) => !order.screeningAcknowledged.includes(code),
  );
  if (!readiness.ready || missingAcknowledgements.length > 0) {
    logger.warn(
      { orderId: orderRef(orderId), blocked: readiness.blocked, missingAcknowledgements },
      "answers no longer pass checkout checks — documents held until the customer fixes them",
    );
    await writeAudit(
      by.actor,
      {
        action: "order.documents_held",
        targetType: "order",
        targetId: orderId,
        orderId,
        metadata: {
          errors: readiness.wills.reduce((n, w) => n + w.errors.length, 0),
          blocked: readiness.blocked,
          missingAcknowledgements,
        },
      },
      tx,
    );
    return { outcome: "needs_attention" };
  }

  const versionIds: string[] = [];
  for (const { will, answers } of drafts) {
    const version = await createWillVersion(tx, will, answers, "initial", order.userId);
    await generateDocumentsForVersion(tx, version, will.position);
    versionIds.push(version.id);
  }

  await transitionOrder(tx, orderId, "documents_ready", {
    actor: by.actor,
    actorType: by.actorType,
    reason: "documents_generated",
    set: { documentsReadyAt: new Date(), stateCode: readiness.stateCode },
  });
  return { outcome: "paid", versionIds };
}

/**
 * Sends the confirmation email, and the documents-ready email once documents exist, at most once
 * per order (safe to call repeatedly).
 */
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
    if (!row.order.documentsReadyAt) return;
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
      if (res.outcome === "paid" || res.outcome === "needs_attention") paidOrderId = orderId;
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
