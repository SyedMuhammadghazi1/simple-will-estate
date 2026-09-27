"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isFilingMethod } from "@/lib/filing";
import { isPlanId } from "@/lib/pricing";
import { isWillSectionKey } from "@/lib/will/answers";
import { getStep, isStepId } from "@/lib/will/steps";
import { issuesByPath, type Issue } from "@/lib/will/validation";
import { actionError, type ActionResult } from "@/server/actions";
import { ValidationError } from "@/server/errors";
import { requestAccountDeletion } from "@/server/services/account";
import { recordExecutionAndChooseFiling } from "@/server/services/execution";
import { cancelDraftOrder, createOrder, listWills } from "@/server/services/orders";
import { startCheckout } from "@/server/services/payments";
import { publishWillUpdate } from "@/server/services/updates";
import { mirrorFromPartner, saveDraftSection, submitStep } from "@/server/services/wills";
import { requireUser } from "@/server/session";

const uuid = z.string().uuid();

export async function createOrderAction(formData: FormData): Promise<void> {
  const actor = await requireUser("/dashboard");
  const plan = formData.get("plan");
  if (!isPlanId(plan)) throw new ValidationError("Choose a plan.");
  const order = await createOrder(actor, plan);
  const [first] = await listWills(order.id);
  redirect(first ? `/dashboard/wills/${first.id}/about` : `/dashboard/orders/${order.id}`);
}

export interface AutosaveResult extends ActionResult {
  savedAt?: string;
}

export async function autosaveAction(
  willId: string,
  stepId: string,
  data: unknown,
): Promise<AutosaveResult> {
  try {
    const actor = await requireUser();
    uuid.parse(willId);
    if (!isStepId(stepId)) throw new ValidationError("Unknown step.");
    const section = getStep(stepId).section;
    if (!section || !isWillSectionKey(section)) return { ok: true };
    const { savedAt } = await saveDraftSection(actor, willId, section, data, stepId);
    return { ok: true, savedAt: savedAt.toISOString() };
  } catch (err) {
    return actionError(err, "autosave");
  }
}

export interface SubmitStepResult extends ActionResult {
  fieldErrors?: Record<string, string>;
  errors?: Issue[];
  warnings?: Issue[];
  nextStep?: string | null;
}

export async function submitStepAction(
  willId: string,
  stepId: string,
  data: unknown,
): Promise<SubmitStepResult> {
  try {
    const actor = await requireUser();
    uuid.parse(willId);
    if (!isStepId(stepId)) throw new ValidationError("Unknown step.");
    const section = getStep(stepId).section;
    const result = await submitStep(actor, willId, stepId, section, data);
    revalidatePath(`/dashboard/wills/${willId}`, "layout");
    return {
      ok: result.errors.length === 0,
      fieldErrors: issuesByPath(result.errors),
      errors: result.errors,
      warnings: result.warnings,
      nextStep: result.nextStep,
      error: result.errors.length ? "Please fix the highlighted answers." : undefined,
    };
  } catch (err) {
    return actionError(err, "submit-step");
  }
}

export async function mirrorPartnerAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  const willId = uuid.parse(formData.get("willId"));
  await mirrorFromPartner(actor, willId);
  redirect(`/dashboard/wills/${willId}/about`);
}

export async function startCheckoutAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let url: string;
  try {
    const actor = await requireUser();
    const orderId = uuid.parse(formData.get("orderId"));
    const acknowledged = formData.getAll("acknowledge").map(String);
    ({ redirectUrl: url } = await startCheckout(actor, orderId, acknowledged));
  } catch (err) {
    return actionError(err, "checkout");
  }
  redirect(url);
}

export async function confirmSigningAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let orderId: string;
  try {
    const actor = await requireUser();
    orderId = uuid.parse(formData.get("orderId"));
    const method = formData.get("filingMethod");
    if (!isFilingMethod(method))
      throw new ValidationError("Choose where your original will should be kept.");
    await recordExecutionAndChooseFiling(actor, orderId, method, {
      signedWithWitnesses: formData.get("signedWithWitnesses") === "on",
    });
  } catch (err) {
    return actionError(err, "confirm-signing");
  }
  revalidatePath(`/dashboard/orders/${orderId}`);
  redirect(`/dashboard/orders/${orderId}?signed=1`);
}

export async function publishUpdateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let orderId: string;
  try {
    const actor = await requireUser();
    const willId = uuid.parse(formData.get("willId"));
    const version = await publishWillUpdate(actor, willId);
    orderId = version.orderId;
  } catch (err) {
    return actionError(err, "publish-update");
  }
  redirect(`/dashboard/orders/${orderId}?updated=1`);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  const orderId = uuid.parse(formData.get("orderId"));
  await cancelDraftOrder(actor, orderId);
  redirect("/dashboard");
}

export async function requestDeletionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    if (formData.get("confirm") !== "DELETE") {
      throw new ValidationError("Type DELETE to confirm.");
    }
    await requestAccountDeletion(actor);
    revalidatePath("/dashboard/account");
    return { ok: true, message: "We received your request. We'll confirm by email." };
  } catch (err) {
    return actionError(err, "request-deletion");
  }
}
