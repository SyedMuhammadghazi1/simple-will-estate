"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "Please wait…",
  variant = "primary",
  className = "",
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={`btn btn-${variant} ${className}`}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
    >
      {pending ? pendingText : children}
    </button>
  );
}
