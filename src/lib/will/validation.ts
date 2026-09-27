import { CUSTODIAN_AGE_MAX, CUSTODIAN_AGE_MIN, MINIMUM_TESTATOR_AGE } from "../config";
import { ageFromIso, isInFuture, parseIsoDate } from "../dates";
import { isStateCode } from "../states";
import type { WillAnswers } from "./answers";
import { STEP_IDS, type StepId } from "./steps";
import { findUnrenderableChars, isBlank, normalizeName, sameName } from "./text";

/**
 * Pure business validation for will answers.
 *
 * `errors` block progress (the step cannot be completed / checkout is refused).
 * `warnings` are shown to the customer but do not block.
 */

export interface Issue {
  step: StepId;
  /** Dot path of the field inside the answers object, e.g. "residuary.beneficiaries.0.name". */
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

export interface ValidationOptions {
  today: Date;
}

const POSTAL_CODE = /^\d{5}(-\d{4})?$/;
const MAX_TESTATOR_AGE = 120;

export function hasMarriedStatus(answers: WillAnswers): boolean {
  const s = answers.about.maritalStatus;
  return s === "married" || s === "domestic_partnership";
}

export interface ChildWithAge {
  id: string;
  fullName: string;
  dateOfBirth: string;
  age: number | null;
  isMinor: boolean;
}

export function childrenWithAges(answers: WillAnswers, today: Date): ChildWithAge[] {
  if (answers.children.hasChildren !== true) return [];
  return answers.children.children.map((c) => {
    const age = ageFromIso(c.dateOfBirth, today);
    return { ...c, age, isMinor: age !== null && age < 18 };
  });
}

export function hasMinorChildren(answers: WillAnswers, today: Date): boolean {
  return childrenWithAges(answers, today).some((c) => c.isMinor);
}

export function totalShareBps(answers: WillAnswers): number {
  return answers.residuary.beneficiaries.reduce((sum, b) => sum + b.shareBps, 0);
}

class Collector {
  errors: Issue[] = [];
  warnings: Issue[] = [];
  error(step: StepId, path: string, code: string, message: string) {
    this.errors.push({ step, path, code, message });
  }
  warn(step: StepId, path: string, code: string, message: string) {
    this.warnings.push({ step, path, code, message });
  }
}

function checkName(
  c: Collector,
  step: StepId,
  path: string,
  value: string,
  label: string,
  required = true,
) {
  if (isBlank(value)) {
    if (required) c.error(step, path, "required", `Enter ${label}.`);
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || !/\p{L}/u.test(trimmed)) {
    c.error(step, path, "invalid_name", `Enter a real name for ${label}.`);
    return;
  }
  checkRenderable(c, step, path, value, label);
}

function checkRenderable(c: Collector, step: StepId, path: string, value: string, label: string) {
  const bad = findUnrenderableChars(value);
  if (bad.length > 0) {
    c.error(
      step,
      path,
      "unsupported_characters",
      `${capitalize(label)} contains characters we can't print yet (${bad.join(" ")}). Please use Latin letters.`,
    );
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function validateAbout(a: WillAnswers, c: Collector, today: Date) {
  const s = "about" as const;
  const about = a.about;
  checkName(c, s, "about.fullLegalName", about.fullLegalName, "your full legal name");
  if (!isBlank(about.fullLegalName) && about.fullLegalName.trim().split(/\s+/).length < 2) {
    c.error(
      s,
      "about.fullLegalName",
      "full_name_required",
      "Enter your full legal name, including first and last name.",
    );
  }

  if (isBlank(about.dateOfBirth)) {
    c.error(s, "about.dateOfBirth", "required", "Enter your date of birth.");
  } else if (!parseIsoDate(about.dateOfBirth)) {
    c.error(s, "about.dateOfBirth", "invalid_date", "Enter a valid date of birth.");
  } else if (isInFuture(about.dateOfBirth, today)) {
    c.error(s, "about.dateOfBirth", "future_date", "Date of birth can't be in the future.");
  } else {
    const age = ageFromIso(about.dateOfBirth, today) ?? 0;
    if (age < MINIMUM_TESTATOR_AGE) {
      c.error(
        s,
        "about.dateOfBirth",
        "underage",
        `You must be at least ${MINIMUM_TESTATOR_AGE} years old to make a will with us.`,
      );
    } else if (age > MAX_TESTATOR_AGE) {
      c.error(s, "about.dateOfBirth", "invalid_date", "Check your date of birth.");
    }
  }

  if (isBlank(about.stateCode)) {
    c.error(s, "about.stateCode", "required", "Choose the state where you live.");
  } else if (!isStateCode(about.stateCode)) {
    c.error(s, "about.stateCode", "invalid_state", "Choose a valid US state or DC.");
  }

  if (isBlank(about.county)) c.error(s, "about.county", "required", "Enter your county.");
  else checkRenderable(c, s, "about.county", about.county, "county");
  if (isBlank(about.addressLine1))
    c.error(s, "about.addressLine1", "required", "Enter your street address.");
  else checkRenderable(c, s, "about.addressLine1", about.addressLine1, "street address");
  if (!isBlank(about.addressLine2))
    checkRenderable(c, s, "about.addressLine2", about.addressLine2, "address line 2");
  if (isBlank(about.city)) c.error(s, "about.city", "required", "Enter your city or town.");
  else checkRenderable(c, s, "about.city", about.city, "city");
  if (isBlank(about.postalCode)) {
    c.error(s, "about.postalCode", "required", "Enter your ZIP code.");
  } else if (!POSTAL_CODE.test(about.postalCode.trim())) {
    c.error(s, "about.postalCode", "invalid_postal_code", "Enter a 5-digit ZIP code.");
  }

  if (about.maritalStatus === "") {
    c.error(s, "about.maritalStatus", "required", "Choose your marital status.");
  }
  if (hasMarriedStatus(a)) {
    checkName(c, s, "about.spouseName", about.spouseName, "your spouse or partner's full name");
    if (sameName(about.spouseName, about.fullLegalName)) {
      c.error(
        s,
        "about.spouseName",
        "same_as_testator",
        "Your spouse's name must be different from yours.",
      );
    }
  }
}

function validateSituation(a: WillAnswers, c: Collector) {
  const s = "situation" as const;
  const sit = a.situation;
  if (sit.estimatedEstateValueCents === null) {
    c.error(
      s,
      "situation.estimatedEstateValueCents",
      "required",
      "Enter a rough estimate of what you own (it's fine to guess).",
    );
  }
  const questions: [keyof typeof sit, string][] = [
    ["ownsBusiness", "whether you own a business"],
    ["specialNeedsBeneficiary", "whether a beneficiary has special needs"],
    ["disinheritSpouse", "whether you intend to leave your spouse out"],
    ["spouseNonUsCitizen", "whether your spouse is a US citizen"],
    ["significantForeignAssets", "whether you own significant assets abroad"],
    ["expectsContest", "whether you expect someone to challenge your will"],
  ];
  for (const [key, label] of questions) {
    if (sit[key] === null) c.error(s, `situation.${key}`, "required", `Tell us ${label}.`);
  }
}

function validateChildren(a: WillAnswers, c: Collector, today: Date) {
  const s = "children" as const;
  const ch = a.children;
  if (ch.hasChildren === null) {
    c.error(s, "children.hasChildren", "required", "Tell us whether you have children.");
    return;
  }
  if (!ch.hasChildren) return;
  if (ch.children.length === 0) {
    c.error(s, "children.children", "required", "Add each of your children, or answer “No”.");
  }
  const seen = new Set<string>();
  ch.children.forEach((child, i) => {
    const base = `children.children.${i}`;
    checkName(c, s, `${base}.fullName`, child.fullName, `child ${i + 1}'s full name`);
    const key = normalizeName(child.fullName);
    if (key && seen.has(key)) {
      c.error(s, `${base}.fullName`, "duplicate", "Each child should be listed only once.");
    }
    seen.add(key);
    if (isBlank(child.dateOfBirth)) {
      c.error(s, `${base}.dateOfBirth`, "required", `Enter child ${i + 1}'s date of birth.`);
    } else if (!parseIsoDate(child.dateOfBirth)) {
      c.error(s, `${base}.dateOfBirth`, "invalid_date", "Enter a valid date of birth.");
    } else if (isInFuture(child.dateOfBirth, today)) {
      c.error(s, `${base}.dateOfBirth`, "future_date", "Date of birth can't be in the future.");
    }
  });
}

function checkPersonRef(
  c: Collector,
  s: StepId,
  path: string,
  person: { fullName: string; relationship: string },
  label: string,
  required: boolean,
) {
  checkName(c, s, `${path}.fullName`, person.fullName, label, required);
  if (!isBlank(person.relationship))
    checkRenderable(c, s, `${path}.relationship`, person.relationship, "relationship");
}

function validateGuardians(a: WillAnswers, c: Collector, today: Date) {
  const s = "guardians" as const;
  const g = a.guardians;
  const minors = hasMinorChildren(a, today);
  const primaryGiven = !isBlank(g.primary.fullName);
  const alternateGiven = !isBlank(g.alternate.fullName);
  if (!minors && !primaryGiven && !alternateGiven) return;

  checkPersonRef(c, s, "guardians.primary", g.primary, "the guardian's full name", minors);
  if (alternateGiven) {
    checkPersonRef(c, s, "guardians.alternate", g.alternate, "the alternate guardian", false);
    if (sameName(g.alternate.fullName, g.primary.fullName)) {
      c.error(
        s,
        "guardians.alternate.fullName",
        "alternate_same_as_primary",
        "The alternate guardian must be a different person from the guardian.",
      );
    }
  } else if (minors) {
    c.warn(
      s,
      "guardians.alternate.fullName",
      "alternate_recommended",
      "We recommend naming an alternate guardian in case your first choice can't serve.",
    );
  }
  for (const [role, person] of [
    ["guardian", g.primary],
    ["alternate guardian", g.alternate],
  ] as const) {
    if (sameName(person.fullName, a.about.fullLegalName)) {
      c.error(
        s,
        `guardians.${role === "guardian" ? "primary" : "alternate"}.fullName`,
        "self_appointment",
        `You can't name yourself as the ${role}.`,
      );
    }
  }
}

function validateExecutor(a: WillAnswers, c: Collector) {
  const s = "executor" as const;
  const e = a.executor;
  checkPersonRef(c, s, "executor.primary", e.primary, "your executor's full name", true);
  if (sameName(e.primary.fullName, a.about.fullLegalName)) {
    c.error(s, "executor.primary.fullName", "self_appointment", "You can't be your own executor.");
  }
  if (!isBlank(e.alternate.fullName)) {
    checkPersonRef(c, s, "executor.alternate", e.alternate, "the alternate executor", false);
    if (sameName(e.alternate.fullName, e.primary.fullName)) {
      c.error(
        s,
        "executor.alternate.fullName",
        "alternate_same_as_primary",
        "The alternate executor must be a different person from the executor.",
      );
    }
    if (sameName(e.alternate.fullName, a.about.fullLegalName)) {
      c.error(
        s,
        "executor.alternate.fullName",
        "self_appointment",
        "You can't be your own alternate executor.",
      );
    }
  } else {
    c.warn(
      s,
      "executor.alternate.fullName",
      "alternate_recommended",
      "We recommend naming an alternate executor in case your first choice can't serve.",
    );
  }
}

function validateResiduary(a: WillAnswers, c: Collector) {
  const s = "beneficiaries" as const;
  const r = a.residuary;
  if (r.beneficiaries.length === 0) {
    c.error(
      s,
      "residuary.beneficiaries",
      "required",
      "Add at least one beneficiary for the rest of your estate.",
    );
  }
  const seen = new Set<string>();
  r.beneficiaries.forEach((b, i) => {
    const base = `residuary.beneficiaries.${i}`;
    const label = b.kind === "charity" ? `the charity's name` : `beneficiary ${i + 1}'s full name`;
    checkName(c, s, `${base}.name`, b.name, label);
    if (!isBlank(b.relationship))
      checkRenderable(c, s, `${base}.relationship`, b.relationship, "relationship");
    const key = normalizeName(b.name);
    if (key && seen.has(key)) {
      c.error(
        s,
        `${base}.name`,
        "duplicate",
        "Each beneficiary should appear only once — combine their shares.",
      );
    }
    seen.add(key);
    if (sameName(b.name, a.about.fullLegalName)) {
      c.error(s, `${base}.name`, "self_beneficiary", "You can't leave your estate to yourself.");
    }
    if (!Number.isInteger(b.shareBps) || b.shareBps <= 0) {
      c.error(s, `${base}.shareBps`, "invalid_share", "Each share must be more than 0%.");
    }
  });
  const total = totalShareBps(a);
  if (r.beneficiaries.length > 0 && total !== 10_000) {
    c.error(
      s,
      "residuary.total",
      "shares_not_100",
      `Shares must add up to exactly 100% (they currently add up to ${(total / 100).toFixed(2).replace(/\.00$/, "")}%).`,
    );
  }
  if (r.contingency === "") {
    c.error(
      s,
      "residuary.contingency",
      "required",
      "Choose what happens if a beneficiary dies before you.",
    );
  }
  if (
    hasMarriedStatus(a) &&
    a.situation.disinheritSpouse !== true &&
    r.beneficiaries.length > 0 &&
    !r.beneficiaries.some((b) => sameName(b.name, a.about.spouseName))
  ) {
    c.warn(
      s,
      "residuary.beneficiaries",
      "spouse_not_beneficiary",
      "Your spouse isn't a beneficiary. In many states a surviving spouse can claim part of the estate anyway — consider speaking to an attorney.",
    );
  }
}

function validateGifts(a: WillAnswers, c: Collector) {
  const s = "gifts" as const;
  a.gifts.gifts.forEach((g, i) => {
    const base = `gifts.gifts.${i}`;
    if (isBlank(g.description)) {
      c.error(s, `${base}.description`, "required", `Describe gift ${i + 1}.`);
    } else {
      checkRenderable(c, s, `${base}.description`, g.description, "gift description");
    }
    checkName(c, s, `${base}.recipientName`, g.recipientName, `who receives gift ${i + 1}`);
    if (!isBlank(g.alternateRecipientName)) {
      checkName(
        c,
        s,
        `${base}.alternateRecipientName`,
        g.alternateRecipientName,
        "the alternate recipient",
        false,
      );
      if (sameName(g.alternateRecipientName, g.recipientName)) {
        c.error(
          s,
          `${base}.alternateRecipientName`,
          "alternate_same_as_primary",
          "The alternate recipient must be different from the recipient.",
        );
      }
    }
    if (sameName(g.recipientName, a.about.fullLegalName)) {
      c.error(
        s,
        `${base}.recipientName`,
        "self_beneficiary",
        "You can't leave a gift to yourself.",
      );
    }
  });
}

function validateMinors(a: WillAnswers, c: Collector, today: Date) {
  const s = "minors" as const;
  const m = a.minors;
  if (m.useCustodian === null) {
    c.error(
      s,
      "minors.useCustodian",
      "required",
      "Tell us whether property for young beneficiaries should be held by a custodian.",
    );
    return;
  }
  if (!m.useCustodian) {
    if (hasMinorChildren(a, today)) {
      c.warn(
        s,
        "minors.useCustodian",
        "custodian_recommended",
        "You have minor children. Without a custodian, a court may need to appoint someone to manage what they inherit.",
      );
    }
    return;
  }
  if (
    !Number.isInteger(m.custodianAge) ||
    m.custodianAge < CUSTODIAN_AGE_MIN ||
    m.custodianAge > CUSTODIAN_AGE_MAX
  ) {
    c.error(
      s,
      "minors.custodianAge",
      "invalid_age",
      `Choose an age between ${CUSTODIAN_AGE_MIN} and ${CUSTODIAN_AGE_MAX}.`,
    );
  }
  checkName(c, s, "minors.custodianName", m.custodianName, "the custodian's full name");
  if (!isBlank(m.alternateCustodianName)) {
    checkName(
      c,
      s,
      "minors.alternateCustodianName",
      m.alternateCustodianName,
      "the alternate custodian",
      false,
    );
    if (sameName(m.alternateCustodianName, m.custodianName)) {
      c.error(
        s,
        "minors.alternateCustodianName",
        "alternate_same_as_primary",
        "The alternate custodian must be a different person from the custodian.",
      );
    }
  }
  if (sameName(m.custodianName, a.about.fullLegalName)) {
    c.error(s, "minors.custodianName", "self_appointment", "You can't name yourself as custodian.");
  }
}

function validateWishes(a: WillAnswers, c: Collector) {
  const s = "wishes" as const;
  const w = a.wishes;
  if (w.funeralPreference === "other" && isBlank(w.funeralNotes)) {
    c.error(s, "wishes.funeralNotes", "required", "Describe your funeral or burial preference.");
  }
  if (!isBlank(w.funeralNotes))
    checkRenderable(c, s, "wishes.funeralNotes", w.funeralNotes, "funeral notes");
  if (w.hasPets) {
    checkName(c, s, "wishes.petCaretakerName", w.petCaretakerName, "who will care for your pets");
    if (!isBlank(w.petNotes)) checkRenderable(c, s, "wishes.petNotes", w.petNotes, "pet notes");
  }
  if (!isBlank(w.digitalAssetsInstructions)) {
    checkRenderable(
      c,
      s,
      "wishes.digitalAssetsInstructions",
      w.digitalAssetsInstructions,
      "digital asset instructions",
    );
  }
}

/** Validates every step and returns all errors and warnings. */
export function validateAnswers(answers: WillAnswers, opts: ValidationOptions): ValidationResult {
  const c = new Collector();
  validateAbout(answers, c, opts.today);
  validateSituation(answers, c);
  validateChildren(answers, c, opts.today);
  validateGuardians(answers, c, opts.today);
  validateExecutor(answers, c);
  validateResiduary(answers, c);
  validateGifts(answers, c);
  validateMinors(answers, c, opts.today);
  validateWishes(answers, c);
  return { errors: c.errors, warnings: c.warnings };
}

/** Validates a single step (the review step validates everything). */
export function validateStep(
  step: StepId,
  answers: WillAnswers,
  opts: ValidationOptions,
): ValidationResult {
  const all = validateAnswers(answers, opts);
  if (step === "review") return all;
  return {
    errors: all.errors.filter((i) => i.step === step),
    warnings: all.warnings.filter((i) => i.step === step),
  };
}

/** Steps (excluding review) that currently have no blocking errors. */
export function completedSteps(answers: WillAnswers, opts: ValidationOptions): StepId[] {
  const { errors } = validateAnswers(answers, opts);
  const failing = new Set(errors.map((e) => e.step));
  return STEP_IDS.filter((s) => s !== "review" && !failing.has(s));
}

/** Maps issues to a `{ path: message }` record for form display (first message wins). */
export function issuesByPath(issues: readonly Issue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (!(issue.path in out)) out[issue.path] = issue.message;
  }
  return out;
}
