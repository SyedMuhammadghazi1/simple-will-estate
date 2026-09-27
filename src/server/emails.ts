import "server-only";
import { publicEnv, getEnv } from "@/env";
import type { EmailMessage } from "./mailer";

/** Transactional email templates. Keep PII to the minimum needed (first name, order ref). */

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function layout(
  to: string,
  subject: string,
  paragraphs: string[],
  cta?: { label: string; url: string },
): EmailMessage {
  const app = publicEnv.appName;
  const footer = `${app} is not a law firm and does not provide legal advice. Questions? ${getEnv().SUPPORT_EMAIL}`;
  const text = [...paragraphs, ...(cta ? [`${cta.label}: ${cta.url}`] : []), "", "—", footer].join(
    "\n\n",
  );
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1c1917;max-width:560px;margin:auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(app)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.5">${escapeHtml(p)}</p>`).join("\n")}
${cta ? `<p><a href="${escapeHtml(cta.url)}" style="background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(cta.label)}</a></p>` : ""}
<hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0"><p style="font-size:12px;color:#57534e">${escapeHtml(footer)}</p>
</body></html>`;
  return { to, subject, text, html };
}

const orderUrl = (orderId: string) => `${getEnv().APP_URL}/dashboard/orders/${orderId}`;
const ref = (orderId: string) => orderId.slice(0, 8).toUpperCase();
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function orderConfirmationEmail(
  to: string,
  name: string,
  orderId: string,
  amount: string,
): EmailMessage {
  return layout(
    to,
    `Order confirmed — ${ref(orderId)}`,
    [
      `Hi ${firstName(name)},`,
      `Thank you. We received your payment of ${amount} for order ${ref(orderId)}.`,
      "Your price includes your will, a state-specific signing kit, 12 months of free updates, secure vault storage, and managed filing where your state or county offers it.",
    ],
    { label: "View your order", url: orderUrl(orderId) },
  );
}

export function documentsReadyEmail(to: string, name: string, orderId: string): EmailMessage {
  return layout(
    to,
    `Your will is ready to sign — ${ref(orderId)}`,
    [
      `Hi ${firstName(name)},`,
      "Your will and your signing instructions are ready to download.",
      "Your will is not valid until you sign it with witnesses exactly as described in the signing instructions. When it's signed, upload a scan in your dashboard and choose where the original should be kept.",
    ],
    { label: "Download your documents", url: orderUrl(orderId) },
  );
}

export function signingReminderEmail(
  to: string,
  name: string,
  orderId: string,
  days: number,
): EmailMessage {
  return layout(
    to,
    "Reminder: your will still needs to be signed",
    [
      `Hi ${firstName(name)},`,
      `Your documents have been ready for ${days} days, but we haven't received a signed copy yet. An unsigned will has no legal effect.`,
      "Follow the signing instructions, then upload a scan of the signed will in your dashboard.",
    ],
    { label: "Finish signing", url: orderUrl(orderId) },
  );
}

export function filingCompletedEmail(
  to: string,
  name: string,
  orderId: string,
  outcome: "filed" | "vaulted",
): EmailMessage {
  return layout(
    to,
    outcome === "filed" ? "Your will has been filed" : "Your will is in our vault",
    [
      `Hi ${firstName(name)},`,
      outcome === "filed"
        ? "Your signed will has been deposited with the court or registrar. The reference details are in your dashboard."
        : "Your signed will is now stored in our secure vault.",
      "Tell your executor where your will is kept. You can update your will for free during your 12-month update window.",
    ],
    { label: "View details", url: orderUrl(orderId) },
  );
}

export function passwordResetEmail(to: string, name: string, url: string): EmailMessage {
  return layout(
    to,
    "Reset your password",
    [
      `Hi ${firstName(name)},`,
      "Someone asked to reset the password for your account. If this was you, use the link below within one hour. If not, you can ignore this email.",
    ],
    { label: "Reset password", url },
  );
}

export function deletionRequestedEmail(to: string, name: string): EmailMessage {
  return layout(to, "We received your account deletion request", [
    `Hi ${firstName(name)},`,
    "We received your request to delete your account. Our team will process it and confirm by email. Some records (for example payment records and signed legal documents) may need to be retained where the law requires; we will explain anything we keep.",
  ]);
}
