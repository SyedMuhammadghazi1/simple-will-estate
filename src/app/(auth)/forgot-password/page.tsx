"use client";

import { useActionState } from "react";
import { Field, FormError, FormMessage } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { forgotPasswordAction, type AuthFormState } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <form action={action} className="card space-y-4" noValidate>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <FormError message={state.error} />
        <FormMessage message={state.message} />
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          error={state.fieldErrors?.email}
        />
        <SubmitButton className="w-full">Send reset link</SubmitButton>
      </form>
    </div>
  );
}
