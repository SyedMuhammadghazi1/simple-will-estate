/**
 * Only allows same-site relative redirect targets (prevents open redirects).
 *
 * Browsers remove tabs/newlines and treat "\" like "/" when resolving a URL, so "/\t/evil.com"
 * would become "//evil.com". Control characters and backslashes are therefore rejected
 * outright, and the target must still resolve to our own origin.
 */
export function safeNext(value: unknown): string {
  const fallback = "/dashboard";
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/") || v.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(v)) {
    return fallback;
  }
  const base = "https://safe-next.invalid";
  try {
    return new URL(v, base).origin === base ? v : fallback;
  } catch {
    return fallback;
  }
}
