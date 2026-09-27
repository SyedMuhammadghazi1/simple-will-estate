import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountDeletionRequests,
  filingTasks,
  orderStatusHistory,
  orders,
  uploads,
  user,
  willVersions,
  wills,
} from "@/db/schema";
import { writeAudit } from "../audit";
import { deletionRequestedEmail } from "../emails";
import { ConflictError } from "../errors";
import { sendEmailOnce } from "../mailer";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import type { Actor } from "../actor";
import { decryptVersionAnswers } from "./documents";
import { auditActor } from "./orders";
import { decryptDraft } from "./wills";

/** Machine-readable export of everything we hold about the user (data portability). */
export async function exportUserData(actor: Actor) {
  await enforceRateLimit(RATE_LIMITS.export, actor.userId);
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, actor.userId));
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, actor.userId))
    .orderBy(desc(orders.createdAt));
  const orderIds = orderRows.map((o) => o.id);
  const [willRows, versionRows, uploadRows, taskRows, historyRows, deletionRows] = orderIds.length
    ? await Promise.all([
        db.select().from(wills).where(inArray(wills.orderId, orderIds)),
        db.select().from(willVersions).where(inArray(willVersions.orderId, orderIds)),
        db
          .select({
            id: uploads.id,
            orderId: uploads.orderId,
            willId: uploads.willId,
            versionId: uploads.versionId,
            mimeType: uploads.mimeType,
            sizeBytes: uploads.sizeBytes,
            sha256: uploads.sha256,
            createdAt: uploads.createdAt,
          })
          .from(uploads)
          .where(inArray(uploads.orderId, orderIds)),
        db.select().from(filingTasks).where(inArray(filingTasks.orderId, orderIds)),
        db.select().from(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds)),
        db
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, actor.userId)),
      ])
    : [
        [],
        [],
        [],
        [],
        [],
        await db
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, actor.userId)),
      ];

  await writeAudit(auditActor(actor), {
    action: "account.data_exported",
    targetType: "user",
    targetId: actor.userId,
  });

  return {
    exportedAt: new Date().toISOString(),
    profile,
    orders: orderRows.map((o) => ({
      id: o.id,
      plan: o.plan,
      status: o.status,
      amountCents: o.amountCents,
      currency: o.currency,
      stateCode: o.stateCode,
      paidAt: o.paidAt,
      documentsReadyAt: o.documentsReadyAt,
      executedAt: o.executedAt,
      completedAt: o.completedAt,
      updateWindowEndsAt: o.updateWindowEndsAt,
      filingMethod: o.filingMethod,
      createdAt: o.createdAt,
      wills: willRows
        .filter((w) => w.orderId === o.id)
        .map((w) => ({
          id: w.id,
          position: w.position,
          draftAnswers: decryptDraft(w),
          draftUpdatedAt: w.draftUpdatedAt,
          versions: versionRows
            .filter((v) => v.willId === w.id)
            .map((v) => ({
              id: v.id,
              version: v.version,
              reason: v.reason,
              createdAt: v.createdAt,
              answersSha256: v.answersSha256,
              answers: decryptVersionAnswers(v),
            })),
        })),
      signedUploads: uploadRows.filter((u) => u.orderId === o.id),
      filingTasks: taskRows.filter((t) => t.orderId === o.id),
      statusHistory: historyRows
        .filter((h) => h.orderId === o.id)
        .map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt, reason: h.reason })),
    })),
    deletionRequests: deletionRows.map((d) => ({
      status: d.status,
      requestedAt: d.createdAt,
      processedAt: d.processedAt,
    })),
  };
}

export async function requestAccountDeletion(actor: Actor) {
  const inserted = await db
    .insert(accountDeletionRequests)
    .values({ userId: actor.userId })
    .onConflictDoNothing()
    .returning({ id: accountDeletionRequests.id });
  if (inserted.length === 0)
    throw new ConflictError("You already have a pending deletion request.");
  await writeAudit(auditActor(actor), {
    action: "account.deletion_requested",
    targetType: "user",
    targetId: actor.userId,
  });
  await sendEmailOnce(
    `deletion-requested:${inserted[0]?.id}`,
    "deletion_requested",
    deletionRequestedEmail(actor.email, actor.name),
    {
      userId: actor.userId,
    },
  );
}

export async function pendingDeletionRequest(userId: string) {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, userId))
    .orderBy(desc(accountDeletionRequests.createdAt))
    .limit(1);
  return row?.status === "pending" ? row : null;
}
