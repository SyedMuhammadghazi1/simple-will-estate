import "server-only";
import { db, type DbOrTx } from "@/db";
import { auditLog } from "@/db/schema";
import { logger } from "./logger";

export interface AuditActor {
  userId: string | null;
  role: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, role: "system" };

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  orderId?: string | null;
  /** ids, codes and counts only — never names, answers or file contents. */
  metadata?: Record<string, unknown>;
}

export async function writeAudit(actor: AuditActor, entry: AuditEntry, conn: DbOrTx = db) {
  await conn.insert(auditLog).values({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    orderId: entry.orderId ?? null,
    metadata: entry.metadata ?? {},
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
  logger.info(
    { audit: entry.action, actor: actor.userId, role: actor.role, target: entry.targetId },
    "audit",
  );
}
