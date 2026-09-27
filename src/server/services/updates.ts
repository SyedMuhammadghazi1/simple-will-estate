import "server-only";
import { db } from "@/db";
import { canonicalJson, sha256Hex } from "@/lib/crypto";
import { getStateRule, isStateCode } from "@/lib/states";
import { screenAnswers } from "@/lib/will/screening";
import { validateAnswers } from "@/lib/will/validation";
import { writeAudit } from "../audit";
import { documentsReadyEmail } from "../emails";
import { ConflictError, ValidationError } from "../errors";
import { sendEmailOnce } from "../mailer";
import type { Actor } from "../session";
import { createWillVersion, generateDocumentsForVersion } from "./documents";
import { auditActor, getWillForActor, latestVersions, statusOf, transitionOrder } from "./orders";
import { decryptDraft, editMode } from "./wills";

/**
 * Publishes the edited draft of a paid will as a new immutable version (free within the
 * 12-month window). The new version must be signed again, so the order returns to
 * documents_ready.
 */
export async function publishWillUpdate(actor: Actor, willId: string) {
  const { will, order } = await getWillForActor(actor, willId);
  if (editMode(order) !== "update") {
    throw new ConflictError(
      "Updates are available for 12 months after purchase, except while filing is in progress.",
    );
  }
  const answers = decryptDraft(will);
  const { errors } = validateAnswers(answers, { today: new Date() });
  if (errors.length > 0)
    throw new ValidationError("Fix the highlighted answers before publishing your update.", errors);
  const screening = screenAnswers(answers);
  if (screening.outcome === "blocked")
    throw new ValidationError(screening.findings[0]?.title ?? "Not eligible.");
  if (!isStateCode(answers.about.stateCode) || !getStateRule(answers.about.stateCode).supported) {
    throw new ValidationError("Unsupported state.");
  }
  const newAck = screening.acknowledgementRequired.filter(
    (c) => !order.screeningAcknowledged.includes(c),
  );
  if (newAck.length > 0) {
    throw new ValidationError(
      "Your changes raise a new recommendation to speak with an attorney. Please contact support before updating.",
      newAck,
    );
  }
  const current = (await latestVersions(order.id)).get(will.id);
  if (current && current.answersSha256 === sha256Hex(canonicalJson(answers))) {
    throw new ConflictError("You haven't changed anything since your last version.", "no_changes");
  }

  const actorRef = auditActor(actor);
  const version = await db.transaction(async (tx) => {
    const v = await createWillVersion(tx, will, answers, "update", actor.userId);
    await generateDocumentsForVersion(tx, v, will.position);
    await writeAudit(
      actorRef,
      {
        action: "will.updated",
        targetType: "will_version",
        targetId: v.id,
        orderId: order.id,
        metadata: { version: v.version },
      },
      tx,
    );
    if (statusOf(order) !== "documents_ready") {
      await transitionOrder(tx, order.id, "documents_ready", {
        actor: actorRef,
        actorType: "customer",
        reason: "will_updated_requires_resigning",
        set: {
          documentsReadyAt: new Date(),
          executedAt: null,
          lastSigningReminderAt: null,
          signingReminderCount: 0,
        },
      });
    }
    return v;
  });
  await sendEmailOnce(
    `documents-ready:${order.id}:${version.id}`,
    "documents_ready",
    documentsReadyEmail(actor.email, actor.name, order.id),
    { orderId: order.id, userId: actor.userId },
  );
  return version;
}
