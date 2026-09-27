import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLog, emailLog, filingTasks, orders, uploads } from "@/db/schema";
import { sampleAnswers } from "@/lib/will/sample";
import { ConflictError, ValidationError } from "@/server/errors";
import { adminOrderDetail } from "@/server/services/admin";
import {
  readUpload,
  recordExecutionAndChooseFiling,
  uploadSignedWill,
} from "@/server/services/execution";
import { applyFilingAction, listFilingQueue } from "@/server/services/filing";
import { createPaidOrder, createUser, PDF_BYTES, PNG_BYTES } from "./helpers";

async function signedOrder(stateCode = "TX") {
  const customer = await createUser();
  const answers = sampleAnswers();
  answers.about.stateCode = stateCode;
  const { order, will } = await createPaidOrder(customer.actor, answers);
  await uploadSignedWill(customer.actor, order.id, will.id, {
    bytes: PDF_BYTES,
    filename: "../../signed will.pdf",
  });
  return { customer, order, will };
}

describe("uploads of the signed will", () => {
  it("stores the scan encrypted with a sanitized name and verified type", async () => {
    const { customer, order } = await signedOrder();
    const [row] = await db.select().from(uploads).where(eq(uploads.orderId, order.id));
    expect(row!.mimeType).toBe("application/pdf");
    expect(row!.dataCiphertext.includes(Buffer.from("%PDF"))).toBe(false);
    const file = await readUpload(customer.actor, row!.id);
    expect(file.filename).toBe("signed will.pdf");
    expect(Buffer.from(file.bytes)).toEqual(Buffer.from(PDF_BYTES));
  });

  it("accepts PNG, rejects spoofed and oversized files", async () => {
    const customer = await createUser();
    const { order, will } = await createPaidOrder(customer.actor);
    await expect(
      uploadSignedWill(customer.actor, order.id, will.id, {
        bytes: PNG_BYTES,
        filename: "scan.png",
      }),
    ).resolves.toMatchObject({
      mimeType: "image/png",
    });
    const html = new Uint8Array(Buffer.from("<html><script>alert(1)</script></html>"));
    await expect(
      uploadSignedWill(customer.actor, order.id, will.id, { bytes: html, filename: "will.pdf" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PDF_BYTES);
    await expect(
      uploadSignedWill(customer.actor, order.id, will.id, { bytes: big, filename: "big.pdf" }),
    ).rejects.toThrow(/10 MB/);
  });

  it("refuses uploads before payment", async () => {
    const customer = await createUser();
    const { createCompletedOrder } = await import("./helpers");
    const { order, will } = await createCompletedOrder(customer.actor);
    await expect(
      uploadSignedWill(customer.actor, order.id, will.id, { bytes: PDF_BYTES, filename: "x.pdf" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("staff filing flow", () => {
  it("court deposit: executed → filing task → sent to court → filed", async () => {
    const { customer, order } = await signedOrder("TX");
    const staff = await createUser("staff");

    await expect(
      recordExecutionAndChooseFiling(customer.actor, order.id, "court_deposit", {
        signedWithWitnesses: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const { taskId } = await recordExecutionAndChooseFiling(
      customer.actor,
      order.id,
      "court_deposit",
      {
        signedWithWitnesses: true,
      },
    );
    let [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("filing_in_progress");
    expect(o!.executedAt).toBeInstanceOf(Date);
    expect(o!.filingMethod).toBe("court_deposit");

    const queue = await listFilingQueue();
    expect(queue.map((q) => q.task.id)).toEqual([taskId]);
    expect(queue[0]!.task.depositAuthority).toBe("County clerk");

    // A second filing request for the same order is impossible
    await expect(
      recordExecutionAndChooseFiling(customer.actor, order.id, "vault", {
        signedWithWitnesses: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      applyFilingAction(staff.actor, taskId, { action: "vaulted" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      applyFilingAction(staff.actor, taskId, { action: "sent_to_court", trackingNumber: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await applyFilingAction(staff.actor, taskId, {
      action: "sent_to_court",
      trackingNumber: "1Z999AA10123456784",
    });
    await expect(
      applyFilingAction(staff.actor, taskId, {
        action: "filed",
        courtReference: "W-2026-001",
        filedOn: "2999-01-01",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await applyFilingAction(staff.actor, taskId, {
      action: "filed",
      courtReference: "W-2026-001",
      filedOn: "2026-09-01",
    });

    [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("filed");
    const [task] = await db.select().from(filingTasks).where(eq(filingTasks.id, taskId));
    expect(task).toMatchObject({
      status: "filed",
      trackingNumber: "1Z999AA10123456784",
      courtReference: "W-2026-001",
      filedOn: "2026-09-01",
    });
    expect(await listFilingQueue()).toEqual([]);

    const actions = (await db.select().from(auditLog).where(eq(auditLog.orderId, order.id))).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "filing.requested",
        "filing.sent_to_court",
        "filing.filed",
        "order.status_changed",
      ]),
    );
    const emails = await db
      .select()
      .from(emailLog)
      .where(and(eq(emailLog.orderId, order.id), eq(emailLog.kind, "filing_completed")));
    expect(emails).toHaveLength(1);
  });

  it("vault safekeeping: pending → vaulted", async () => {
    const { customer, order } = await signedOrder("CA");
    const admin = await createUser("admin");
    await expect(
      recordExecutionAndChooseFiling(customer.actor, order.id, "court_deposit", {
        signedWithWitnesses: true,
      }),
    ).rejects.toThrow(/isn't available in California/);
    const { taskId } = await recordExecutionAndChooseFiling(customer.actor, order.id, "vault", {
      signedWithWitnesses: true,
    });
    await expect(
      applyFilingAction(admin.actor, taskId, { action: "sent_to_court", trackingNumber: "abc123" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await applyFilingAction(admin.actor, taskId, { action: "vaulted", vaultReference: "BOX-7" });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("vaulted");
  });

  it("requires a signed copy of every will before execution can be recorded", async () => {
    const customer = await createUser();
    const { order } = await createPaidOrder(customer.actor);
    await expect(
      recordExecutionAndChooseFiling(customer.actor, order.id, "vault", {
        signedWithWitnesses: true,
      }),
    ).rejects.toThrow(/Upload a scan/);
  });

  it("audits every staff view of customer PII", async () => {
    const { order, customer } = await signedOrder();
    const staff = await createUser("staff");
    const detail = await adminOrderDetail(staff.actor, order.id);
    expect(detail.customer.email).toBe(customer.actor.email);
    expect(detail.answers.values().next().value?.about.fullLegalName).toBe("Jordan Avery Sample");
    const [upload] = await db.select().from(uploads).where(eq(uploads.orderId, order.id));
    await readUpload(staff.actor, upload!.id);
    const staffActions = (
      await db.select().from(auditLog).where(eq(auditLog.actorUserId, staff.actor.userId))
    ).map((a) => a.action);
    expect(staffActions).toEqual(
      expect.arrayContaining(["staff.order.pii_viewed", "staff.upload.viewed"]),
    );
  });
});
