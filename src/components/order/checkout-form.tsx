"use client";

import { useActionState } from "react";
import { startCheckoutAction } from "@/app/dashboard/actions";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

export function CheckoutForm({
  orderId,
  priceLabel,
  acknowledgements,
  disabled,
  bypass,
}: {
  orderId: string;
  priceLabel: string;
  acknowledgements: { code: string; title: string }[];
  disabled: boolean;
  bypass: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(startCheckoutAction, { ok: true });
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="orderId" value={orderId} />
      {acknowledgements.length > 0 && (
        <fieldset className="border-line space-y-2 rounded-md border p-4">
          <legend className="px-1 text-sm font-semibold">Please confirm</legend>
          {acknowledgements.map((a) => (
            <label key={a.code} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="acknowledge"
                value={a.code}
                className="mt-1 h-4 w-4"
                required
              />
              <span>
                I have read the recommendation about <strong>{a.title.toLowerCase()}</strong> and I
                choose to continue without an attorney.
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {bypass && (
        <p
          className="bg-warn-light text-warn rounded-md p-3 text-xs"
          data-testid="payment-bypass-notice"
        >
          Test mode: payment is simulated (PAYMENTS_MODE=test-bypass). This is impossible in
          production.
        </p>
      )}
      <SubmitButton disabled={disabled} pendingText="Starting secure checkout…">
        Pay {priceLabel} and get my documents
      </SubmitButton>
      <p className="text-muted text-xs">
        Secure payment by Stripe. One-time fee — no subscription.
      </p>
    </form>
  );
}
