"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { resetPasswordAction, type AuthFormState } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="card space-y-4" noValidate>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <FormError message={state.error ?? state.fieldErrors?.token} />
      <input type="hidden" name="token" value={token} />
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        hint="At least 10 characters."
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton className="w-full">Reset password</SubmitButton>
    </form>
  );
}
