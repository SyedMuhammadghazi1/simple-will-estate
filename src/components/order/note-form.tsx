"use client";

import { useActionState } from "react";
import { addNoteAction } from "@/app/admin/actions";
import { FormError, FormMessage } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

export function NoteForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(addNoteAction, { ok: true });
  return (
    <form action={action} className="space-y-2">
      <FormError message={state.error} />
      <FormMessage message={state.message} />
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="note-body" className="label">
        Internal note (staff only, encrypted)
      </label>
      <textarea id="note-body" name="body" rows={3} maxLength={4000} className="input" required />
      <SubmitButton variant="secondary">Add note</SubmitButton>
    </form>
  );
}
