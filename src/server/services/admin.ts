import "server-only";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  accountDeletionRequests,
  auditLog,
  filingTasks,
  orderNotes,
  orders,
  user,
} from "@/db/schema";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { isPlanId } from "@/lib/pricing";
import { writeAudit } from "../audit";
import { aad, decryptText, encryptText } from "../encryption";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { isStaff, type Actor } from "../session";
import { decryptVersionAnswers } from "./documents";
import { auditActor, isUuid, orderOverview } from "./orders";
import { willVersions } from "@/db/schema";
import { decryptDraft } from "./wills";

function assertStaff(actor: Actor) {
  if (!isStaff(actor)) throw new ForbiddenError();
}

export interface OrderFilters {
  status?: string;
  plan?: string;
  q?: string;
  page?: number;
}

export const ADMIN_PAGE_SIZE = 25;

export async function adminListOrders(actor: Actor, filters: OrderFilters) {
  assertStaff(actor);
  const conditions: SQL[] = [];
  if (filters.status && isOrderStatus(filters.status))
    conditions.push(eq(orders.status, filters.status));
  if (filters.plan && isPlanId(filters.plan)) conditions.push(eq(orders.plan, filters.plan));
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const byId = /^[0-9a-f-]{4,36}$/i.test(q)
      ? [sql`${orders.id}::text ilike ${`${q.toLowerCase()}%`}`]
      : [];
    conditions.push(or(ilike(user.email, like), ilike(user.name, like), ...byId) as SQL);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, Math.min(1000, Math.floor(filters.page ?? 1)));
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        plan: orders.plan,
        amountCents: orders.amountCents,
        stateCode: orders.stateCode,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        customerName: user.name,
        customerEmail: user.email,
      })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db.select({ n: count() }).from(orders).innerJoin(user, eq(orders.userId, user.id)).where(where),
  ]);
  await writeAudit(auditActor(actor), {
    action: "staff.orders.listed",
    metadata: {
      status: filters.status ?? null,
      plan: filters.plan ?? null,
      searched: Boolean(q),
      page,
      results: rows.length,
    },
  });
  return { rows, total: total?.n ?? 0, page, pageSize: ADMIN_PAGE_SIZE };
}

/** Full order detail including decrypted answers. EVERY call is written to the audit log. */
export async function adminOrderDetail(actor: Actor, orderId: string) {
  assertStaff(actor);
  if (!isUuid(orderId)) throw new NotFoundError();
  const [row] = await db
    .select({
      order: orders,
      customer: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    })
    .from(orders)
    .innerJoin(user, eq(orders.userId, user.id))
    .where(eq(orders.id, orderId));
  if (!row) throw new NotFoundError();
  const overview = await orderOverview(orderId);
  const versionRows = await db.select().from(willVersions).where(eq(willVersions.orderId, orderId));
  const latestAnswers = new Map<string, ReturnType<typeof decryptDraft>>();
  for (const w of overview.wills) {
    const latest = versionRows
      .filter((v) => v.willId === w.id)
      .sort((a, b) => b.version - a.version)[0];
    latestAnswers.set(w.id, latest ? decryptVersionAnswers(latest) : decryptDraft(w));
  }
  const notes = await db
    .select({
      id: orderNotes.id,
      body: orderNotes.bodyCiphertext,
      createdAt: orderNotes.createdAt,
      author: user.name,
    })
    .from(orderNotes)
    .innerJoin(user, eq(orderNotes.authorUserId, user.id))
    .where(eq(orderNotes.orderId, orderId))
    .orderBy(desc(orderNotes.createdAt));
  await writeAudit(auditActor(actor), {
    action: "staff.order.pii_viewed",
    targetType: "order",
    targetId: orderId,
    orderId,
    metadata: { customerId: row.customer.id },
  });
  return {
    ...row,
    ...overview,
    answers: latestAnswers,
    notes: notes.map((n) => ({ ...n, body: decryptText(n.body, aad.note(n.id)) })),
  };
}

export async function addOrderNote(actor: Actor, orderId: string, body: string) {
  assertStaff(actor);
  if (!isUuid(orderId)) throw new NotFoundError();
  const text = body.trim();
  if (text.length === 0 || text.length > 4000)
    throw new ValidationError("Notes must be 1–4000 characters.");
  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId));
  if (!order) throw new NotFoundError();
  const id = randomUUID();
  await db.insert(orderNotes).values({
    id,
    orderId,
    authorUserId: actor.userId,
    bodyCiphertext: encryptText(text, aad.note(id)),
  });
  await writeAudit(auditActor(actor), {
    action: "staff.note.added",
    targetType: "order_note",
    targetId: id,
    orderId,
  });
}

export async function adminDashboardCounts(actor: Actor) {
  assertStaff(actor);
  const [byStatus, openFiling, pendingDeletion] = await Promise.all([
    db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status),
    db
      .select({ n: count() })
      .from(filingTasks)
      .where(sql`${filingTasks.status} in ('pending','sent_to_court')`),
    db
      .select({
        id: accountDeletionRequests.id,
        createdAt: accountDeletionRequests.createdAt,
        email: user.email,
      })
      .from(accountDeletionRequests)
      .innerJoin(user, eq(accountDeletionRequests.userId, user.id))
      .where(eq(accountDeletionRequests.status, "pending"))
      .orderBy(desc(accountDeletionRequests.createdAt)),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Partial<
    Record<OrderStatus, number>
  >;
  return { counts, openFiling: openFiling[0]?.n ?? 0, pendingDeletion };
}

export async function adminListAudit(
  actor: Actor,
  filters: { action?: string; orderId?: string; page?: number },
) {
  if (actor.role !== "admin") throw new ForbiddenError();
  const conditions: SQL[] = [];
  if (filters.action)
    conditions.push(ilike(auditLog.action, `${filters.action.replace(/[%_\\]/g, "")}%`));
  if (filters.orderId && isUuid(filters.orderId))
    conditions.push(eq(auditLog.orderId, filters.orderId));
  const page = Math.max(1, Math.min(1000, Math.floor(filters.page ?? 1)));
  const rows = await db
    .select({ entry: auditLog, actorEmail: user.email })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorUserId, user.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(50)
    .offset((page - 1) * 50);
  return { rows, page };
}
