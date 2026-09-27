"use client";

import { useActionState } from "react";
import { requestDeletionAction } from "@/app/dashboard/actions";
import { Field, FormError, FormMessage } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

export function DeletionForm() {
  const [state, action] = useActionState<ActionResult, FormData>(requestDeletionAction, {
    ok: true,
  });
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <FormMessage message={state.message} />
      <Field id="confirm" name="confirm" label='Type "DELETE" to confirm' autoComplete="off" />
      <SubmitButton variant="danger" pendingText="Sending request…">
        Request account deletion
      </SubmitButton>
    </form>
  );
}
