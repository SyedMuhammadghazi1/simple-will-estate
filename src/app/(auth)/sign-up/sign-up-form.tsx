"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { signUpAction, type AuthFormState } from "../actions";

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signUpAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
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
        hint="At least 10 characters."
        autoComplete="new-password"
        required
        minLength={10}
        error={state.fieldErrors?.password}
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-1 h-4 w-4"
            aria-describedby={state.fieldErrors?.acceptTerms ? "acceptTerms-error" : undefined}
          />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="link" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="link" target="_blank">
              Privacy Policy
            </Link>
            , and I understand this service is not a law firm and does not give legal advice.
          </span>
        </label>
        {state.fieldErrors?.acceptTerms && (
          <p id="acceptTerms-error" className="field-error" role="alert">
            {state.fieldErrors.acceptTerms}
          </p>
        )}
      </div>
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
