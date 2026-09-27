import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { filingTasks, orders, user } from "@/db/schema";
import {
  canTransitionFiling,
  isFilingMethod,
  type FilingMethod,
  type FilingTaskStatus,
} from "@/lib/filing";
import { isValidIsoDate } from "@/lib/dates";
import { writeAudit } from "../audit";
import { filingCompletedEmail } from "../emails";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { errorInfo, logger } from "../logger";
import { sendEmailOnce } from "../mailer";
import { isStaff, type Actor } from "../session";
import { auditActor, isUuid, transitionOrder } from "./orders";

export const filingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sent_to_court"),
    trackingNumber: z.string().trim().min(3, "Enter the tracking number.").max(100),
  }),
  z.object({
    action: z.literal("filed"),
    courtReference: z.string().trim().min(2, "Enter the court reference number.").max(100),
    filedOn: z
      .string()
      .refine((v) => isValidIsoDate(v), "Enter the filing date (YYYY-MM-DD).")
      .refine(
        (v) => v <= new Date().toISOString().slice(0, 10),
        "Filing date can't be in the future.",
      ),
  }),
  z.object({
    action: z.literal("vaulted"),
    vaultReference: z.string().trim().max(100).optional().default(""),
  }),
]);
export type FilingAction = z.infer<typeof filingActionSchema>;

export async function listFilingQueue(statuses: FilingTaskStatus[] = ["pending", "sent_to_court"]) {
  return db
    .select({
      task: filingTasks,
      orderStatus: orders.status,
      customerName: user.name,
      customerEmail: user.email,
    })
    .from(filingTasks)
    .innerJoin(orders, eq(filingTasks.orderId, orders.id))
    .innerJoin(user, eq(orders.userId, user.id))
    .where(inArray(filingTasks.status, statuses))
    .orderBy(asc(filingTasks.createdAt));
}

/** Staff action on a filing task; keeps the order status in sync and emails on completion. */
export async function applyFilingAction(actor: Actor, taskId: string, input: unknown) {
  if (!isStaff(actor)) throw new ForbiddenError();
  if (!isUuid(taskId)) throw new NotFoundError();
  const parsed = filingActionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid input.",
      parsed.error.issues,
    );
  }
  const action = parsed.data;
  const actorRef = auditActor(actor);

  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(filingTasks)
      .where(eq(filingTasks.id, taskId))
      .for("update");
    if (!task) throw new NotFoundError();
    if (!isFilingMethod(task.method)) throw new Error("corrupt filing method");
    const method: FilingMethod = task.method;
    const from = task.status as FilingTaskStatus;
    const to: FilingTaskStatus = action.action;
    if (!canTransitionFiling(method, from, to)) {
      throw new ConflictError(
        `Can't mark a ${method.replace("_", " ")} task as ${to.replace(/_/g, " ")} from ${from.replace(/_/g, " ")}.`,
      );
    }
    const now = new Date();
    const set: Partial<typeof filingTasks.$inferInsert> = {
      status: to,
      updatedByUserId: actor.userId,
    };
    if (action.action === "sent_to_court") set.trackingNumber = action.trackingNumber;
    if (action.action === "filed") {
      set.courtReference = action.courtReference;
      set.filedOn = action.filedOn;
      set.completedAt = now;
    }
    if (action.action === "vaulted") {
      set.vaultReference = action.vaultReference || null;
      set.completedAt = now;
    }
    await tx.update(filingTasks).set(set).where(eq(filingTasks.id, task.id));
    await writeAudit(
      actorRef,
      {
        action: `filing.${to}`,
        targetType: "filing_task",
        targetId: task.id,
        orderId: task.orderId,
        metadata: { from, to, method },
      },
      tx,
    );
    if (to === "filed" || to === "vaulted") {
      await transitionOrder(tx, task.orderId, to, {
        actor: actorRef,
        actorType: "staff",
        reason: `filing_${to}`,
        set: { completedAt: now },
      });
    }
    return { orderId: task.orderId, to };
  });

  if (result.to === "filed" || result.to === "vaulted") {
    try {
      const [row] = await db
        .select({ email: user.email, name: user.name, userId: user.id })
        .from(orders)
        .innerJoin(user, eq(orders.userId, user.id))
        .where(eq(orders.id, result.orderId));
      if (row) {
        await sendEmailOnce(
          `filing-completed:${taskId}`,
          "filing_completed",
          filingCompletedEmail(row.email, row.name, result.orderId, result.to),
          { orderId: result.orderId, userId: row.userId },
        );
      }
    } catch (err) {
      logger.error({ err: errorInfo(err) }, "filing email failed");
    }
  }
  return result;
}
