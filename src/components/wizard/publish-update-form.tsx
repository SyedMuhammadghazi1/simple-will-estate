"use client";

import { useActionState } from "react";
import { publishUpdateAction } from "@/app/dashboard/actions";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

export function PublishUpdateForm({ willId, disabled }: { willId: string; disabled: boolean }) {
  const [state, action] = useActionState<ActionResult, FormData>(publishUpdateAction, { ok: true });
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <input type="hidden" name="willId" value={willId} />
      <SubmitButton disabled={disabled} pendingText="Creating new version…">
        Publish updated will
      </SubmitButton>
      <p className="text-muted text-xs">
        This creates a new version of your will. You must print and sign the new version with
        witnesses again — your old signed will stays valid until you do.
      </p>
    </form>
  );
}
