import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wills, type OrderRow, type WillRow } from "@/db/schema";
import { canStartUpdate } from "@/lib/order-status";
import { isWithinUpdateWindow } from "@/lib/pricing";
import {
  SECTION_SCHEMAS,
  parseAnswers,
  type WillAnswers,
  type WillSectionKey,
} from "@/lib/will/answers";
import { mirrorAnswers } from "@/lib/will/mirror";
import { STEP_IDS, isStepId, type StepId } from "@/lib/will/steps";
import { completedSteps, validateStep, type ValidationResult } from "@/lib/will/validation";
import { aad, decryptJson, encryptJson } from "../encryption";
import { ConflictError, ValidationError } from "../errors";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import type { Actor } from "../session";
import { getWillForActor, listWills, statusOf } from "./orders";

export function decryptDraft(will: Pick<WillRow, "id" | "draftCiphertext">): WillAnswers {
  return parseAnswers(decryptJson(will.draftCiphertext, aad.willDraft(will.id)));
}

export type EditMode = "draft" | "update" | "locked";

/** Whether the customer can currently change the answers of this order's wills. */
export function editMode(order: Pick<OrderRow, "status" | "paidAt">, now = new Date()): EditMode {
  const status = statusOf(order);
  if (status === "draft") return "draft";
  if (canStartUpdate(status) && isWithinUpdateWindow(order.paidAt, now)) return "update";
  return "locked";
}

export async function loadWillForEditing(actor: Actor, willId: string) {
  const { will, order } = await getWillForActor(actor, willId);
  return { will, order, answers: decryptDraft(will), mode: editMode(order) };
}

function assertEditable(order: OrderRow) {
  const mode = editMode(order);
  if (mode === "locked") {
    throw new ConflictError(
      order.status === "filing_in_progress"
        ? "Your will can't be changed while filing is in progress."
        : "This will can no longer be changed.",
      "locked",
    );
  }
}

/**
 * Autosave: stores a section of the draft without business validation (partial drafts are
 * fine). Type/length validation still applies.
 */
export async function saveDraftSection(
  actor: Actor,
  willId: string,
  section: WillSectionKey,
  data: unknown,
  currentStep?: StepId,
): Promise<{ savedAt: Date }> {
  await enforceRateLimit(RATE_LIMITS.draftSave, actor.userId);
  const { will, order } = await getWillForActor(actor, willId);
  assertEditable(order);
  const parsed = SECTION_SCHEMAS[section].safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Some answers are in an unexpected format.", parsed.error.issues);
  }
  const answers = decryptDraft(will);
  const next = { ...answers, [section]: parsed.data } as WillAnswers;
  const savedAt = new Date();
  await db
    .update(wills)
    .set({
      draftCiphertext: encryptJson(next, aad.willDraft(will.id)),
      draftUpdatedAt: savedAt,
      completedSteps: completedSteps(next, { today: savedAt }),
      ...(currentStep && isStepId(currentStep) ? { currentStep } : {}),
    })
    .where(eq(wills.id, will.id));
  return { savedAt };
}

/**
 * "Next" button: saves the section, then runs the step's business validation. Returns the
 * validation result; the caller only advances when there are no errors.
 */
export async function submitStep(
  actor: Actor,
  willId: string,
  step: StepId,
  section: WillSectionKey | null,
  data: unknown,
): Promise<ValidationResult & { nextStep: StepId | null }> {
  if (section) await saveDraftSection(actor, willId, section, data, step);
  const { will } = await getWillForActor(actor, willId);
  const answers = decryptDraft(will);
  const result = validateStep(step, answers, { today: new Date() });
  const idx = STEP_IDS.indexOf(step);
  const nextStep = result.errors.length === 0 ? (STEP_IDS[idx + 1] ?? null) : null;
  if (nextStep) {
    await db.update(wills).set({ currentStep: nextStep }).where(eq(wills.id, will.id));
  }
  return { ...result, nextStep };
}

/** Pre-fills the partner's will (couple plan) as a mirror of the first will. */
export async function mirrorFromPartner(actor: Actor, willId: string): Promise<void> {
  const { will, order } = await getWillForActor(actor, willId);
  if (order.status !== "draft")
    throw new ConflictError("Mirroring is only available before payment.");
  if (will.position !== 2) throw new ConflictError("Only the second will can be mirrored.");
  const all = await listWills(order.id);
  const first = all.find((w) => w.position === 1);
  if (!first) throw new ConflictError("The first will is missing.");
  const mirrored = mirrorAnswers(decryptDraft(first), () => randomUUID());
  await db
    .update(wills)
    .set({
      draftCiphertext: encryptJson(mirrored, aad.willDraft(will.id)),
      draftUpdatedAt: new Date(),
      currentStep: "about",
      completedSteps: completedSteps(mirrored, { today: new Date() }),
    })
    .where(eq(wills.id, will.id));
}
