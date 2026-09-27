import type { ReactNode } from "react";

const STYLES = {
  info: "border-blue-200 bg-brand-light text-brand-dark",
  warn: "border-amber-300 bg-warn-light text-warn",
  error: "border-red-200 bg-danger-light text-danger",
  success: "border-green-200 bg-ok-light text-ok",
};

export function Alert({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: keyof typeof STYLES;
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status" | "note";
}) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={`rounded-md border p-4 text-sm ${STYLES[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}
