import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { db } from "@/db";
import { auditLog, orders } from "@/db/schema";
import { resetEnvCache } from "@/env";
import { ConflictError } from "@/server/errors";
import { checkoutIdempotencyKey, startCheckout } from "@/server/services/payments";
import { createStripeEmulator } from "../e2e/stripe-emulator.mjs";
import { createCompletedOrder, createUser } from "./helpers";

// The real Stripe code path (SDK over HTTP) against the repo's Stripe emulator.
const emulator = createStripeEmulator();
const signer = new Stripe("sk_test_signer");

beforeAll(async () => {
  await new Promise<void>((resolve) => emulator.server.listen(0, "127.0.0.1", resolve));
  const { port } = emulator.server.address() as AddressInfo;
  Object.assign(process.env, {
    PAYMENTS_MODE: "stripe",
    STRIPE_API_BASE: `http://127.0.0.1:${port}`,
  });
  resetEnvCache();
});

afterAll(async () => {
  Object.assign(process.env, { PAYMENTS_MODE: "test-bypass" });
  delete process.env.STRIPE_API_BASE;
  resetEnvCache();
  await new Promise((resolve) => emulator.server.close(resolve));
});

beforeEach(() => {
  emulator.sessions.clear();
  emulator.stats.creates = 0;
  emulator.stats.idempotencyKeys.length = 0;
});

async function orderRow(orderId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row!;
}

async function paidOrder() {
  const { actor } = await createUser();
  const { order } = await createCompletedOrder(actor);
  return { actor, order };
}

/** Delivers a signed checkout.session.completed for an emulator session to the webhook route. */
function completeSession(sessionId: string) {
  const session = emulator.sessions.get(sessionId)!;
  Object.assign(session, { status: "complete", payment_status: "paid" });
  const payload = JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: session },
  });
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_integration_test_secret",
  });
  return stripeWebhook(
    new Request("http://localhost:3001/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body: payload,
    }),
  );
}

describe("Stripe Checkout Sessions per order", () => {
  it("sends the customer back to the open session instead of creating a second one", async () => {
    const { actor, order } = await paidOrder();
    const before = Math.floor(Date.now() / 1000);
    const first = await startCheckout(actor, order.id, []);
    const row = await orderRow(order.id);
    expect(row.checkoutAttempts).toBe(1);
    const session = emulator.sessions.get(row.stripeCheckoutSessionId!)!;
    expect(first.redirectUrl).toBe(session.url);
    expect(session.metadata.orderId).toBe(order.id);
    // 30 minutes (Stripe's minimum) plus a minute of slack.
    expect(session.expires_at - before).toBeGreaterThanOrEqual(30 * 60);
    expect(session.expires_at - before).toBeLessThanOrEqual(32 * 60);
    expect(emulator.stats.idempotencyKeys).toEqual([checkoutIdempotencyKey(order.id, 1)]);

    const second = await startCheckout(actor, order.id, []);
    expect(second.redirectUrl).toBe(first.redirectUrl);
    expect(emulator.stats.creates).toBe(1);
    expect((await orderRow(order.id)).checkoutAttempts).toBe(1);
  });

  it("gives concurrent Pay clicks for one order the same session", async () => {
    const { actor, order } = await paidOrder();
    const results = await Promise.all([1, 2, 3].map(() => startCheckout(actor, order.id, [])));
    expect(new Set(results.map((r) => r.redirectUrl)).size).toBe(1);
    expect(emulator.stats.creates).toBe(1);
    expect((await orderRow(order.id)).checkoutAttempts).toBe(1);
  });

  it("creates the next attempt's session once the stored one has expired", async () => {
    const { actor, order } = await paidOrder();
    await startCheckout(actor, order.id, []);
    const firstId = (await orderRow(order.id)).stripeCheckoutSessionId!;
    emulator.sessions.get(firstId)!.expires_at = Math.floor(Date.now() / 1000) - 1;

    const { redirectUrl } = await startCheckout(actor, order.id, []);
    const row = await orderRow(order.id);
    expect(row.checkoutAttempts).toBe(2);
    expect(row.stripeCheckoutSessionId).not.toBe(firstId);
    expect(redirectUrl).toBe(emulator.sessions.get(row.stripeCheckoutSessionId!)!.url);
    expect(emulator.stats.idempotencyKeys).toEqual([
      checkoutIdempotencyKey(order.id, 1),
      checkoutIdempotencyKey(order.id, 2),
    ]);
  });

  it("expires a session that is about to expire before replacing it, so only one can be paid", async () => {
    const { actor, order } = await paidOrder();
    await startCheckout(actor, order.id, []);
    const firstId = (await orderRow(order.id)).stripeCheckoutSessionId!;
    emulator.sessions.get(firstId)!.expires_at = Math.floor(Date.now() / 1000) + 60;

    await startCheckout(actor, order.id, []);
    expect(emulator.sessions.get(firstId)!.status).toBe("expired");
    const row = await orderRow(order.id);
    expect(row.stripeCheckoutSessionId).not.toBe(firstId);
    expect(emulator.sessions.get(row.stripeCheckoutSessionId!)!.status).toBe("open");
  });

  it("never replaces a paid session whose webhook hasn't arrived yet", async () => {
    const { actor, order } = await paidOrder();
    await startCheckout(actor, order.id, []);
    const sessionId = (await orderRow(order.id)).stripeCheckoutSessionId!;
    Object.assign(emulator.sessions.get(sessionId)!, {
      status: "complete",
      payment_status: "paid",
    });

    const { redirectUrl } = await startCheckout(actor, order.id, []);
    expect(redirectUrl).toBe(`/dashboard/orders/${order.id}?checkout=success`);
    expect(emulator.stats.creates).toBe(1);

    expect((await completeSession(sessionId)).status).toBe(200);
    expect((await orderRow(order.id)).status).toBe("documents_ready");
    await expect(startCheckout(actor, order.id, [])).rejects.toBeInstanceOf(ConflictError);
  });

  it("waits for a pending bank payment but lets the customer retry after it failed", async () => {
    const { actor, order } = await paidOrder();
    await startCheckout(actor, order.id, []);
    const session = emulator.sessions.get((await orderRow(order.id)).stripeCheckoutSessionId!)!;
    Object.assign(session, { status: "complete", payment_status: "unpaid" });
    emulator.intents.set(session.payment_intent, "processing");
    expect((await startCheckout(actor, order.id, [])).redirectUrl).toMatch(/checkout=success$/);
    expect(emulator.stats.creates).toBe(1);

    emulator.intents.set(session.payment_intent, "requires_payment_method");
    const retry = await startCheckout(actor, order.id, []);
    expect(retry.redirectUrl).not.toBe(session.url);
    expect(emulator.stats.creates).toBe(2);
  });

  it("does not open a second session when a create is retried with the same attempt", async () => {
    const { actor, order } = await paidOrder();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date() });
    try {
      await startCheckout(actor, order.id, []);
      const firstId = (await orderRow(order.id)).stripeCheckoutSessionId!;
      // As if the transaction storing the session had failed after Stripe created it.
      await db
        .update(orders)
        .set({ stripeCheckoutSessionId: null, checkoutAttempts: 0 })
        .where(eq(orders.id, order.id));
      await startCheckout(actor, order.id, []);
      expect(emulator.stats.creates).toBe(1);
      expect((await orderRow(order.id)).stripeCheckoutSessionId).toBe(firstId);

      // Same key, different parameters (a later expires_at): Stripe refuses the key, so the
      // next attempt number is used instead of failing the checkout.
      await db
        .update(orders)
        .set({ stripeCheckoutSessionId: null, checkoutAttempts: 0 })
        .where(eq(orders.id, order.id));
      vi.setSystemTime(Date.now() + 5_000);
      await startCheckout(actor, order.id, []);
      const row = await orderRow(order.id);
      expect(row.checkoutAttempts).toBe(2);
      expect(row.stripeCheckoutSessionId).not.toBe(firstId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still flags a payment through a replaced session for a refund", async () => {
    const { actor, order } = await paidOrder();
    await startCheckout(actor, order.id, []);
    const firstId = (await orderRow(order.id)).stripeCheckoutSessionId!;
    emulator.sessions.get(firstId)!.expires_at = Math.floor(Date.now() / 1000) - 1;
    await startCheckout(actor, order.id, []);
    const secondId = (await orderRow(order.id)).stripeCheckoutSessionId!;

    expect((await completeSession(secondId)).status).toBe(200);
    expect((await completeSession(firstId)).status).toBe(200);
    const flagged = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orderId, order.id), eq(auditLog.action, "payment.unexpected")));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.metadata).toMatchObject({ checkoutSessionId: firstId });
  });
});
