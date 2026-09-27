"use client";

import { useActionState } from "react";
import { confirmSigningAction } from "@/app/dashboard/actions";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

export function ConfirmSigningForm({
  orderId,
  witnesses,
  notary,
  methods,
  disabled,
}: {
  orderId: string;
  witnesses: number;
  notary: boolean;
  methods: { value: string; label: string; description: string }[];
  disabled: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(confirmSigningAction, {
    ok: true,
  });
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="orderId" value={orderId} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="signedWithWitnesses" className="mt-1 h-4 w-4" required />
        <span>
          I signed my will in the presence of {witnesses} adult witnesses who also signed
          {notary ? ", and the self-proving affidavit was notarized" : ""}, as described in the
          signing instructions.
        </span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">
          Where should the original signed will be kept?
        </legend>
        {methods.map((m, i) => (
          <label
            key={m.value}
            className="border-line flex cursor-pointer items-start gap-3 rounded-md border bg-white p-3"
          >
            <input
              type="radio"
              name="filingMethod"
              value={m.value}
              defaultChecked={i === 0}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-semibold">{m.label}</span>
              <span className="text-muted block text-sm">{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton disabled={disabled} pendingText="Saving…">
        Confirm signing and request filing
      </SubmitButton>
    </form>
  );
}
