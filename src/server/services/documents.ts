import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { documents, willVersions, wills, type OrderRow, type WillRow } from "@/db/schema";
import { publicEnv } from "@/env";
import { canonicalJson, sha256Hex } from "@/lib/crypto";
import type { DocumentModel } from "@/lib/documents/model";
import { renderDocumentPdf } from "@/lib/documents/render-pdf";
import { buildSigningInstructions } from "@/lib/documents/signing-instructions";
import { buildWillDocument } from "@/lib/documents/will-document";
import { getStateRule, isStateCode } from "@/lib/states";
import { parseAnswers, type WillAnswers } from "@/lib/will/answers";
import { writeAudit } from "../audit";
import { aad, decryptBuffer, decryptJson, encryptBuffer, encryptJson } from "../encryption";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { logger } from "../logger";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { isStaff, type Actor } from "../session";
import { auditActor, getWillForActor, isUuid, orderRef, transitionOrder } from "./orders";
import { decryptDraft } from "./wills";
import { orders } from "@/db/schema";

export type DocumentKind = "will" | "signing_instructions";
export const DOCUMENT_KINDS: readonly DocumentKind[] = ["will", "signing_instructions"];

export function isDocumentKind(v: unknown): v is DocumentKind {
  return v === "will" || v === "signing_instructions";
}

function buildModel(
  kind: DocumentKind,
  answers: WillAnswers,
  reference: string,
  createdAt: Date,
): DocumentModel {
  if (!isStateCode(answers.about.stateCode)) {
    throw new ValidationError("Choose your state before generating documents.");
  }
  const input = {
    answers,
    state: getStateRule(answers.about.stateCode),
    reference,
    createdAt,
    appName: publicEnv.appName,
  };
  return kind === "will" ? buildWillDocument(input) : buildSigningInstructions(input);
}

/** Creates the next immutable version of a will from its answers (snapshot + hash). */
export async function createWillVersion(
  tx: Tx,
  will: Pick<WillRow, "id" | "orderId">,
  answers: WillAnswers,
  reason: "initial" | "update",
  createdByUserId: string | null,
) {
  const [latest] = await tx
    .select({ version: willVersions.version })
    .from(willVersions)
    .where(eq(willVersions.willId, will.id))
    .orderBy(desc(willVersions.version))
    .limit(1);
  const id = randomUUID();
  const canonical = canonicalJson(answers);
  if (!isStateCode(answers.about.stateCode))
    throw new ValidationError("Missing state of residence.");
  const [version] = await tx
    .insert(willVersions)
    .values({
      id,
      willId: will.id,
      orderId: will.orderId,
      version: (latest?.version ?? 0) + 1,
      answersCiphertext: encryptJson(JSON.parse(canonical), aad.willVersion(id)),
      answersSha256: sha256Hex(canonical),
      stateCode: answers.about.stateCode,
      reason,
      createdByUserId,
    })
    .returning();
  if (!version) throw new Error("version insert failed");
  return version;
}

export function decryptVersionAnswers(version: {
  id: string;
  answersCiphertext: string;
  answersSha256: string;
}): WillAnswers {
  const raw = decryptJson(version.answersCiphertext, aad.willVersion(version.id));
  if (sha256Hex(canonicalJson(raw)) !== version.answersSha256) {
    throw new Error(`Integrity check failed for will version ${version.id}`);
  }
  return parseAnswers(raw);
}

/** Renders and stores the final (unwatermarked) documents for a version. Deterministic. */
export async function generateDocumentsForVersion(
  tx: Tx,
  version: typeof willVersions.$inferSelect,
  position: number,
) {
  const answers = decryptVersionAnswers(version);
  const reference = `Ref ${orderRef(version.orderId)} · Will ${position} · Version ${version.version} · ${version.answersSha256.slice(0, 12)}`;
  const out = [];
  for (const kind of DOCUMENT_KINDS) {
    const pdf = await renderDocumentPdf(buildModel(kind, answers, reference, version.createdAt));
    const id = randomUUID();
    const [row] = await tx
      .insert(documents)
      .values({
        id,
        versionId: version.id,
        willId: version.willId,
        orderId: version.orderId,
        kind,
        sha256: sha256Hex(pdf),
        sizeBytes: pdf.length,
        dataCiphertext: encryptBuffer(pdf, aad.document(id)),
      })
      .returning({ id: documents.id, kind: documents.kind, sha256: documents.sha256 });
    out.push(row);
  }
  return out;
}

export function documentFilename(
  kind: DocumentKind,
  orderId: string,
  position: number,
  version: number,
) {
  const base = kind === "will" ? "last-will-and-testament" : "signing-instructions";
  return `${base}-${orderRef(orderId).toLowerCase()}-will${position}-v${version}.pdf`;
}

/**
 * Returns a final document's bytes if the actor may read it. Staff access is audited.
 * A customer's first download of the will moves the order to "awaiting_execution".
 */
export async function readDocument(actor: Actor, documentId: string) {
  if (!isUuid(documentId)) throw new NotFoundError();
  const [row] = await db
    .select({ doc: documents, order: orders, version: willVersions, position: wills.position })
    .from(documents)
    .innerJoin(orders, eq(documents.orderId, orders.id))
    .innerJoin(willVersions, eq(documents.versionId, willVersions.id))
    .innerJoin(wills, eq(documents.willId, wills.id))
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!row) throw new NotFoundError();
  const owner = row.order.userId === actor.userId;
  if (!owner && !isStaff(actor)) throw new NotFoundError();

  const bytes = decryptBuffer(row.doc.dataCiphertext, aad.document(row.doc.id));
  if (sha256Hex(bytes) !== row.doc.sha256) {
    logger.error({ documentId }, "document integrity check failed");
    throw new Error("Document integrity check failed");
  }

  await writeAudit(auditActor(actor), {
    action: owner ? "document.downloaded" : "staff.document.viewed",
    targetType: "document",
    targetId: row.doc.id,
    orderId: row.order.id,
    metadata: { kind: row.doc.kind, version: row.version.version },
  });

  if (owner && row.doc.kind === "will" && row.order.status === "documents_ready") {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, row.order.id))
        .for("update");
      if (fresh?.status === "documents_ready") {
        await transitionOrder(tx, row.order.id, "awaiting_execution", {
          actor: auditActor(actor),
          actorType: "customer",
          reason: "final_documents_downloaded",
        });
      }
    });
  }

  return {
    bytes,
    filename: documentFilename(row.doc.kind, row.order.id, row.position, row.version.version),
  };
}

/** Watermarked preview rendered from the current (unpaid or in-progress) draft. */
export async function renderDraftPreview(actor: Actor, willId: string, kind: DocumentKind) {
  await enforceRateLimit(RATE_LIMITS.preview, actor.userId);
  const { will, order } = await getWillForActor(actor, willId);
  const answers = decryptDraft(will);
  if (!isStateCode(answers.about.stateCode)) {
    throw new ValidationError("Complete the “About you” step (including your state) to preview.");
  }
  const state = getStateRule(answers.about.stateCode);
  if (!state.supported) throw new ConflictError(`We can't prepare documents for ${state.name}.`);
  const model = buildModel(kind, answers, `DRAFT PREVIEW · Ref ${orderRef(order.id)}`, new Date());
  const bytes = await renderDocumentPdf(model, { watermark: "DRAFT" });
  return {
    bytes,
    filename: `draft-${kind.replace("_", "-")}-${orderRef(order.id).toLowerCase()}.pdf`,
  };
}

/** Latest version + documents for each will in an order. */
export async function currentDocuments(order: Pick<OrderRow, "id">) {
  const rows = await db
    .select({
      documentId: documents.id,
      kind: documents.kind,
      versionId: willVersions.id,
      version: willVersions.version,
      willId: wills.id,
      position: wills.position,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(willVersions, eq(documents.versionId, willVersions.id))
    .innerJoin(wills, eq(documents.willId, wills.id))
    .where(and(eq(documents.orderId, order.id)))
    .orderBy(wills.position, desc(willVersions.version));
  const latestByWill = new Map<string, number>();
  for (const r of rows) {
    if (!latestByWill.has(r.willId)) latestByWill.set(r.willId, r.version);
  }
  return rows.filter((r) => latestByWill.get(r.willId) === r.version);
}
