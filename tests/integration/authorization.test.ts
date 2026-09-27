import { describe, expect, it } from "vitest";
import { GET as exportData } from "@/app/api/account/export/route";
import { GET as adminAudit } from "@/app/api/admin/audit/route";
import { GET as adminOrders } from "@/app/api/admin/orders/route";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/signing-reminders/route";
import { GET as getDocument } from "@/app/api/documents/[documentId]/route";
import { POST as uploadRoute } from "@/app/api/orders/[orderId]/uploads/route";
import { GET as getUpload } from "@/app/api/uploads/[uploadId]/route";
import { GET as preview } from "@/app/api/wills/[willId]/preview/route";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { adminListAudit, adminListOrders, adminOrderDetail } from "@/server/services/admin";
import { currentDocuments, readDocument } from "@/server/services/documents";
import {
  readUpload,
  recordExecutionAndChooseFiling,
  uploadSignedWill,
} from "@/server/services/execution";
import { applyFilingAction } from "@/server/services/filing";
import { getOrderForActor } from "@/server/services/orders";
import { startCheckout } from "@/server/services/payments";
import { publishWillUpdate } from "@/server/services/updates";
import {
  authedRequest,
  createCompletedOrder,
  createPaidOrder,
  createUser,
  params,
  PDF_BYTES,
} from "./helpers";

async function setupVictim() {
  const a = await createUser("customer", "Alice Owner");
  const { order, will } = await createPaidOrder(a.actor);
  const docs = await currentDocuments(order);
  const upload = await uploadSignedWill(a.actor, order.id, will.id, {
    bytes: PDF_BYTES,
    filename: "signed.pdf",
  });
  return { a, order, will, docs, upload };
}

function uploadForm(willId: string, bytes: Uint8Array = PDF_BYTES) {
  const form = new FormData();
  form.set("willId", willId);
  form.set("file", new File([Buffer.from(bytes)], "signed.pdf", { type: "application/pdf" }));
  return form;
}

describe("IDOR protection — user B cannot touch user A's data", () => {
  it("hides A's order, documents, uploads and drafts from B at the service layer", async () => {
    const { order, will, docs, upload } = await setupVictim();
    const b = await createUser("customer", "Bob Intruder");
    await expect(getOrderForActor(b.actor, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(readDocument(b.actor, docs[0]!.documentId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(readUpload(b.actor, upload.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      uploadSignedWill(b.actor, order.id, will.id, { bytes: PDF_BYTES, filename: "x.pdf" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(startCheckout(b.actor, order.id, [])).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordExecutionAndChooseFiling(b.actor, order.id, "vault", { signedWithWitnesses: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(publishWillUpdate(b.actor, will.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 404 from the HTTP routes for B and 200 for A", async () => {
    const { a, order, will, docs, upload } = await setupVictim();
    const b = await createUser();
    const docId = docs[0]!.documentId;

    const bDoc = await getDocument(
      authedRequest(`/api/documents/${docId}`, b.cookie),
      params({ documentId: docId }),
    );
    expect(bDoc.status).toBe(404);
    const aDoc = await getDocument(
      authedRequest(`/api/documents/${docId}`, a.cookie),
      params({ documentId: docId }),
    );
    expect(aDoc.status).toBe(200);

    const bUp = await getUpload(
      authedRequest(`/api/uploads/${upload.id}`, b.cookie),
      params({ uploadId: upload.id }),
    );
    expect(bUp.status).toBe(404);
    const aUp = await getUpload(
      authedRequest(`/api/uploads/${upload.id}`, a.cookie),
      params({ uploadId: upload.id }),
    );
    expect(aUp.status).toBe(200);
    expect(Buffer.from(await aUp.arrayBuffer())).toEqual(Buffer.from(PDF_BYTES));

    const bPrev = await preview(
      authedRequest(`/api/wills/${will.id}/preview?kind=will`, b.cookie),
      params({ willId: will.id }),
    );
    expect(bPrev.status).toBe(404);

    const bPost = await uploadRoute(
      authedRequest(`/api/orders/${order.id}/uploads`, b.cookie, {
        method: "POST",
        body: uploadForm(will.id),
        headers: { accept: "application/json" },
      }),
      params({ orderId: order.id }),
    );
    expect(bPost.status).toBe(404);
  });

  it("requires authentication (401) on protected routes", async () => {
    const { docs, upload, will } = await setupVictim();
    const docId = docs[0]!.documentId;
    expect(
      (
        await getDocument(
          authedRequest(`/api/documents/${docId}`, null),
          params({ documentId: docId }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await getUpload(
          authedRequest(`/api/uploads/${upload.id}`, null),
          params({ uploadId: upload.id }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await preview(
          authedRequest(`/api/wills/${will.id}/preview`, null),
          params({ willId: will.id }),
        )
      ).status,
    ).toBe(401);
    expect((await exportData(authedRequest("/api/account/export", null))).status).toBe(401);
  });

  it("returns 404 for malformed ids instead of erroring", async () => {
    const b = await createUser();
    const res = await getDocument(
      authedRequest("/api/documents/not-a-uuid", b.cookie),
      params({ documentId: "not-a-uuid" }),
    );
    expect(res.status).toBe(404);
  });

  it("exports only the requesting user's data", async () => {
    const { a } = await setupVictim();
    const b = await createUser();
    await createCompletedOrder(b.actor);
    const res = await exportData(authedRequest("/api/account/export", b.cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.email).toBe(b.actor.email);
    expect(body.orders).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(a.actor.email);
    expect(body.orders[0].wills[0].draftAnswers.about.fullLegalName).toBe("Jordan Avery Sample");
  });
});

describe("signed-will upload size limit", () => {
  it("stops reading a body without Content-Length once it exceeds the limit", async () => {
    const a = await createUser();
    const { order, will } = await createPaidOrder(a.actor);
    const boundary = "----plainwill-test-boundary";
    const encoder = new TextEncoder();
    const head = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="willId"\r\n\r\n${will.id}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n%PDF-`,
    );
    const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
    const chunk = new Uint8Array(256 * 1024);
    const total = 64 * 1024 * 1024; // what a client streams with chunked encoding
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) controller.enqueue(head);
        if (sent >= total) {
          controller.enqueue(tail);
          controller.close();
          return;
        }
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const req = authedRequest(`/api/orders/${order.id}/uploads`, a.cookie, {
      method: "POST",
      body,
      headers: {
        accept: "application/json",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      // @ts-expect-error -- Node's fetch Request needs this for streamed bodies.
      duplex: "half",
    });
    expect(req.headers.get("content-length")).toBeNull();
    const res = await uploadRoute(req, params({ orderId: order.id }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { message: expect.stringMatching(/larger than 10 MB/) },
    });
    expect(sent).toBeLessThan(12 * 1024 * 1024);
  });
});

describe("admin-only routes reject customers", () => {
  it("rejects customers from staff JSON routes with 403", async () => {
    const customer = await createUser();
    const res = await adminOrders(authedRequest("/api/admin/orders", customer.cookie));
    expect(res.status).toBe(403);
    const audit = await adminAudit(authedRequest("/api/admin/audit", customer.cookie));
    expect(audit.status).toBe(403);
    expect((await adminOrders(authedRequest("/api/admin/orders", null))).status).toBe(401);
  });

  it("lets staff search orders but keeps the audit log admin-only", async () => {
    const { a } = await setupVictim();
    const staff = await createUser("staff");
    const admin = await createUser("admin");
    const res = await adminOrders(
      authedRequest(`/api/admin/orders?q=${encodeURIComponent(a.actor.email)}`, staff.cookie),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toHaveLength(1);
    expect((await adminAudit(authedRequest("/api/admin/audit", staff.cookie))).status).toBe(403);
    const adminRes = await adminAudit(
      authedRequest("/api/admin/audit?action=staff.", admin.cookie),
    );
    expect(adminRes.status).toBe(200);
    const actions = (await adminRes.json()).rows.map(
      (r: { entry: { action: string } }) => r.entry.action,
    );
    expect(actions).toContain("staff.orders.listed");
  });

  it("rejects customers at the service layer too", async () => {
    const { order } = await setupVictim();
    const customer = await createUser();
    await expect(adminListOrders(customer.actor, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminOrderDetail(customer.actor, order.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminListAudit(customer.actor, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      applyFilingAction(customer.actor, "00000000-0000-0000-0000-000000000000", {
        action: "vaulted",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("protects the cron endpoint with the bearer secret", async () => {
    expect(
      (
        await cronPost(
          new Request("http://localhost/api/cron/signing-reminders", { method: "POST" }),
        )
      ).status,
    ).toBe(401);
    const wrong = new Request("http://localhost/api/cron/signing-reminders", {
      method: "POST",
      headers: { authorization: "Bearer nope" },
    });
    expect((await cronPost(wrong)).status).toBe(401);
    const ok = new Request("http://localhost/api/cron/signing-reminders", {
      headers: { authorization: "Bearer integration-cron-secret-123" },
    });
    const res = await cronGet(ok);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 0 });
  });
});
