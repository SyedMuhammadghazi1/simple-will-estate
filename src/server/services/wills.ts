import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
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
import type { Actor } from "../actor";
import { getWillForActor, listWills, statusOf } from "./orders";

export function decryptDraft(will: Pick<WillRow, "id" | "draftCiphertext">): WillAnswers {
  return parseAnswers(decryptJson(will.draftCiphertext, aad.willDraft(will.id)));
}

export type EditMode = "draft" | "update" | "locked";

/** Whether the customer can currently change the answers of this order's wills. */
export function editMode(order: Pick<OrderRow, "status" | "paidAt">, now = new Date()): EditMode {
  const status = statusOf(order);
  // "paid" without documents: the answers must be fixed before documents can be generated.
  if (status === "draft" || status === "paid") return "draft";
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
 * Attempts of an optimistic update before giving up. An attempt only fails because another write
 * to the same will succeeded in between, so this is only reached with 10+ simultaneous writers.
 */
const MAX_WRITE_ATTEMPTS = 10;

/**
 * Read-modify-write of a will row with optimistic concurrency. `change` computes the columns to
 * write from the freshly read row (or null to write nothing); the write only applies if the row's
 * draft_version is still the one read, and bumps it. When another request wrote in between (two
 * tabs autosaving different sections), `change` runs again on the newer row, so each writer
 * re-applies only its own change instead of overwriting the other's with a stale copy.
 */
async function updateWill<T>(
  actor: Actor,
  willId: string,
  change: (
    will: WillRow,
    order: OrderRow,
  ) => { set: Partial<typeof wills.$inferInsert> | null; result: T },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { will, order } = await getWillForActor(actor, willId);
    const { set, result } = change(will, order);
    if (!set) return result;
    const updated = await db
      .update(wills)
      .set({ ...set, draftVersion: will.draftVersion + 1 })
      .where(and(eq(wills.id, will.id), eq(wills.draftVersion, will.draftVersion)))
      .returning({ id: wills.id });
    if (updated.length > 0) return result;
    if (attempt >= MAX_WRITE_ATTEMPTS) {
      throw new ConflictError(
        "Your answers were being changed somewhere else at the same time. Please try again.",
      );
    }
  }
}

/**
 * Autosave: stores a section of the draft without business validation (partial drafts are
 * fine). Type/length validation still applies. Only this section is replaced — concurrent saves
 * of other sections (another tab) are kept (see updateWill).
 */
export async function saveDraftSection(
  actor: Actor,
  willId: string,
  section: WillSectionKey,
  data: unknown,
  currentStep?: StepId,
): Promise<{ savedAt: Date }> {
  await enforceRateLimit(RATE_LIMITS.draftSave, actor.userId);
  let sectionData: unknown;
  return updateWill(actor, willId, (will, order) => {
    assertEditable(order);
    if (sectionData === undefined) {
      const parsed = SECTION_SCHEMAS[section].safeParse(data);
      if (!parsed.success) {
        throw new ValidationError("Some answers are in an unexpected format.", parsed.error.issues);
      }
      sectionData = parsed.data;
    }
    const next = { ...decryptDraft(will), [section]: sectionData } as WillAnswers;
    const savedAt = new Date();
    return {
      set: {
        draftCiphertext: encryptJson(next, aad.willDraft(will.id)),
        draftUpdatedAt: savedAt,
        // A step counts as complete once the customer has submitted it AND it is still valid.
        completedSteps: will.completedSteps.filter((s) =>
          completedSteps(next, { today: savedAt }).includes(s as StepId),
        ),
        ...(currentStep && isStepId(currentStep) ? { currentStep } : {}),
      },
      result: { savedAt },
    };
  });
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
  return updateWill(actor, willId, (will) => {
    const result = validateStep(step, decryptDraft(will), { today: new Date() });
    const idx = STEP_IDS.indexOf(step);
    const nextStep = result.errors.length === 0 ? (STEP_IDS[idx + 1] ?? null) : null;
    return {
      set:
        result.errors.length === 0
          ? {
              ...(nextStep ? { currentStep: nextStep } : {}),
              completedSteps: [...new Set([...will.completedSteps, step])].filter(
                (s) => s !== "review",
              ),
            }
          : null,
      result: { ...result, nextStep },
    };
  });
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
  // Replaces the whole draft on purpose; the version bump makes a save that read the old draft
  // re-apply its section to the mirrored one instead of writing the old draft back.
  await db
    .update(wills)
    .set({
      draftCiphertext: encryptJson(mirrored, aad.willDraft(will.id)),
      draftUpdatedAt: new Date(),
      currentStep: "about",
      completedSteps: [],
      draftVersion: sql`${wills.draftVersion} + 1`,
    })
    .where(eq(wills.id, will.id));
}
