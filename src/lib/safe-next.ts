/** Only allows same-site relative redirect targets (prevents open redirects). */
export function safeNext(value: unknown): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}
