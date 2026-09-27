import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** Labelled input with hint and error wired up via aria-describedby. */
export function Field({ id, label, hint, error, className, ...input }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      <input
        id={id}
        className="input mt-1"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-danger/30 bg-danger-light text-danger rounded-md border p-3 text-sm"
    >
      {message}
    </div>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="bg-ok-light text-ok rounded-md border border-green-200 p-3 text-sm"
    >
      {message}
    </div>
  );
}
