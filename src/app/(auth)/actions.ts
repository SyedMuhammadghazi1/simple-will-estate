"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth, MIN_PASSWORD_LENGTH } from "@/server/auth";
import { isAppError } from "@/server/errors";
import { errorInfo, logger } from "@/server/logger";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { requestMeta } from "@/server/request";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
}

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

async function clientKey(): Promise<string> {
  return requestMeta(await headers()).ip ?? "unknown";
}

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128),
});

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    await enforceRateLimit(RATE_LIMITS.signIn, `ip:${await clientKey()}`);
    await enforceRateLimit(RATE_LIMITS.signIn, `email:${parsed.data.email}`);
    await getAuth().api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    if (isAppError(err)) return { error: err.message, values };
    if (err instanceof APIError) return { error: "Incorrect email or password.", values };
    logger.error({ err: errorInfo(err) }, "sign-in failed");
    return { error: "We couldn't sign you in. Please try again.", values };
  }
  redirect(safeNext(formData.get("next")));
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(128, "Use at most 128 characters."),
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { message: "You must accept the terms to continue." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms"),
  };
  const values = { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    await enforceRateLimit(RATE_LIMITS.signUp, `ip:${await clientKey()}`);
    await getAuth().api.signUpEmail({
      body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (err) {
    if (isAppError(err)) return { error: err.message, values };
    if (err instanceof APIError) {
      // Don't reveal whether an email is registered beyond what Better Auth's error implies.
      return {
        error:
          "We couldn't create an account with those details. If you already have an account, sign in instead.",
        values,
      };
    }
    logger.error({ err: errorInfo(err) }, "sign-up failed");
    return { error: "We couldn't create your account. Please try again.", values };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (err) {
    logger.warn({ err: errorInfo(err) }, "sign-out failed");
  }
  redirect("/");
}

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await enforceRateLimit(RATE_LIMITS.authOther, `forgot:${await clientKey()}`);
    await getAuth().api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    logger.warn({ err: errorInfo(err) }, "password reset request failed");
  }
  // Same response whether or not the account exists.
  return { message: "If an account exists for that email, we've sent a reset link." };
}

const resetSchema = z
  .object({
    token: z.string().min(1, "This reset link is invalid."),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await enforceRateLimit(RATE_LIMITS.authOther, `reset:${await clientKey()}`);
    await getAuth().api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
      headers: await headers(),
    });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }
  redirect("/sign-in?reset=1");
}
