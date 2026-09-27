import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { filingTasks, orders, uploads, wills } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { checkUpload, sanitizeFilename, EXTENSION_FOR_TYPE } from "@/lib/file-type";
import { availableFilingMethods, isFilingMethodAllowed, type FilingMethod } from "@/lib/filing";
import { canRecordExecution } from "@/lib/order-status";
import { getStateRule, isStateCode } from "@/lib/states";
import { writeAudit } from "../audit";
import { aad, decryptBuffer, decryptText, encryptBuffer, encryptText } from "../encryption";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { isStaff, type Actor } from "../actor";
import {
  auditActor,
  getOrderForActor,
  isUuid,
  latestVersions,
  listWills,
  orderRef,
  statusOf,
  transitionOrder,
} from "./orders";

/** Stores an encrypted scan of the signed will for the will's current version. */
export async function uploadSignedWill(
  actor: Actor,
  orderId: string,
  willId: string,
  file: { bytes: Uint8Array; filename: string },
) {
  await enforceRateLimit(RATE_LIMITS.upload, actor.userId);
  const order = await getOrderForActor(actor, orderId);
  if (!canRecordExecution(statusOf(order))) {
    throw new ConflictError(
      "Signed copies can be uploaded once your documents are ready and before filing starts.",
    );
  }
  if (!isUuid(willId)) throw new NotFoundError();
  const [will] = await db
    .select()
    .from(wills)
    .where(and(eq(wills.id, willId), eq(wills.orderId, order.id)))
    .limit(1);
  if (!will) throw new NotFoundError();
  const check = checkUpload(file.bytes);
  if (!check.ok) throw new ValidationError(check.message, { code: check.code });
  const version = (await latestVersions(order.id)).get(will.id);
  if (!version) throw new ConflictError("This will has no final version yet.");

  const id = randomUUID();
  const filename = sanitizeFilename(
    file.filename,
    `signed-will.${EXTENSION_FOR_TYPE[check.mimeType]}`,
  );
  await db.insert(uploads).values({
    id,
    orderId: order.id,
    willId: will.id,
    versionId: version.id,
    uploadedByUserId: actor.userId,
    mimeType: check.mimeType,
    sizeBytes: file.bytes.length,
    sha256: sha256Hex(file.bytes),
    filenameCiphertext: encryptText(filename, aad.uploadName(id)),
    dataCiphertext: encryptBuffer(file.bytes, aad.upload(id)),
  });
  await writeAudit(auditActor(actor), {
    action: "upload.created",
    targetType: "upload",
    targetId: id,
    orderId: order.id,
    metadata: { mimeType: check.mimeType, sizeBytes: file.bytes.length, version: version.version },
  });
  return { id, mimeType: check.mimeType };
}

/** Returns an upload's decrypted bytes for its owner, or for staff (audited). */
export async function readUpload(actor: Actor, uploadId: string) {
  if (!isUuid(uploadId)) throw new NotFoundError();
  const [row] = await db
    .select({ upload: uploads, ownerId: orders.userId })
    .from(uploads)
    .innerJoin(orders, eq(uploads.orderId, orders.id))
    .where(eq(uploads.id, uploadId))
    .limit(1);
  if (!row) throw new NotFoundError();
  const owner = row.ownerId === actor.userId;
  if (!owner && !isStaff(actor)) throw new NotFoundError();
  const bytes = decryptBuffer(row.upload.dataCiphertext, aad.upload(row.upload.id));
  if (sha256Hex(bytes) !== row.upload.sha256) throw new Error("Upload integrity check failed");
  await writeAudit(auditActor(actor), {
    action: owner ? "upload.downloaded" : "staff.upload.viewed",
    targetType: "upload",
    targetId: row.upload.id,
    orderId: row.upload.orderId,
  });
  return {
    bytes,
    mimeType: row.upload.mimeType,
    filename: decryptText(row.upload.filenameCiphertext, aad.uploadName(row.upload.id)),
  };
}

/** Wills of an order whose current version has no signed upload yet. */
export async function willsMissingSignedCopy(orderId: string): Promise<string[]> {
  const [willRows, versions] = await Promise.all([listWills(orderId), latestVersions(orderId)]);
  const versionIds = [...versions.values()].map((v) => v.id);
  if (versionIds.length === 0) return willRows.map((w) => w.id);
  const ups = await db
    .select({ versionId: uploads.versionId })
    .from(uploads)
    .where(inArray(uploads.versionId, versionIds));
  const uploaded = new Set(ups.map((u) => u.versionId));
  return willRows.filter((w) => !uploaded.has(versions.get(w.id)?.id ?? "")).map((w) => w.id);
}

/**
 * Customer confirms the will was signed with witnesses and chooses where the original goes.
 * Records execution (→ executed), creates a filing task for staff (→ filing_in_progress).
 */
export async function recordExecutionAndChooseFiling(
  actor: Actor,
  orderId: string,
  method: FilingMethod,
  confirmations: { signedWithWitnesses: boolean },
) {
  const order = await getOrderForActor(actor, orderId);
  const status = statusOf(order);
  if (!canRecordExecution(status))
    throw new ConflictError("This order isn't waiting for a signed will.");
  if (!confirmations.signedWithWitnesses) {
    throw new ValidationError(
      "Please confirm that you signed your will as described in the signing instructions.",
    );
  }
  const missing = await willsMissingSignedCopy(order.id);
  if (missing.length > 0) {
    throw new ValidationError("Upload a scan of every signed will before confirming.");
  }
  const versions = await latestVersions(order.id);
  const stateCode = [...versions.values()][0]?.stateCode ?? order.stateCode;
  if (!stateCode || !isStateCode(stateCode))
    throw new ConflictError("Unknown state for this order.");
  const rule = getStateRule(stateCode);
  if (!isFilingMethodAllowed(rule, method)) {
    throw new ValidationError(`That filing option isn't available in ${rule.name}.`, {
      allowed: availableFilingMethods(rule),
    });
  }

  const actorRef = auditActor(actor);
  const taskId = await db.transaction(async (tx) => {
    if (status === "documents_ready") {
      await transitionOrder(tx, order.id, "awaiting_execution", {
        actor: actorRef,
        actorType: "customer",
        reason: "signing_confirmed",
      });
    }
    await transitionOrder(tx, order.id, "executed", {
      actor: actorRef,
      actorType: "customer",
      reason: "customer_confirmed_signing",
      set: { executedAt: new Date() },
    });
    const [task] = await tx
      .insert(filingTasks)
      .values({
        orderId: order.id,
        method,
        status: "pending",
        stateCode,
        depositAuthority: method === "court_deposit" ? rule.depositAuthority : null,
      })
      .returning({ id: filingTasks.id });
    if (!task) throw new Error("filing task insert failed");
    await writeAudit(
      actorRef,
      {
        action: "filing.requested",
        targetType: "filing_task",
        targetId: task.id,
        orderId: order.id,
        metadata: { method },
      },
      tx,
    );
    await transitionOrder(tx, order.id, "filing_in_progress", {
      actor: actorRef,
      actorType: "customer",
      reason: `filing_method_${method}`,
      set: { filingMethod: method },
    });
    return task.id;
  });
  return { taskId, ref: orderRef(order.id) };
}

export async function orderStateRule(orderId: string) {
  const [o] = await db
    .select({ stateCode: orders.stateCode })
    .from(orders)
    .where(eq(orders.id, orderId));
  return o?.stateCode && isStateCode(o.stateCode) ? getStateRule(o.stateCode) : null;
}
