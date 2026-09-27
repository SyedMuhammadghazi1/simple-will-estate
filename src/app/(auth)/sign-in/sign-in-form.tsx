"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { signInAction, type AuthFormState } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-muted text-center text-sm">
        <Link href="/forgot-password" className="link">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
