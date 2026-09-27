import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/db";
import {
  documents,
  filingTasks,
  orderStatusHistory,
  orders,
  uploads,
  willVersions,
  wills,
  type OrderRow,
  type WillRow,
} from "@/db/schema";
import { assertTransition, isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { getPlan, type PlanId } from "@/lib/pricing";
import { emptyAnswers } from "@/lib/will/answers";
import { writeAudit, type AuditActor } from "../audit";
import { aad, encryptJson } from "../encryption";
import { ConflictError, NotFoundError } from "../errors";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { isStaff, type Actor } from "../session";

export function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

export function statusOf(order: Pick<OrderRow, "status">): OrderStatus {
  if (!isOrderStatus(order.status)) throw new Error(`Corrupt order status ${order.status}`);
  return order.status;
}

export function auditActor(actor: Actor): AuditActor {
  return { userId: actor.userId, role: actor.role, ip: actor.ip, userAgent: actor.userAgent };
}

/**
 * Loads an order the actor may access. Customers only see their own orders; staff see all
 * (callers are responsible for auditing staff access to PII). Other users' orders are reported
 * as "not found" so ids can't be probed.
 */
export async function getOrderForActor(
  actor: Actor,
  orderId: string,
  opts: { allowStaff?: boolean; conn?: DbOrTx } = {},
): Promise<OrderRow> {
  if (!isUuid(orderId)) throw new NotFoundError();
  const conn = opts.conn ?? db;
  const [order] = await conn.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError();
  const owner = order.userId === actor.userId;
  if (!owner && !(opts.allowStaff && isStaff(actor))) throw new NotFoundError();
  return order;
}

export async function getWillForActor(
  actor: Actor,
  willId: string,
  opts: { allowStaff?: boolean } = {},
): Promise<{ will: WillRow; order: OrderRow }> {
  if (!isUuid(willId)) throw new NotFoundError();
  const [row] = await db
    .select({ will: wills, order: orders })
    .from(wills)
    .innerJoin(orders, eq(wills.orderId, orders.id))
    .where(eq(wills.id, willId))
    .limit(1);
  if (!row) throw new NotFoundError();
  const owner = row.order.userId === actor.userId;
  if (!owner && !(opts.allowStaff && isStaff(actor))) throw new NotFoundError();
  return row;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function createOrder(actor: Actor, planId: PlanId): Promise<OrderRow> {
  await enforceRateLimit(RATE_LIMITS.orderCreate, actor.userId);
  const plan = getPlan(planId);
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        userId: actor.userId,
        plan: plan.id,
        status: "draft",
        amountCents: plan.amountCents,
        currency: plan.currency,
      })
      .returning();
    if (!order) throw new Error("order insert failed");
    for (let position = 1; position <= plan.willCount; position++) {
      const [will] = await tx
        .insert(wills)
        .values({ orderId: order.id, position, draftCiphertext: "pending" })
        .returning({ id: wills.id });
      if (!will) throw new Error("will insert failed");
      await tx
        .update(wills)
        .set({ draftCiphertext: encryptJson(emptyAnswers(), aad.willDraft(will.id)) })
        .where(eq(wills.id, will.id));
    }
    await writeAudit(
      auditActor(actor),
      {
        action: "order.created",
        targetType: "order",
        targetId: order.id,
        orderId: order.id,
        metadata: { plan: plan.id },
      },
      tx,
    );
    return order;
  });
}

export async function cancelDraftOrder(actor: Actor, orderId: string): Promise<void> {
  const order = await getOrderForActor(actor, orderId);
  await db.transaction(async (tx) => {
    await transitionOrder(tx, order.id, "cancelled", {
      actor: auditActor(actor),
      actorType: "customer",
      reason: "cancelled_by_customer",
    });
  });
}

export async function listOrdersForUser(userId: string) {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
}

export async function listWills(orderId: string, conn: DbOrTx = db) {
  return conn.select().from(wills).where(eq(wills.orderId, orderId)).orderBy(asc(wills.position));
}

/** Latest version per will (the one customers sign). */
export async function latestVersions(orderId: string, conn: DbOrTx = db) {
  const rows = await conn
    .select()
    .from(willVersions)
    .where(eq(willVersions.orderId, orderId))
    .orderBy(asc(willVersions.willId), desc(willVersions.version));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.willId)) latest.set(r.willId, r);
  return latest;
}

export async function orderOverview(orderId: string) {
  const [willRows, versions, docs, ups, tasks, history] = await Promise.all([
    listWills(orderId),
    db
      .select({
        id: willVersions.id,
        willId: willVersions.willId,
        version: willVersions.version,
        answersSha256: willVersions.answersSha256,
        stateCode: willVersions.stateCode,
        reason: willVersions.reason,
        createdAt: willVersions.createdAt,
      })
      .from(willVersions)
      .where(eq(willVersions.orderId, orderId))
      .orderBy(desc(willVersions.version)),
    db
      .select({
        id: documents.id,
        versionId: documents.versionId,
        willId: documents.willId,
        kind: documents.kind,
        sha256: documents.sha256,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.orderId, orderId)),
    db
      .select({
        id: uploads.id,
        willId: uploads.willId,
        versionId: uploads.versionId,
        mimeType: uploads.mimeType,
        sizeBytes: uploads.sizeBytes,
        createdAt: uploads.createdAt,
      })
      .from(uploads)
      .where(eq(uploads.orderId, orderId))
      .orderBy(desc(uploads.createdAt)),
    db
      .select()
      .from(filingTasks)
      .where(eq(filingTasks.orderId, orderId))
      .orderBy(desc(filingTasks.createdAt)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt)),
  ]);
  return { wills: willRows, versions, documents: docs, uploads: ups, filingTasks: tasks, history };
}

export interface TransitionOptions {
  actor: AuditActor;
  actorType: "customer" | "staff" | "system";
  reason?: string;
  /** Extra columns to set on the order in the same update. */
  set?: Partial<typeof orders.$inferInsert>;
}

/**
 * Moves an order to `to`, enforcing the state machine, with optimistic concurrency (the update
 * only succeeds if the status is still what we read) and an audit trail.
 */
export async function transitionOrder(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  opts: TransitionOptions,
): Promise<OrderRow> {
  const [current] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update")
    .limit(1);
  if (!current) throw new NotFoundError();
  const from = statusOf(current);
  assertTransition(from, to);
  const [updated] = await tx
    .update(orders)
    .set({ ...opts.set, status: to, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, from)))
    .returning();
  if (!updated)
    throw new ConflictError("The order changed while we were updating it. Please retry.");
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: from,
    toStatus: to,
    actorUserId: opts.actor.userId,
    actorType: opts.actorType,
    reason: opts.reason ?? null,
  });
  await writeAudit(
    opts.actor,
    {
      action: "order.status_changed",
      targetType: "order",
      targetId: orderId,
      orderId,
      metadata: { from, to, reason: opts.reason ?? null },
    },
    tx,
  );
  return updated;
}
