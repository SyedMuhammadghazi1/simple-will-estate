"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, type ActionResult } from "@/server/actions";
import { addOrderNote } from "@/server/services/admin";
import { applyFilingAction } from "@/server/services/filing";
import { requireRole, STAFF_ROLES } from "@/server/session";

export async function filingAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireRole(STAFF_ROLES);
    const taskId = z.string().uuid().parse(formData.get("taskId"));
    const input = Object.fromEntries(
      [...formData.entries()]
        .filter(([k]) => !k.startsWith("$") && k !== "taskId")
        .map(([k, v]) => [k, String(v)]),
    );
    const result = await applyFilingAction(actor, taskId, input);
    revalidatePath("/admin/filing");
    revalidatePath(`/admin/orders/${result.orderId}`);
    return { ok: true, message: "Filing task updated." };
  } catch (err) {
    return actionError(err, "admin-filing");
  }
}

export async function addNoteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireRole(STAFF_ROLES);
    const orderId = z.string().uuid().parse(formData.get("orderId"));
    await addOrderNote(actor, orderId, String(formData.get("body") ?? ""));
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, message: "Note added." };
  } catch (err) {
    return actionError(err, "admin-note");
  }
}
