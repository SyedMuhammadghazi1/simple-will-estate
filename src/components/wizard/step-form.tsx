"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ComponentType } from "react";
import { autosaveAction, submitStepAction } from "@/app/dashboard/actions";
import type { WillAnswers, WillSectionKey } from "@/lib/will/answers";
import { getStep, previousStep, type StepId } from "@/lib/will/steps";
import { issuesByPath, validateStep, type Issue } from "@/lib/will/validation";
import { fieldId } from "./inputs";
import {
  AboutFields,
  BeneficiaryFields,
  ChildrenFields,
  ExecutorFields,
  GiftFields,
  GuardianFields,
  MinorsFields,
  SituationFields,
  WishesFields,
  type StepFieldProps,
} from "./step-fields";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FIELDS: Record<WillSectionKey, ComponentType<StepFieldProps<any>>> = {
  about: AboutFields,
  situation: SituationFields,
  children: ChildrenFields,
  guardians: GuardianFields,
  executor: ExecutorFields,
  residuary: BeneficiaryFields,
  gifts: GiftFields,
  minors: MinorsFields,
  wishes: WishesFields,
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1200;

export function StepForm({
  willId,
  stepId,
  initialAnswers,
}: {
  willId: string;
  stepId: StepId;
  initialAnswers: WillAnswers;
}) {
  const router = useRouter();
  const step = getStep(stepId);
  const section = step.section as WillSectionKey;
  const [data, setData] = useState<WillAnswers[WillSectionKey]>(initialAnswers[section]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);
  const latest = useRef(data);
  const summaryRef = useRef<HTMLDivElement>(null);
  const answers = { ...initialAnswers, [section]: data } as WillAnswers;

  const save = useCallback(async () => {
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    const res = await autosaveAction(willId, stepId, latest.current);
    if (res.ok) {
      setSaveState("saved");
      setSavedAt(res.savedAt ?? null);
      return true;
    }
    dirty.current = true;
    setSaveState("error");
    setFormError(res.error ?? "Your answers couldn't be saved.");
    return false;
  }, [willId, stepId]);

  useEffect(() => {
    latest.current = data;
    if (!dirty.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const update = (fn: (prev: WillAnswers[WillSectionKey]) => WillAnswers[WillSectionKey]) => {
    dirty.current = true;
    setData((prev) => fn(prev));
  };

  const showIssues = (list: Issue[]) => {
    setIssues(list);
    setErrors(issuesByPath(list));
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const local = validateStep(stepId, answers, { today: new Date() });
    setWarnings(local.warnings);
    if (local.errors.length > 0) {
      showIssues(local.errors);
      return;
    }
    startTransition(async () => {
      dirty.current = false;
      const res = await submitStepAction(willId, stepId, latest.current);
      if (res.errors && res.errors.length > 0) {
        showIssues(res.errors);
        return;
      }
      if (!res.ok) {
        setFormError(res.error ?? "Something went wrong.");
        dirty.current = true;
        return;
      }
      setIssues([]);
      setErrors({});
      setSaveState("saved");
      router.push(`/dashboard/wills/${willId}/${res.nextStep ?? "review"}`);
    });
  };

  const goBack = async () => {
    const prev = previousStep(stepId);
    await save();
    router.push(prev ? `/dashboard/wills/${willId}/${prev}` : `/dashboard`);
  };

  const Fields = FIELDS[section];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {(issues.length > 0 || formError) && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-title"
          className="border-danger/40 bg-danger-light rounded-md border p-4"
          data-testid="error-summary"
        >
          <p id="error-summary-title" className="text-danger font-semibold">
            {formError ?? "Please fix the following:"}
          </p>
          {issues.length > 0 && (
            <ul className="text-danger mt-2 list-disc space-y-1 pl-5 text-sm">
              {issues.map((i) => (
                <li key={`${i.path}-${i.code}`}>
                  <a href={`#${fieldId(i.path)}`} className="underline">
                    {i.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Fields data={data} update={update} errors={errors} answers={answers} />

      {warnings.length > 0 && (
        <div
          role="status"
          className="bg-warn-light text-warn rounded-md border border-amber-300 p-4 text-sm"
        >
          <p className="font-semibold">Worth considering</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.path}-${w.code}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <button type="button" className="btn btn-secondary" onClick={() => void goBack()}>
          ← Back
        </button>
        <p className="text-muted text-sm" aria-live="polite" data-testid="save-status">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" &&
            `Saved${savedAt ? ` at ${new Date(savedAt).toLocaleTimeString()}` : ""}`}
          {saveState === "error" && (
            <span className="text-danger">Not saved — check your connection</span>
          )}
        </p>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Save and continue →"}
        </button>
      </div>
      <p className="text-muted text-center text-xs">
        Your answers save automatically. You can leave and{" "}
        <Link href="/dashboard" className="link">
          come back later
        </Link>
        .
      </p>
    </form>
  );
}
