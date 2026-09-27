import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PublishUpdateForm } from "@/components/wizard/publish-update-form";
import { WizardProgress } from "@/components/wizard/progress";
import { StepForm } from "@/components/wizard/step-form";
import { formatLongDate } from "@/lib/dates";
import { screenAnswers } from "@/lib/will/screening";
import { STEPS, getStep, isStepId } from "@/lib/will/steps";
import { summarizeAnswers } from "@/lib/will/summary";
import { validateAnswers } from "@/lib/will/validation";
import { isAppError } from "@/server/errors";
import { mirrorPartnerAction } from "@/app/dashboard/actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { listWills } from "@/server/services/orders";
import { loadWillForEditing } from "@/server/services/wills";
import { requireUser } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ step: string }>;
}): Promise<Metadata> {
  const { step } = await params;
  return { title: isStepId(step) ? getStep(step).title : "Your will" };
}

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ willId: string; step: string }>;
}) {
  const { willId, step } = await params;
  if (!isStepId(step)) notFound();
  const actor = await requireUser(`/dashboard/wills/${willId}/${step}`);
  const loaded = await loadWillForEditing(actor, willId).catch((err) => {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  });
  const { will, order, answers, mode } = loaded;
  const def = getStep(step);
  const today = new Date();
  const siblings = order.plan === "couple" ? await listWills(order.id) : [];
  const willLabel =
    order.plan === "couple"
      ? will.position === 1
        ? "Your will"
        : "Your partner's will"
      : "Your will";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/dashboard/orders/${order.id}`} className="link">
          ← Back to order
        </Link>
        <span className="text-muted">
          {willLabel}
          {order.plan === "couple" && ` (${will.position} of ${siblings.length})`}
        </span>
      </div>
      <WizardProgress willId={will.id} current={step} completed={will.completedSteps} />

      {mode === "update" && (
        <Alert tone="info" title="You're updating a paid will">
          Changes are saved as a draft. When you&apos;re done, publish the update from the review
          step — you&apos;ll then need to sign the new version again.
        </Alert>
      )}
      {mode === "locked" && (
        <Alert tone="warn" title="This will can't be changed right now">
          {order.status === "filing_in_progress"
            ? "Filing is in progress. You can update your will once it has been filed or stored."
            : "Your free update window has ended or this order is closed."}
        </Alert>
      )}

      <section className="card space-y-6" aria-labelledby="step-title">
        <header>
          <h1 id="step-title" className="text-2xl font-bold">
            {def.title}
          </h1>
          <p className="text-muted mt-1">{def.description}</p>
        </header>

        {step === "about" && will.position === 2 && order.status === "draft" && (
          <form action={mirrorPartnerAction} className="bg-brand-light rounded-md p-4 text-sm">
            <input type="hidden" name="willId" value={will.id} />
            <p>
              Mirror wills usually match. Start from your partner&apos;s answers (names swapped,
              gifts and wishes left blank) and adjust anything that differs.
            </p>
            <SubmitButton variant="secondary" className="mt-3" pendingText="Copying…">
              Copy from partner&apos;s will
            </SubmitButton>
          </form>
        )}

        {step === "review" ? (
          <ReviewStep
            willId={will.id}
            orderId={order.id}
            answers={answers}
            today={today}
            mode={mode}
          />
        ) : mode === "locked" ? (
          <p className="text-muted">Answers are read-only.</p>
        ) : (
          <StepForm key={step} willId={will.id} stepId={step} initialAnswers={answers} />
        )}
      </section>
    </div>
  );
}

function ReviewStep({
  willId,
  orderId,
  answers,
  today,
  mode,
}: {
  willId: string;
  orderId: string;
  answers: Awaited<ReturnType<typeof loadWillForEditing>>["answers"];
  today: Date;
  mode: "draft" | "update" | "locked";
}) {
  const { errors, warnings } = validateAnswers(answers, { today });
  const screening = screenAnswers(answers);
  const sections = summarizeAnswers(answers, today);
  const stepTitle = (id: string) => STEPS.find((s) => s.id === id)?.title ?? id;
  const blocked = screening.outcome === "blocked";

  return (
    <div className="space-y-6">
      {errors.length > 0 ? (
        <Alert
          tone="error"
          title={`${errors.length} answer${errors.length === 1 ? " needs" : "s need"} attention`}
        >
          <ul className="mt-2 list-disc space-y-1 pl-5" data-testid="review-errors">
            {errors.map((e) => (
              <li key={`${e.path}-${e.code}`}>
                <Link className="underline" href={`/dashboard/wills/${willId}/${e.step}`}>
                  {stepTitle(e.step)}:
                </Link>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success" title="All questions answered" />
      )}

      {screening.findings.length > 0 && (
        <section
          aria-labelledby="screening-title"
          className="space-y-3"
          data-testid="screening-results"
        >
          <h2 id="screening-title" className="text-lg font-semibold">
            Is a simple will right for you?
          </h2>
          {screening.findings.map((f) => (
            <Alert
              key={f.code}
              tone={f.severity === "block" ? "error" : "warn"}
              title={f.title}
              role="note"
            >
              <p>{f.message}</p>
              <p className="mt-1 font-semibold">{f.recommendation}</p>
            </Alert>
          ))}
        </section>
      )}

      {warnings.length > 0 && (
        <Alert tone="warn" title="Worth considering" role="note">
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.path}-${w.code}`}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <section aria-labelledby="summary-title" className="space-y-4">
        <h2 id="summary-title" className="text-lg font-semibold">
          Your will in plain English
        </h2>
        {sections.map((s) => (
          <div key={s.step} className="border-line rounded-md border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{s.title}</h3>
              {mode !== "locked" && (
                <Link href={`/dashboard/wills/${willId}/${s.step}`} className="link text-sm">
                  Edit<span className="sr-only"> {s.title}</span>
                </Link>
              )}
            </div>
            <ul className="text-muted mt-2 space-y-1 text-sm">
              {s.sentences.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!blocked && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Preview</h2>
          <p className="text-muted text-sm">
            Previews are watermarked DRAFT and must not be signed. Your final documents are
            available after payment.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              className="btn btn-secondary"
              href={`/api/wills/${willId}/preview?kind=will`}
              target="_blank"
              rel="noopener"
            >
              Preview will (PDF)
            </a>
            <a
              className="btn btn-secondary"
              href={`/api/wills/${willId}/preview?kind=signing_instructions`}
              target="_blank"
              rel="noopener"
            >
              Preview signing instructions
            </a>
          </div>
        </section>
      )}

      <div className="border-line border-t pt-5">
        {mode === "draft" && (
          <Link
            href={`/dashboard/orders/${orderId}#checkout`}
            className={`btn btn-primary ${errors.length || blocked ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={errors.length > 0 || blocked}
            data-testid="continue-to-checkout"
          >
            Continue to checkout →
          </Link>
        )}
        {mode === "update" && (
          <PublishUpdateForm willId={willId} disabled={errors.length > 0 || blocked} />
        )}
        {mode === "locked" && (
          <p className="text-muted text-sm">
            Snapshot reviewed {formatLongDate(today.toISOString().slice(0, 10))}.
          </p>
        )}
      </div>
    </div>
  );
}
