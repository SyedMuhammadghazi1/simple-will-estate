"use client";

import { useState } from "react";
import { CUSTODIAN_AGE_MAX, CUSTODIAN_AGE_MIN } from "@/lib/config";
import { ageFromIso } from "@/lib/dates";
import { listStateRules } from "@/lib/states";
import {
  FUNERAL_LABELS,
  FUNERAL_PREFERENCES,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  bpsToPercent,
  percentToBps,
  type WillAnswers,
} from "@/lib/will/answers";
import { hasMinorChildren, totalShareBps } from "@/lib/will/validation";
import { Checkbox, Fieldset, SelectInput, TextArea, TextInput, YesNo } from "./inputs";

export interface StepFieldProps<K extends keyof WillAnswers> {
  data: WillAnswers[K];
  update: (fn: (prev: WillAnswers[K]) => WillAnswers[K]) => void;
  errors: Record<string, string>;
  answers: WillAnswers;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STATE_OPTIONS = listStateRules().map((s) => ({
  value: s.code,
  label: s.supported ? s.name : `${s.name} (not supported)`,
}));

export function AboutFields({ data, update, errors }: StepFieldProps<"about">) {
  const set = <F extends keyof typeof data>(field: F, value: (typeof data)[F]) =>
    update((prev) => ({ ...prev, [field]: value }));
  const married = data.maritalStatus === "married" || data.maritalStatus === "domestic_partnership";
  return (
    <div className="space-y-5">
      <TextInput
        path="about.fullLegalName"
        label="Full legal name"
        hint="Exactly as it appears on your ID, including middle names."
        required
        autoComplete="name"
        value={data.fullLegalName}
        onChange={(v) => set("fullLegalName", v)}
        error={errors["about.fullLegalName"]}
      />
      <TextInput
        path="about.dateOfBirth"
        label="Date of birth"
        type="date"
        required
        autoComplete="bday"
        value={data.dateOfBirth}
        onChange={(v) => set("dateOfBirth", v)}
        error={errors["about.dateOfBirth"]}
        hint="You must be 18 or older."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectInput
          path="about.stateCode"
          label="State of residence"
          required
          options={STATE_OPTIONS}
          value={data.stateCode}
          onChange={(v) => set("stateCode", v)}
          error={errors["about.stateCode"]}
        />
        <TextInput
          path="about.county"
          label="County"
          required
          value={data.county}
          onChange={(v) => set("county", v)}
          error={errors["about.county"]}
          hint="Without the word “County”."
        />
      </div>
      {data.stateCode === "LA" && (
        <div
          role="alert"
          className="bg-danger-light text-danger rounded-md border border-red-200 p-3 text-sm"
        >
          Louisiana uses a different legal system for wills, so we can&apos;t prepare a Louisiana
          will. Please speak with a Louisiana attorney. You won&apos;t be charged.
        </div>
      )}
      <TextInput
        path="about.addressLine1"
        label="Street address"
        required
        autoComplete="address-line1"
        value={data.addressLine1}
        onChange={(v) => set("addressLine1", v)}
        error={errors["about.addressLine1"]}
      />
      <TextInput
        path="about.addressLine2"
        label="Apartment, suite, etc. (optional)"
        autoComplete="address-line2"
        value={data.addressLine2}
        onChange={(v) => set("addressLine2", v)}
        error={errors["about.addressLine2"]}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          path="about.city"
          label="City or town"
          required
          autoComplete="address-level2"
          value={data.city}
          onChange={(v) => set("city", v)}
          error={errors["about.city"]}
        />
        <TextInput
          path="about.postalCode"
          label="ZIP code"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          value={data.postalCode}
          onChange={(v) => set("postalCode", v)}
          error={errors["about.postalCode"]}
        />
      </div>
      <SelectInput
        path="about.maritalStatus"
        label="Marital status"
        required
        options={MARITAL_STATUSES.map((s) => ({ value: s, label: MARITAL_STATUS_LABELS[s] }))}
        value={data.maritalStatus}
        onChange={(v) => set("maritalStatus", v as typeof data.maritalStatus)}
        error={errors["about.maritalStatus"]}
      />
      {married && (
        <TextInput
          path="about.spouseName"
          label="Spouse or partner's full legal name"
          required
          value={data.spouseName}
          onChange={(v) => set("spouseName", v)}
          error={errors["about.spouseName"]}
        />
      )}
    </div>
  );
}

const SITUATION_QUESTIONS: {
  key: Exclude<keyof WillAnswers["situation"], "estimatedEstateValueCents">;
  label: string;
  hint: string;
}[] = [
  {
    key: "ownsBusiness",
    label: "Do you own all or part of a business?",
    hint: "Including partnerships, LLCs and professional practices.",
  },
  {
    key: "specialNeedsBeneficiary",
    label:
      "Will anyone you want to leave property to be receiving means-tested benefits (such as SSI or Medicaid) because of a disability?",
    hint: "An inheritance can make them lose those benefits.",
  },
  {
    key: "disinheritSpouse",
    label: "Do you intend to leave your spouse or partner out of your will?",
    hint: "Answer “No” if you are not married.",
  },
  {
    key: "spouseNonUsCitizen",
    label: "Is your spouse or partner NOT a US citizen?",
    hint: "Answer “No” if you are not married.",
  },
  {
    key: "significantForeignAssets",
    label: "Do you own significant property or accounts outside the US?",
    hint: "",
  },
  {
    key: "expectsContest",
    label: "Do you expect anyone to challenge your will?",
    hint: "For example a family member you are leaving out.",
  },
];

export function SituationFields({ data, update, errors }: StepFieldProps<"situation">) {
  const [dollars, setDollars] = useState(
    data.estimatedEstateValueCents === null
      ? ""
      : String(Math.round(data.estimatedEstateValueCents / 100)),
  );
  return (
    <div className="space-y-6">
      <TextInput
        path="situation.estimatedEstateValueCents"
        label="Roughly what is everything you own worth, minus debts? (USD)"
        hint="Include your home, savings, investments, retirement accounts and life insurance. A rough guess is fine."
        required
        inputMode="numeric"
        maxLength={16}
        value={dollars}
        onChange={(v) => {
          const clean = v.replace(/[^0-9]/g, "");
          setDollars(clean);
          update((prev) => ({
            ...prev,
            estimatedEstateValueCents: clean === "" ? null : Number(clean) * 100,
          }));
        }}
        error={errors["situation.estimatedEstateValueCents"]}
      />
      {SITUATION_QUESTIONS.map((q) => (
        <YesNo
          key={q.key}
          path={`situation.${q.key}`}
          label={q.label}
          hint={q.hint || undefined}
          required
          value={data[q.key]}
          onChange={(v) => update((prev) => ({ ...prev, [q.key]: v }))}
          error={errors[`situation.${q.key}`]}
        />
      ))}
    </div>
  );
}

export function ChildrenFields({ data, update, errors }: StepFieldProps<"children">) {
  const today = new Date();
  return (
    <div className="space-y-6">
      <YesNo
        path="children.hasChildren"
        label="Do you have any children (including adopted children)?"
        required
        value={data.hasChildren}
        onChange={(v) =>
          update((prev) => ({
            ...prev,
            hasChildren: v,
            children:
              v && prev.children.length === 0
                ? [{ id: newId(), fullName: "", dateOfBirth: "" }]
                : prev.children,
          }))
        }
        error={errors["children.hasChildren"]}
      />
      {data.hasChildren && (
        <div className="space-y-4">
          {errors["children.children"] && (
            <p className="field-error">{errors["children.children"]}</p>
          )}
          {data.children.map((child, i) => {
            const age = ageFromIso(child.dateOfBirth, today);
            return (
              <Fieldset key={child.id} legend={`Child ${i + 1}`}>
                <TextInput
                  path={`children.children.${i}.fullName`}
                  label="Full name"
                  required
                  value={child.fullName}
                  onChange={(v) =>
                    update((prev) => ({
                      ...prev,
                      children: prev.children.map((c) =>
                        c.id === child.id ? { ...c, fullName: v } : c,
                      ),
                    }))
                  }
                  error={errors[`children.children.${i}.fullName`]}
                />
                <TextInput
                  path={`children.children.${i}.dateOfBirth`}
                  label="Date of birth"
                  type="date"
                  required
                  value={child.dateOfBirth}
                  onChange={(v) =>
                    update((prev) => ({
                      ...prev,
                      children: prev.children.map((c) =>
                        c.id === child.id ? { ...c, dateOfBirth: v } : c,
                      ),
                    }))
                  }
                  error={errors[`children.children.${i}.dateOfBirth`]}
                  hint={
                    age !== null && age >= 0
                      ? age < 18
                        ? `Minor (age ${age})`
                        : `Adult (age ${age})`
                      : undefined
                  }
                />
                <button
                  type="button"
                  className="text-danger text-sm underline"
                  onClick={() =>
                    update((prev) => ({
                      ...prev,
                      children: prev.children.filter((c) => c.id !== child.id),
                    }))
                  }
                >
                  Remove child {i + 1}
                </button>
              </Fieldset>
            );
          })}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              update((prev) => ({
                ...prev,
                children: [...prev.children, { id: newId(), fullName: "", dateOfBirth: "" }],
              }))
            }
          >
            + Add a child
          </button>
          <Checkbox
            path="children.includeFutureChildren"
            checked={data.includeFutureChildren}
            onChange={(v) => update((prev) => ({ ...prev, includeFutureChildren: v }))}
            label="Include any children I have or adopt in the future, as if they were listed here."
            hint="Recommended. If unticked, future children won't inherit under this will unless you update it."
          />
        </div>
      )}
    </div>
  );
}

function PersonInputs({
  base,
  label,
  person,
  onChange,
  errors,
  required,
}: {
  base: string;
  label: string;
  person: { fullName: string; relationship: string };
  onChange: (p: { fullName: string; relationship: string }) => void;
  errors: Record<string, string>;
  required?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        path={`${base}.fullName`}
        label={`${label} — full name`}
        required={required}
        value={person.fullName}
        onChange={(v) => onChange({ ...person, fullName: v })}
        error={errors[`${base}.fullName`]}
      />
      <TextInput
        path={`${base}.relationship`}
        label="Relationship to you"
        placeholder="e.g. Sister, Friend"
        maxLength={100}
        value={person.relationship}
        onChange={(v) => onChange({ ...person, relationship: v })}
        error={errors[`${base}.relationship`]}
      />
    </div>
  );
}

export function GuardianFields({ data, update, errors, answers }: StepFieldProps<"guardians">) {
  const minors = hasMinorChildren(answers, new Date());
  return (
    <div className="space-y-6">
      {!minors && (
        <p className="bg-brand-light text-brand-dark rounded-md p-3 text-sm" role="status">
          You haven&apos;t listed any children under 18, so you don&apos;t need to name a guardian.
          You can continue to the next step.
        </p>
      )}
      <Fieldset
        legend="Guardian"
        description="Who should raise your minor children if no parent is able to?"
      >
        <PersonInputs
          base="guardians.primary"
          label="Guardian"
          required={minors}
          person={data.primary}
          onChange={(p) => update((prev) => ({ ...prev, primary: p }))}
          errors={errors}
        />
      </Fieldset>
      <Fieldset
        legend="Alternate guardian"
        description="If your first choice can't or won't serve. Recommended."
      >
        <PersonInputs
          base="guardians.alternate"
          label="Alternate guardian"
          person={data.alternate}
          onChange={(p) => update((prev) => ({ ...prev, alternate: p }))}
          errors={errors}
        />
      </Fieldset>
    </div>
  );
}

export function ExecutorFields({ data, update, errors }: StepFieldProps<"executor">) {
  return (
    <div className="space-y-6">
      <Fieldset
        legend="Executor"
        description="Your executor collects your assets, pays debts and distributes what's left. Choose an adult you trust; many people choose a spouse, adult child or close friend."
      >
        <PersonInputs
          base="executor.primary"
          label="Executor"
          required
          person={data.primary}
          onChange={(p) => update((prev) => ({ ...prev, primary: p }))}
          errors={errors}
        />
      </Fieldset>
      <Fieldset
        legend="Alternate executor"
        description="Serves if your executor can't. Recommended."
      >
        <PersonInputs
          base="executor.alternate"
          label="Alternate executor"
          person={data.alternate}
          onChange={(p) => update((prev) => ({ ...prev, alternate: p }))}
          errors={errors}
        />
      </Fieldset>
      <Checkbox
        path="executor.waiveBond"
        checked={data.waiveBond}
        onChange={(v) => update((prev) => ({ ...prev, waiveBond: v }))}
        label="Waive the bond requirement for my executor (recommended)"
        hint="A bond is an insurance policy some courts require an executor to buy, paid for by your estate. Waiving it saves money where the law allows."
      />
    </div>
  );
}

export function BeneficiaryFields({ data, update, errors, answers }: StepFieldProps<"residuary">) {
  const [percentText, setPercentText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.beneficiaries.map((b) => [b.id, b.shareBps ? bpsToPercent(b.shareBps) : ""]),
    ),
  );
  const total = totalShareBps({ ...answers, residuary: data });
  const addBeneficiary = (kind: "person" | "charity") => {
    const id = newId();
    setPercentText((p) => ({ ...p, [id]: "" }));
    update((prev) => ({
      ...prev,
      beneficiaries: [...prev.beneficiaries, { id, kind, name: "", relationship: "", shareBps: 0 }],
    }));
  };
  const spouse = answers.about.spouseName.trim();
  return (
    <div className="space-y-6">
      <p className="text-muted text-sm">
        Your <strong>residuary estate</strong> is everything you own that isn&apos;t given away as a
        specific gift. Say who receives it and what percentage each gets. Shares must add up to
        exactly 100%.
      </p>
      {errors["residuary.beneficiaries"] && (
        <p className="field-error">{errors["residuary.beneficiaries"]}</p>
      )}
      {data.beneficiaries.map((b, i) => {
        const setB = (patch: Partial<typeof b>) =>
          update((prev) => ({
            ...prev,
            beneficiaries: prev.beneficiaries.map((x) => (x.id === b.id ? { ...x, ...patch } : x)),
          }));
        return (
          <Fieldset
            key={b.id}
            legend={`Beneficiary ${i + 1}${b.kind === "charity" ? " (charity)" : ""}`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                path={`residuary.beneficiaries.${i}.name`}
                label={b.kind === "charity" ? "Charity's full legal name" : "Full name"}
                required
                value={b.name}
                onChange={(v) => setB({ name: v })}
                error={errors[`residuary.beneficiaries.${i}.name`]}
              />
              {b.kind === "person" ? (
                <TextInput
                  path={`residuary.beneficiaries.${i}.relationship`}
                  label="Relationship to you"
                  placeholder="e.g. Spouse, Daughter"
                  maxLength={100}
                  value={b.relationship}
                  onChange={(v) => setB({ relationship: v })}
                  error={errors[`residuary.beneficiaries.${i}.relationship`]}
                />
              ) : (
                <div />
              )}
            </div>
            <TextInput
              path={`residuary.beneficiaries.${i}.shareBps`}
              label="Share (%)"
              required
              inputMode="decimal"
              maxLength={6}
              className="max-w-40"
              value={percentText[b.id] ?? ""}
              onChange={(v) => {
                setPercentText((p) => ({ ...p, [b.id]: v }));
                setB({ shareBps: percentToBps(v) ?? 0 });
              }}
              error={
                errors[`residuary.beneficiaries.${i}.shareBps`] ??
                (percentText[b.id] && percentToBps(percentText[b.id] ?? "") === null
                  ? "Enter a number like 50 or 33.33"
                  : undefined)
              }
            />
            <button
              type="button"
              className="text-danger text-sm underline"
              onClick={() =>
                update((prev) => ({
                  ...prev,
                  beneficiaries: prev.beneficiaries.filter((x) => x.id !== b.id),
                }))
              }
            >
              Remove beneficiary {i + 1}
            </button>
          </Fieldset>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => addBeneficiary("person")}
        >
          + Add a person
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => addBeneficiary("charity")}
        >
          + Add a charity
        </button>
        {spouse &&
          !data.beneficiaries.some((b) => b.name.trim().toLowerCase() === spouse.toLowerCase()) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const id = newId();
                setPercentText((p) => ({ ...p, [id]: "" }));
                update((prev) => ({
                  ...prev,
                  beneficiaries: [
                    ...prev.beneficiaries,
                    { id, kind: "person", name: spouse, relationship: "Spouse", shareBps: 0 },
                  ],
                }));
              }}
            >
              + Add {spouse}
            </button>
          )}
      </div>
      <p
        aria-live="polite"
        data-testid="share-total"
        className={`rounded-md p-3 text-sm font-semibold ${total === 10_000 ? "bg-ok-light text-ok" : "bg-warn-light text-warn"}`}
      >
        Total: {bpsToPercent(total)}% {total === 10_000 ? "✓" : "— must equal 100%"}
      </p>
      {errors["residuary.total"] && <p className="field-error">{errors["residuary.total"]}</p>}
      <fieldset
        aria-describedby={
          errors["residuary.contingency"] ? "f-residuary-contingency-error" : undefined
        }
        id="f-residuary-contingency"
      >
        <legend className="label">
          If a beneficiary dies before you, what should happen to their share?
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="mt-2 space-y-2">
          {[
            {
              value: "per_stirpes",
              label: "Pass it to their children and descendants (“per stirpes”)",
              hint: "Common when leaving property to your children.",
            },
            {
              value: "surviving_beneficiaries",
              label: "Share it among my other beneficiaries",
              hint: "Their share is split between the others in proportion.",
            },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${data.contingency === opt.value ? "border-brand bg-brand-light" : "border-line bg-white"}`}
            >
              <input
                type="radio"
                name="residuary.contingency"
                value={opt.value}
                className="mt-1 h-4 w-4"
                checked={data.contingency === opt.value}
                onChange={() =>
                  update((prev) => ({ ...prev, contingency: opt.value as typeof prev.contingency }))
                }
              />
              <span>
                <span className="block text-sm font-semibold">{opt.label}</span>
                <span className="text-muted block text-sm">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors["residuary.contingency"] && (
          <p id="f-residuary-contingency-error" className="field-error">
            {errors["residuary.contingency"]}
          </p>
        )}
      </fieldset>
    </div>
  );
}

export function GiftFields({ data, update, errors }: StepFieldProps<"gifts">) {
  return (
    <div className="space-y-6">
      <p className="text-muted text-sm">
        Optional. Leave particular items or sums to particular people — for example “my wedding
        ring” or “$5,000”. Anything not listed here becomes part of your residuary estate.
      </p>
      {data.gifts.map((g, i) => {
        const setG = (patch: Partial<typeof g>) =>
          update((prev) => ({
            ...prev,
            gifts: prev.gifts.map((x) => (x.id === g.id ? { ...x, ...patch } : x)),
          }));
        return (
          <Fieldset key={g.id} legend={`Gift ${i + 1}`}>
            <TextInput
              path={`gifts.gifts.${i}.description`}
              label="What are you giving?"
              hint="Describe it clearly, e.g. “my 2019 Honda Civic” or “the sum of $5,000”."
              required
              maxLength={500}
              value={g.description}
              onChange={(v) => setG({ description: v })}
              error={errors[`gifts.gifts.${i}.description`]}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                path={`gifts.gifts.${i}.recipientName`}
                label="Recipient's full name"
                required
                value={g.recipientName}
                onChange={(v) => setG({ recipientName: v })}
                error={errors[`gifts.gifts.${i}.recipientName`]}
              />
              <TextInput
                path={`gifts.gifts.${i}.alternateRecipientName`}
                label="Alternate recipient (optional)"
                hint="Receives the gift if the recipient dies before you."
                value={g.alternateRecipientName}
                onChange={(v) => setG({ alternateRecipientName: v })}
                error={errors[`gifts.gifts.${i}.alternateRecipientName`]}
              />
            </div>
            <button
              type="button"
              className="text-danger text-sm underline"
              onClick={() =>
                update((prev) => ({ ...prev, gifts: prev.gifts.filter((x) => x.id !== g.id) }))
              }
            >
              Remove gift {i + 1}
            </button>
          </Fieldset>
        );
      })}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          update((prev) => ({
            ...prev,
            gifts: [
              ...prev.gifts,
              { id: newId(), description: "", recipientName: "", alternateRecipientName: "" },
            ],
          }))
        }
      >
        + Add a gift
      </button>
    </div>
  );
}

export function MinorsFields({ data, update, errors, answers }: StepFieldProps<"minors">) {
  const minors = hasMinorChildren(answers, new Date());
  const ages = Array.from(
    { length: CUSTODIAN_AGE_MAX - CUSTODIAN_AGE_MIN + 1 },
    (_, i) => CUSTODIAN_AGE_MIN + i,
  );
  return (
    <div className="space-y-6">
      <p className="text-muted text-sm">
        Children can&apos;t legally manage property. A <strong>custodian</strong> can hold and
        manage anything a young beneficiary inherits until they reach an age you choose (between{" "}
        {CUSTODIAN_AGE_MIN} and {CUSTODIAN_AGE_MAX}, where your state&apos;s Uniform Transfers to
        Minors Act allows).
        {minors && " You have minor children, so we recommend this."}
      </p>
      <YesNo
        path="minors.useCustodian"
        label="Appoint a custodian for young beneficiaries?"
        required
        value={data.useCustodian}
        onChange={(v) => update((prev) => ({ ...prev, useCustodian: v }))}
        error={errors["minors.useCustodian"]}
      />
      {data.useCustodian && (
        <>
          <SelectInput
            path="minors.custodianAge"
            label="Hold property until the beneficiary reaches age"
            required
            placeholder="Choose an age"
            options={ages.map((a) => ({ value: String(a), label: String(a) }))}
            value={String(data.custodianAge)}
            onChange={(v) => update((prev) => ({ ...prev, custodianAge: Number(v) || 0 }))}
            error={errors["minors.custodianAge"]}
          />
          <TextInput
            path="minors.custodianName"
            label="Custodian's full name"
            required
            value={data.custodianName}
            onChange={(v) => update((prev) => ({ ...prev, custodianName: v }))}
            error={errors["minors.custodianName"]}
          />
          <TextInput
            path="minors.alternateCustodianName"
            label="Alternate custodian (optional)"
            value={data.alternateCustodianName}
            onChange={(v) => update((prev) => ({ ...prev, alternateCustodianName: v }))}
            error={errors["minors.alternateCustodianName"]}
          />
        </>
      )}
    </div>
  );
}

export function WishesFields({ data, update, errors }: StepFieldProps<"wishes">) {
  const set = <F extends keyof typeof data>(field: F, value: (typeof data)[F]) =>
    update((prev) => ({ ...prev, [field]: value }));
  return (
    <div className="space-y-6">
      <Fieldset
        legend="Funeral and burial"
        description="These wishes are included in your will but are not legally binding. Tell your family too — wills are often read after the funeral."
      >
        <SelectInput
          path="wishes.funeralPreference"
          label="Preference"
          placeholder="No preference stated"
          options={FUNERAL_PREFERENCES.map((f) => ({ value: f, label: FUNERAL_LABELS[f] }))}
          value={data.funeralPreference}
          onChange={(v) => set("funeralPreference", v as typeof data.funeralPreference)}
          error={errors["wishes.funeralPreference"]}
        />
        <TextArea
          path="wishes.funeralNotes"
          label="Details (optional)"
          value={data.funeralNotes}
          onChange={(v) => set("funeralNotes", v)}
          error={errors["wishes.funeralNotes"]}
        />
      </Fieldset>
      <Fieldset legend="Pets">
        <Checkbox
          path="wishes.hasPets"
          checked={data.hasPets}
          onChange={(v) => set("hasPets", v)}
          label="I want to name someone to care for my pets"
        />
        {data.hasPets && (
          <>
            <TextInput
              path="wishes.petCaretakerName"
              label="Caretaker's full name"
              required
              value={data.petCaretakerName}
              onChange={(v) => set("petCaretakerName", v)}
              error={errors["wishes.petCaretakerName"]}
            />
            <TextArea
              path="wishes.petNotes"
              label="Care wishes (optional)"
              maxLength={1000}
              value={data.petNotes}
              onChange={(v) => set("petNotes", v)}
              error={errors["wishes.petNotes"]}
            />
          </>
        )}
      </Fieldset>
      <Fieldset
        legend="Digital assets"
        description="Email, social media, photos and online accounts. Never put passwords in your will."
      >
        <TextArea
          path="wishes.digitalAssetsInstructions"
          label="Instructions for your executor (optional)"
          hint="For example: “Memorialize my social media accounts and give my photos to my children.”"
          value={data.digitalAssetsInstructions}
          onChange={(v) => set("digitalAssetsInstructions", v)}
          error={errors["wishes.digitalAssetsInstructions"]}
        />
      </Fieldset>
    </div>
  );
}
