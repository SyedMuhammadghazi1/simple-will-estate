import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { GET as getDocument } from "@/app/api/documents/[documentId]/route";
import { db, getPool } from "@/db";
import {
  auditLog,
  documents,
  emailLog,
  orderStatusHistory,
  orders,
  stripeEvents,
  willVersions,
} from "@/db/schema";
import { canonicalJson, sha256Hex } from "@/lib/crypto";
import { sampleAnswers } from "@/lib/will/sample";
import { ConflictError, ValidationError } from "@/server/errors";
import { currentDocuments, decryptVersionAnswers } from "@/server/services/documents";
import { startCheckout } from "@/server/services/payments";
import { loadWillForEditing } from "@/server/services/wills";
import { authedRequest, createCompletedOrder, createUser, params } from "./helpers";

const stripe = new Stripe("sk_test_integration_dummy");
const WEBHOOK_SECRET = "whsec_integration_test_secret";

function checkoutEvent(
  orderId: string,
  amount: number,
  id = `evt_${Math.random().toString(36).slice(2)}`,
) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: {
      object: {
        id: `cs_test_${orderId.slice(0, 8)}`,
        object: "checkout.session",
        client_reference_id: orderId,
        metadata: { orderId },
        amount_total: amount,
        currency: "usd",
        payment_status: "paid",
        payment_intent: "pi_test_123",
      },
    },
  };
}

function signedWebhookRequest(event: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost:3001/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

async function pdfText(bytes: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}

describe("checkout webhook → paid → version snapshot → documents unlocked", () => {
  it("processes checkout.session.completed end to end", async () => {
    const { actor, cookie } = await createUser();
    const { order, will } = await createCompletedOrder(actor);

    // No final documents before payment
    expect(await currentDocuments(order)).toEqual([]);

    const res = await stripeWebhook(
      signedWebhookRequest(checkoutEvent(order.id, 9_900, "evt_paid_1")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, result: "processed" });

    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid!.status).toBe("documents_ready");
    expect(paid!.paymentSource).toBe("stripe");
    expect(paid!.stripePaymentIntentId).toBe("pi_test_123");
    expect(paid!.paidAt).toBeInstanceOf(Date);
    expect(paid!.updateWindowEndsAt!.getTime()).toBeGreaterThan(paid!.paidAt!.getTime());

    // Status history: draft → paid → documents_ready
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id));
    expect(history.map((h) => `${h.fromStatus}>${h.toStatus}`)).toEqual([
      "draft>paid",
      "paid>documents_ready",
    ]);

    // Immutable snapshot with a SHA-256 of the canonical answers
    const [version] = await db.select().from(willVersions).where(eq(willVersions.willId, will.id));
    expect(version!.version).toBe(1);
    expect(version!.reason).toBe("initial");
    expect(version!.answersCiphertext).not.toContain("Jordan");
    const { answers } = await loadWillForEditing(actor, will.id);
    expect(version!.answersSha256).toBe(sha256Hex(canonicalJson(answers)));
    expect(decryptVersionAnswers(version!)).toEqual(answers);

    // Documents generated from the snapshot and downloadable by the owner
    const docs = await currentDocuments(order);
    expect(docs.map((d) => d.kind).sort()).toEqual(["signing_instructions", "will"]);
    const willDoc = docs.find((d) => d.kind === "will")!;
    const dl = await getDocument(
      authedRequest(`/api/documents/${willDoc.documentId}`, cookie),
      params({ documentId: willDoc.documentId }),
    );
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    const text = await pdfText(await dl.arrayBuffer());
    expect(text).toContain("Last Will and Testament of Jordan Avery Sample");
    expect(text).not.toContain("DRAFT");

    // First download of the will moves the order to awaiting_execution
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after!.status).toBe("awaiting_execution");

    // Confirmation + documents-ready emails recorded once
    const emails = await db.select().from(emailLog).where(eq(emailLog.orderId, order.id));
    expect(emails.map((e) => e.kind).sort()).toEqual(["documents_ready", "order_confirmation"]);
  });

  it("is idempotent for duplicate deliveries of the same event", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    const event = checkoutEvent(order.id, 9_900, "evt_dup");
    expect((await stripeWebhook(signedWebhookRequest(event))).status).toBe(200);
    const second = await stripeWebhook(signedWebhookRequest(event));
    expect(await second.json()).toMatchObject({ result: "duplicate" });
    // A *different* event for the same order is also a no-op
    const third = await stripeWebhook(
      signedWebhookRequest(checkoutEvent(order.id, 9_900, "evt_other")),
    );
    expect(third.status).toBe(200);
    expect(
      await db.select().from(willVersions).where(eq(willVersions.orderId, order.id)),
    ).toHaveLength(1);
    expect(await db.select().from(documents).where(eq(documents.orderId, order.id))).toHaveLength(
      2,
    );
    expect((await db.select().from(stripeEvents)).map((e) => e.id).sort()).toEqual([
      "evt_dup",
      "evt_other",
    ]);
  });

  it("rejects bad signatures", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    const res = await stripeWebhook(
      signedWebhookRequest(checkoutEvent(order.id, 9_900), "whsec_wrong"),
    );
    expect(res.status).toBe(400);
    const missing = await stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }),
    );
    expect(missing.status).toBe(400);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("draft");
  });

  it("does not mark an order paid when the amount doesn't match the server price", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    const res = await stripeWebhook(signedWebhookRequest(checkoutEvent(order.id, 100)));
    expect(res.status).toBe(200);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("draft");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.amount_mismatch"));
    expect(audits).toHaveLength(1);
  });

  it("ignores sessions that are not paid yet", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    const event = checkoutEvent(order.id, 9_900);
    event.data.object.payment_status = "unpaid";
    const res = await stripeWebhook(signedWebhookRequest(event));
    expect(await res.json()).toMatchObject({ result: "ignored" });
  });

  it("enforces immutability of versions and documents at the database level", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    await stripeWebhook(signedWebhookRequest(checkoutEvent(order.id, 9_900)));
    await expect(getPool().query("update will_versions set reason = 'update'")).rejects.toThrow(
      /immutable/,
    );
    await expect(getPool().query("delete from documents")).rejects.toThrow(/immutable/);
    await expect(getPool().query("delete from audit_log")).rejects.toThrow(/immutable/);
  });
});

describe("startCheckout", () => {
  it("marks the order paid via the test bypass (non-production only)", async () => {
    const { actor } = await createUser();
    const { order } = await createCompletedOrder(actor);
    const { redirectUrl } = await startCheckout(actor, order.id, []);
    expect(redirectUrl).toBe(`/dashboard/orders/${order.id}?paid=1`);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("documents_ready");
    expect(o!.paymentSource).toBe("test_bypass");
    await expect(startCheckout(actor, order.id, [])).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses incomplete wills", async () => {
    const { actor } = await createUser();
    const answers = sampleAnswers();
    answers.residuary.beneficiaries[0]!.shareBps = 1;
    const { order } = await createCompletedOrder(actor, answers);
    await expect(startCheckout(actor, order.id, [])).rejects.toThrow(/question/);
  });

  it("blocks Louisiana residents without charging them", async () => {
    const { actor } = await createUser();
    const answers = sampleAnswers();
    answers.about.stateCode = "LA";
    const { order } = await createCompletedOrder(actor, answers);
    await expect(startCheckout(actor, order.id, [])).rejects.toBeInstanceOf(ValidationError);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("draft");
  });

  it("requires acknowledging attorney recommendations before paying", async () => {
    const { actor } = await createUser();
    const answers = sampleAnswers();
    answers.situation.ownsBusiness = true;
    const { order } = await createCompletedOrder(actor, answers);
    await expect(startCheckout(actor, order.id, [])).rejects.toThrow(/confirm/);
    await startCheckout(actor, order.id, ["business_ownership"]);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.screeningAcknowledged).toEqual(["business_ownership"]);
    expect(o!.status).toBe("documents_ready");
  });

  it("never honours the bypass in production", async () => {
    const { isPaymentBypassEnabled } = await import("@/env");
    const previous = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    try {
      expect(isPaymentBypassEnabled()).toBe(false);
    } finally {
      Object.assign(process.env, { NODE_ENV: previous });
    }
  });
});
