import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/forms/submit-button";
import { CheckoutForm } from "@/components/order/checkout-form";
import { ConfirmSigningForm } from "@/components/order/confirm-signing-form";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { isPaymentBypassEnabled } from "@/env";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import {
  FILING_METHOD_LABELS,
  FILING_STATUS_LABELS,
  availableFilingMethods,
  type FilingTaskStatus,
} from "@/lib/filing";
import {
  ORDER_STATUS_LABELS,
  canRecordExecution,
  isOrderStatus,
  orderTimeline,
} from "@/lib/order-status";
import { PLANS, formatCents } from "@/lib/pricing";
import { getStateRule, isStateCode } from "@/lib/states";
import { progressPercent, type StepId } from "@/lib/will/steps";
import { cancelOrderAction } from "@/app/dashboard/actions";
import { isAppError } from "@/server/errors";
import { currentDocuments } from "@/server/services/documents";
import { willsMissingSignedCopy } from "@/server/services/execution";
import { getOrderForActor, orderOverview, orderRef, statusOf } from "@/server/services/orders";
import { checkoutReadiness } from "@/server/services/payments";
import { decryptDraft, editMode } from "@/server/services/wills";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Your order" };

type Search = Record<string, string | undefined>;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Search>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const actor = await requireUser(`/dashboard/orders/${orderId}`);
  const order = await getOrderForActor(actor, orderId).catch((err) => {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  });
  const status = statusOf(order);
  const overview = await orderOverview(order.id);
  const plan = PLANS[order.plan];
  const mode = editMode(order);
  const willInfo = overview.wills.map((w) => {
    const answers = decryptDraft(w);
    return {
      will: w,
      name: answers.about.fullLegalName.trim(),
      progress: progressPercent(w.completedSteps as StepId[]),
    };
  });
  const readiness = status === "draft" ? await checkoutReadiness(order) : null;
  const docs = status === "draft" ? [] : await currentDocuments(order);
  const missingUploads = canRecordExecution(status) ? await willsMissingSignedCopy(order.id) : [];
  const stateCode = order.stateCode ?? overview.versions[0]?.stateCode ?? null;
  const rule = stateCode && isStateCode(stateCode) ? getStateRule(stateCode) : null;
  const openTask = overview.filingTasks[0];
  const labelFor = (position: number, name: string) =>
    name ||
    (order.plan === "couple"
      ? position === 1
        ? "Your will"
        : "Your partner's will"
      : "Your will");

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted text-sm">
            <Link href="/dashboard" className="link">
              My wills
            </Link>{" "}
            / Order <span className="font-mono">{orderRef(order.id)}</span>
          </p>
          <h1 className="mt-1 text-3xl font-bold">{plan.name}</h1>
        </div>
        <StatusBadge status={status} />
      </div>

      {query.paid && <Alert tone="success" title="Payment received — your documents are ready." />}
      {query.checkout === "success" && status === "draft" && (
        <Alert tone="info" title="Payment processing">
          We&apos;re confirming your payment with Stripe. Refresh this page in a few seconds.
        </Alert>
      )}
      {query.checkout === "cancelled" && (
        <Alert tone="warn" title="Checkout cancelled — you haven't been charged." />
      )}
      {query.uploaded && <Alert tone="success" title="Signed copy uploaded." />}
      {query.uploadError && (
        <Alert tone="error" title="Upload failed">
          {query.uploadError}
        </Alert>
      )}
      {query.signed && (
        <Alert
          tone="success"
          title="Thank you — we've received your signed will and our team will take it from here."
        />
      )}
      {query.updated && (
        <Alert
          tone="success"
          title="New version created. Download it, sign it again with witnesses, and upload the signed copy."
        />
      )}

      <section aria-labelledby="timeline-title" className="card">
        <h2 id="timeline-title" className="sr-only">
          Progress
        </h2>
        <ol className="grid gap-3 sm:grid-cols-7" data-testid="order-timeline">
          {orderTimeline(status).map((stage) => (
            <li
              key={stage.key}
              className="flex items-center gap-2 text-sm sm:flex-col sm:text-center"
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  stage.state === "done"
                    ? "bg-ok text-white"
                    : stage.state === "current"
                      ? "bg-brand text-white"
                      : "bg-line text-muted"
                }`}
              >
                {stage.state === "done" ? "✓" : "•"}
              </span>
              <span className={stage.state === "upcoming" ? "text-muted" : "font-semibold"}>
                {stage.label}
                <span className="sr-only"> ({stage.state})</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="wills-title" className="space-y-3">
        <h2 id="wills-title" className="text-xl font-semibold">
          {order.plan === "couple" ? "Your wills" : "Your will"}
        </h2>
        <ul className="space-y-3">
          {willInfo.map(({ will, name, progress }) => (
            <li key={will.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{labelFor(will.position, name)}</p>
                <p className="text-muted text-sm">
                  {status === "draft"
                    ? `${progress}% of questions complete`
                    : `Version ${overview.versions.find((v) => v.willId === will.id)?.version ?? "–"}`}
                </p>
              </div>
              {mode !== "locked" && (
                <Link
                  href={`/dashboard/wills/${will.id}/${status === "draft" ? will.currentStep : "review"}`}
                  className="btn btn-secondary"
                >
                  {status === "draft" ? (progress > 0 ? "Continue" : "Start") : "Update this will"}
                </Link>
              )}
            </li>
          ))}
        </ul>
        {mode === "update" && order.updateWindowEndsAt && (
          <p className="text-muted text-sm">
            Free updates until{" "}
            {order.updateWindowEndsAt.toLocaleDateString("en-US", { dateStyle: "long" })}. Each
            update must be signed again.
          </p>
        )}
      </section>

      {readiness && (
        <section id="checkout" aria-labelledby="checkout-title" className="card space-y-4">
          <h2 id="checkout-title" className="text-xl font-semibold">
            Checkout
          </h2>
          {readiness.problems.length > 0 && (
            <Alert tone={readiness.blocked ? "error" : "warn"} title="Before you can pay">
              <ul className="list-disc pl-5">
                {readiness.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Alert>
          )}
          {readiness.wills.flatMap((w) => w.screening.findings).length > 0 && (
            <div className="space-y-2" data-testid="checkout-screening">
              {readiness.wills.flatMap((w) =>
                w.screening.findings.map((f) => (
                  <Alert
                    key={`${w.willId}-${f.code}`}
                    tone={f.severity === "block" ? "error" : "warn"}
                    title={f.title}
                    role="note"
                  >
                    {f.message} <strong>{f.recommendation}</strong>
                  </Alert>
                )),
              )}
            </div>
          )}
          <p>
            <span className="text-3xl font-bold">{formatCents(plan.amountCents)}</span>{" "}
            <span className="text-muted text-sm">one-time</span>
          </p>
          <CheckoutForm
            orderId={order.id}
            priceLabel={formatCents(plan.amountCents)}
            disabled={!readiness.ready}
            bypass={isPaymentBypassEnabled()}
            acknowledgements={[
              ...new Map(
                readiness.wills
                  .flatMap((w) => w.screening.findings)
                  .filter((f) => f.severity === "warn")
                  .map((f) => [f.code, { code: f.code, title: f.title }]),
              ).values(),
            ]}
          />
          <form action={cancelOrderAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <SubmitButton variant="secondary" pendingText="Cancelling…">
              Cancel this order
            </SubmitButton>
          </form>
        </section>
      )}

      {docs.length > 0 && (
        <section aria-labelledby="docs-title" className="card space-y-4">
          <h2 id="docs-title" className="text-xl font-semibold">
            Your documents
          </h2>
          <ul className="space-y-3">
            {willInfo.map(({ will, name }) => {
              const willDocs = docs.filter((d) => d.willId === will.id);
              if (willDocs.length === 0) return null;
              return (
                <li key={will.id} className="space-y-2">
                  <p className="font-semibold">
                    {labelFor(will.position, name)} — version {willDocs[0]?.version}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {willDocs.map((d) => (
                      <a
                        key={d.documentId}
                        href={`/api/documents/${d.documentId}`}
                        className={d.kind === "will" ? "btn btn-primary" : "btn btn-secondary"}
                        data-testid={`download-${d.kind}`}
                      >
                        Download {d.kind === "will" ? "will (PDF)" : "signing instructions (PDF)"}
                      </a>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {rule && (
            <p className="text-muted text-sm">
              {rule.name}: sign in front of {rule.witnessesRequired} adult witnesses
              {rule.selfProvingAffidavitAvailable && rule.affidavitRequiresNotary
                ? " and a notary"
                : ""}
              . Follow the signing instructions exactly.
            </p>
          )}
        </section>
      )}

      {canRecordExecution(status) && rule && (
        <section aria-labelledby="sign-title" className="card space-y-5" id="sign">
          <h2 id="sign-title" className="text-xl font-semibold">
            After you sign
          </h2>
          <ol className="text-muted list-decimal space-y-1 pl-5 text-sm">
            <li>
              Scan or photograph every page of the signed will (PDF, PNG or JPEG, up to{" "}
              {MAX_UPLOAD_BYTES / 1024 / 1024} MB).
            </li>
            <li>Upload it below.</li>
            <li>Confirm the signing and choose where the original should be kept.</li>
          </ol>
          {willInfo.map(({ will, name }) => (
            <form
              key={will.id}
              method="post"
              action={`/api/orders/${order.id}/uploads`}
              encType="multipart/form-data"
              className="border-line space-y-3 rounded-md border p-4"
            >
              <input type="hidden" name="willId" value={will.id} />
              <label htmlFor={`file-${will.id}`} className="label">
                Signed copy of {labelFor(will.position, name)}
                {missingUploads.includes(will.id) ? "" : " ✓ uploaded"}
              </label>
              <input
                id={`file-${will.id}`}
                name="file"
                type="file"
                required
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm"
              />
              <SubmitButton variant="secondary" pendingText="Uploading…">
                Upload signed copy
              </SubmitButton>
            </form>
          ))}
          {overview.uploads.length > 0 && (
            <ul className="text-sm" data-testid="uploads-list">
              {overview.uploads.map((u) => (
                <li key={u.id}>
                  <a href={`/api/uploads/${u.id}`} className="link">
                    Signed copy uploaded {u.createdAt.toLocaleString("en-US")}
                  </a>{" "}
                  <span className="text-muted">({Math.ceil(u.sizeBytes / 1024)} KB)</span>
                </li>
              ))}
            </ul>
          )}
          <ConfirmSigningForm
            orderId={order.id}
            witnesses={rule.witnessesRequired}
            notary={rule.selfProvingAffidavitAvailable && rule.affidavitRequiresNotary}
            disabled={missingUploads.length > 0}
            methods={availableFilingMethods(rule).map((m) => ({
              value: m,
              label: FILING_METHOD_LABELS[m],
              description:
                m === "court_deposit"
                  ? `We'll deposit your original with the ${rule.depositAuthority ?? "court"} for safekeeping. Mail the original to us using the instructions we email you.`
                  : "We keep your original in our secure, access-logged vault and release it to your executor.",
            }))}
          />
        </section>
      )}

      {openTask && (
        <section
          aria-labelledby="filing-title"
          className="card space-y-2"
          data-testid="filing-status"
        >
          <h2 id="filing-title" className="text-xl font-semibold">
            Filing and safekeeping
          </h2>
          <p>
            <strong>{FILING_METHOD_LABELS[openTask.method]}</strong> —{" "}
            {FILING_STATUS_LABELS[openTask.status as FilingTaskStatus] ?? openTask.status}
          </p>
          {openTask.trackingNumber && (
            <p className="text-sm">Tracking number: {openTask.trackingNumber}</p>
          )}
          {openTask.courtReference && (
            <p className="text-sm">
              Court reference: {openTask.courtReference}
              {openTask.filedOn ? ` (filed ${openTask.filedOn})` : ""}
            </p>
          )}
          {openTask.vaultReference && (
            <p className="text-sm">Vault reference: {openTask.vaultReference}</p>
          )}
        </section>
      )}

      {overview.history.length > 0 && (
        <section aria-labelledby="history-title" className="space-y-2">
          <h2 id="history-title" className="text-lg font-semibold">
            History
          </h2>
          <ul className="text-muted space-y-1 text-sm">
            {overview.history.map((h) => (
              <li key={h.id}>
                {h.createdAt.toLocaleString("en-US")} —{" "}
                {isOrderStatus(h.toStatus) ? ORDER_STATUS_LABELS[h.toStatus] : h.toStatus}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
