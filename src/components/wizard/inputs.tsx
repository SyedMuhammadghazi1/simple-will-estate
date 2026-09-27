"use client";

import type { ReactNode } from "react";

/** Converts an answers path ("residuary.beneficiaries.0.name") into a DOM id. */
export function fieldId(path: string): string {
  return `f-${path.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

interface BaseProps {
  path: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

function describedBy(path: string, hint?: ReactNode, error?: string) {
  const id = fieldId(path);
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

function Label({ path, label, required }: { path: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={fieldId(path)} className="label">
      {label}
      {required && (
        <span className="text-danger ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

function HintAndError({ path, hint, error }: { path: string; hint?: ReactNode; error?: string }) {
  const id = fieldId(path);
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </>
  );
}

export function TextInput({
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  maxLength = 200,
  placeholder,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "email";
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal";
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className={base.className}>
      <Label path={base.path} label={base.label} required={base.required} />
      <input
        id={fieldId(base.path)}
        name={base.path}
        type={type}
        className="input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={base.error ? true : undefined}
        aria-required={base.required || undefined}
        aria-describedby={describedBy(base.path, base.hint, base.error)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
      />
      <HintAndError path={base.path} hint={base.hint} error={base.error} />
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  maxLength = 2000,
  rows = 3,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div className={base.className}>
      <Label path={base.path} label={base.label} required={base.required} />
      <textarea
        id={fieldId(base.path)}
        name={base.path}
        className="input mt-1"
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={base.error ? true : undefined}
        aria-describedby={describedBy(base.path, base.hint, base.error)}
      />
      <HintAndError path={base.path} hint={base.hint} error={base.error} />
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className={base.className}>
      <Label path={base.path} label={base.label} required={base.required} />
      <select
        id={fieldId(base.path)}
        name={base.path}
        className="input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={base.error ? true : undefined}
        aria-required={base.required || undefined}
        aria-describedby={describedBy(base.path, base.hint, base.error)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <HintAndError path={base.path} hint={base.hint} error={base.error} />
    </div>
  );
}

/** Accessible radio group for yes/no (null = unanswered). */
export function YesNo({
  value,
  onChange,
  ...base
}: BaseProps & { value: boolean | null; onChange: (v: boolean) => void }) {
  const id = fieldId(base.path);
  return (
    <fieldset
      className={base.className}
      aria-describedby={describedBy(base.path, base.hint, base.error)}
      aria-invalid={base.error ? true : undefined}
      id={id}
    >
      <legend className="label">
        {base.label}
        {base.required && (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      <HintAndError path={base.path} hint={base.hint} />
      <div className="mt-2 flex gap-3">
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map((opt) => (
          <label
            key={opt.label}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 ${value === opt.v ? "border-brand bg-brand-light" : "border-line bg-white"}`}
          >
            <input
              type="radio"
              name={base.path}
              value={opt.label.toLowerCase()}
              checked={value === opt.v}
              onChange={() => onChange(opt.v)}
              className="h-4 w-4"
            />
            {opt.label}
          </label>
        ))}
      </div>
      {base.error && (
        <p id={`${id}-error`} className="field-error">
          {base.error}
        </p>
      )}
    </fieldset>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  path,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  path: string;
  hint?: ReactNode;
}) {
  const id = fieldId(path);
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2">
        <input
          id={id}
          name={path}
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <span className="text-sm">{label}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="hint ml-6">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Fieldset({
  legend,
  children,
  description,
}: {
  legend: string;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <fieldset className="border-line space-y-4 rounded-md border p-4">
      <legend className="px-1 font-semibold">{legend}</legend>
      {description && <div className="text-muted text-sm">{description}</div>}
      {children}
    </fieldset>
  );
}
