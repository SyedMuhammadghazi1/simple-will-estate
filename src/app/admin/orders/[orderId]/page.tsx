import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilingActions } from "@/components/order/filing-actions";
import { NoteForm } from "@/components/order/note-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { FILING_METHOD_LABELS, FILING_STATUS_LABELS, type FilingTaskStatus } from "@/lib/filing";
import { ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/order-status";
import { PLANS, formatCents } from "@/lib/pricing";
import { screenAnswers } from "@/lib/will/screening";
import { summarizeAnswers } from "@/lib/will/summary";
import { isAppError } from "@/server/errors";
import { adminOrderDetail } from "@/server/services/admin";
import { orderRef } from "@/server/services/orders";
import { requireRole, STAFF_ROLES } from "@/server/session";

export const metadata: Metadata = { title: "Order detail" };

export default async function AdminOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const actor = await requireRole(STAFF_ROLES, `/admin/orders/${orderId}`);
  const detail = await adminOrderDetail(actor, orderId).catch((err) => {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  });
  const { order, customer } = detail;
  const today = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted text-sm">
            <Link href="/admin/orders" className="link">
              Orders
            </Link>{" "}
            / <span className="font-mono">{orderRef(order.id)}</span>
          </p>
          <h1 className="text-2xl font-bold">
            {PLANS[order.plan].name} · {formatCents(order.amountCents)}
          </h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <section className="card grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <strong>Customer:</strong> {customer.name} ({customer.email})
        </p>
        <p>
          <strong>State:</strong> {order.stateCode ?? "–"}
        </p>
        <p>
          <strong>Paid:</strong> {order.paidAt?.toLocaleString("en-US") ?? "–"} (
          {order.paymentSource ?? "–"})
        </p>
        <p>
          <strong>Update window ends:</strong>{" "}
          {order.updateWindowEndsAt?.toLocaleDateString("en-US") ?? "–"}
        </p>
        <p>
          <strong>Screening acknowledged:</strong>{" "}
          {order.screeningAcknowledged.join(", ") || "none"}
        </p>
        <p>
          <strong>Signing reminders sent:</strong> {order.signingReminderCount}
        </p>
      </section>

      {detail.filingTasks.length > 0 && (
        <section className="card space-y-4" aria-labelledby="filing-title">
          <h2 id="filing-title" className="text-lg font-semibold">
            Filing
          </h2>
          {detail.filingTasks.map((t) => (
            <div key={t.id} className="border-line space-y-2 rounded-md border p-3 text-sm">
              <p>
                <strong>{FILING_METHOD_LABELS[t.method]}</strong> —{" "}
                {FILING_STATUS_LABELS[t.status as FilingTaskStatus] ?? t.status}
                {t.depositAuthority ? ` · ${t.depositAuthority}` : ""}
              </p>
              {t.trackingNumber && <p>Tracking: {t.trackingNumber}</p>}
              {t.courtReference && (
                <p>
                  Court ref: {t.courtReference} (filed {t.filedOn})
                </p>
              )}
              {t.vaultReference && <p>Vault ref: {t.vaultReference}</p>}
              <FilingActions taskId={t.id} method={t.method} status={t.status} />
            </div>
          ))}
        </section>
      )}

      {detail.wills.map((w) => {
        const answers = detail.answers.get(w.id);
        if (!answers) return null;
        const screening = screenAnswers(answers);
        return (
          <section key={w.id} className="card space-y-3" aria-label={`Will ${w.position}`}>
            <h2 className="text-lg font-semibold">
              Will {w.position}: {answers.about.fullLegalName || "(unnamed)"}
            </h2>
            {screening.findings.length > 0 && (
              <p className="text-warn text-sm">
                Screening: {screening.findings.map((f) => f.title).join("; ")}
              </p>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Plain-English summary
              </summary>
              <div className="mt-2 space-y-2 text-sm">
                {summarizeAnswers(answers, today).map((s) => (
                  <p key={s.step}>
                    <strong>{s.title}:</strong> {s.sentences.join(" ")}
                  </p>
                ))}
              </div>
            </details>
            <div className="text-sm">
              <p className="font-semibold">Versions</p>
              <ul className="text-muted">
                {detail.versions
                  .filter((v) => v.willId === w.id)
                  .map((v) => (
                    <li key={v.id}>
                      v{v.version} ({v.reason}) — {v.createdAt.toLocaleString("en-US")} — sha256{" "}
                      {v.answersSha256.slice(0, 16)}…
                      {detail.documents
                        .filter((d) => d.versionId === v.id)
                        .map((d) => (
                          <a key={d.id} href={`/api/documents/${d.id}`} className="link ml-2">
                            {d.kind === "will" ? "will" : "instructions"}
                          </a>
                        ))}
                    </li>
                  ))}
              </ul>
            </div>
            <div className="text-sm">
              <p className="font-semibold">Signed uploads</p>
              <ul>
                {detail.uploads
                  .filter((u) => u.willId === w.id)
                  .map((u) => (
                    <li key={u.id}>
                      <a href={`/api/uploads/${u.id}`} className="link">
                        {u.mimeType} · {Math.ceil(u.sizeBytes / 1024)} KB ·{" "}
                        {u.createdAt.toLocaleString("en-US")}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        );
      })}

      <section className="card space-y-3" aria-labelledby="notes-title">
        <h2 id="notes-title" className="text-lg font-semibold">
          Internal notes
        </h2>
        <ul className="space-y-2 text-sm">
          {detail.notes.map((n) => (
            <li key={n.id} className="border-line rounded-md border p-2">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="text-muted text-xs">
                {n.author} · {n.createdAt.toLocaleString("en-US")}
              </p>
            </li>
          ))}
        </ul>
        <NoteForm orderId={order.id} />
      </section>

      <section className="card" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-semibold">
          Status history
        </h2>
        <ul className="mt-2 text-sm">
          {detail.history.map((h) => (
            <li key={h.id}>
              {h.createdAt.toLocaleString("en-US")}:{" "}
              {isOrderStatus(h.fromStatus) ? ORDER_STATUS_LABELS[h.fromStatus] : h.fromStatus} →{" "}
              {isOrderStatus(h.toStatus) ? ORDER_STATUS_LABELS[h.toStatus] : h.toStatus} (
              {h.actorType}
              {h.reason ? `: ${h.reason}` : ""})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
