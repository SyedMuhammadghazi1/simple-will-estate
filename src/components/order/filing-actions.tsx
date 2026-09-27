"use client";

import { useActionState } from "react";
import { filingAction } from "@/app/admin/actions";
import { FormError, FormMessage } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionResult } from "@/server/actions";

/** Staff controls for a filing task (only valid next steps are shown). */
export function FilingActions({
  taskId,
  method,
  status,
}: {
  taskId: string;
  method: string;
  status: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(filingAction, { ok: true });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <FormError message={state.error} />
      <FormMessage message={state.message} />
      {method === "court_deposit" && status === "pending" && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="action" value="sent_to_court" />
          <div>
            <label htmlFor={`tracking-${taskId}`} className="label">
              Tracking number
            </label>
            <input
              id={`tracking-${taskId}`}
              name="trackingNumber"
              className="input mt-1"
              required
              maxLength={100}
            />
          </div>
          <SubmitButton variant="secondary">Mark sent to court</SubmitButton>
        </form>
      )}
      {method === "court_deposit" && (status === "pending" || status === "sent_to_court") && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="action" value="filed" />
          <div>
            <label htmlFor={`ref-${taskId}`} className="label">
              Court reference no.
            </label>
            <input
              id={`ref-${taskId}`}
              name="courtReference"
              className="input mt-1"
              required
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor={`date-${taskId}`} className="label">
              Filed on
            </label>
            <input
              id={`date-${taskId}`}
              name="filedOn"
              type="date"
              max={today}
              defaultValue={today}
              className="input mt-1"
              required
            />
          </div>
          <SubmitButton>Mark filed</SubmitButton>
        </form>
      )}
      {method === "vault" && status === "pending" && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="action" value="vaulted" />
          <div>
            <label htmlFor={`vault-${taskId}`} className="label">
              Vault reference (optional)
            </label>
            <input
              id={`vault-${taskId}`}
              name="vaultReference"
              className="input mt-1"
              maxLength={100}
            />
          </div>
          <SubmitButton>Mark vaulted</SubmitButton>
        </form>
      )}
    </div>
  );
}
