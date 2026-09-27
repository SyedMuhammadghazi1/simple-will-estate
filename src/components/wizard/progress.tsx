import Link from "next/link";
import { STEPS, progressPercent, stepIndex, type StepId } from "@/lib/will/steps";

export function WizardProgress({
  willId,
  current,
  completed,
}: {
  willId: string;
  current: StepId;
  completed: readonly string[];
}) {
  const pct = progressPercent(completed as StepId[]);
  const idx = stepIndex(current);
  return (
    <nav aria-label="Will progress" className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          Step {idx + 1} of {STEPS.length}
        </span>
        <span className="text-muted">{pct}% complete</span>
      </div>
      <div
        className="bg-line h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Questions completed"
      >
        <div className="bg-brand h-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="flex flex-wrap gap-1.5 text-xs">
        {STEPS.map((s) => {
          const done = completed.includes(s.id);
          const isCurrent = s.id === current;
          return (
            <li key={s.id}>
              <Link
                href={`/dashboard/wills/${willId}/${s.id}`}
                aria-current={isCurrent ? "step" : undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                  isCurrent
                    ? "border-brand bg-brand text-white"
                    : done
                      ? "bg-ok-light text-ok border-green-300"
                      : "border-line text-muted bg-white"
                }`}
              >
                {done && !isCurrent && <span aria-hidden="true">✓</span>}
                {s.shortTitle}
                {done && <span className="sr-only">(complete)</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
