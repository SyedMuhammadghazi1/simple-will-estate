import { FEDERAL_ESTATE_TAX_EXEMPTION } from "../config";
import { formatCents } from "../pricing";
import { getStateRule, isStateCode } from "../states";
import type { WillAnswers } from "./answers";
import { hasMarriedStatus } from "./validation";

/**
 * Complexity / eligibility screening.
 *
 * A simple will is the wrong tool for some situations. This pure function flags them:
 *  - "block": we will not sell a will for this situation (checkout is refused).
 *  - "warn":  we strongly recommend a licensed estate attorney; the customer must explicitly
 *             acknowledge the warning before paying.
 * Severity per rule is configurable so counsel can tighten it (e.g. make a warning blocking).
 */

export type ScreeningSeverity = "block" | "warn";

export const SCREENING_CODES = [
  "unsupported_state",
  "estate_tax",
  "business_ownership",
  "special_needs_beneficiary",
  "disinherit_spouse",
  "non_citizen_spouse",
  "foreign_assets",
  "expected_contest",
] as const;
export type ScreeningCode = (typeof SCREENING_CODES)[number];

export const SCREENING_SEVERITY: Readonly<Record<ScreeningCode, ScreeningSeverity>> = {
  unsupported_state: "block",
  estate_tax: "warn",
  business_ownership: "warn",
  special_needs_beneficiary: "warn",
  disinherit_spouse: "warn",
  non_citizen_spouse: "warn",
  foreign_assets: "warn",
  expected_contest: "warn",
};

export interface ScreeningFinding {
  code: ScreeningCode;
  severity: ScreeningSeverity;
  title: string;
  message: string;
  recommendation: string;
}

export type ScreeningOutcome = "eligible" | "eligible_with_warnings" | "blocked";

export interface ScreeningResult {
  outcome: ScreeningOutcome;
  findings: ScreeningFinding[];
  /** Codes the customer must acknowledge before checkout. */
  acknowledgementRequired: ScreeningCode[];
}

export interface ScreeningOptions {
  estateTaxExemptionCents?: number;
  severity?: Partial<Record<ScreeningCode, ScreeningSeverity>>;
}

const ATTORNEY = "We recommend speaking with a licensed estate-planning attorney in your state.";

export function screenAnswers(answers: WillAnswers, opts: ScreeningOptions = {}): ScreeningResult {
  const exemption = opts.estateTaxExemptionCents ?? FEDERAL_ESTATE_TAX_EXEMPTION.amountCents;
  const severityOf = (code: ScreeningCode) => opts.severity?.[code] ?? SCREENING_SEVERITY[code];
  const findings: ScreeningFinding[] = [];
  const add = (code: ScreeningCode, title: string, message: string, recommendation = ATTORNEY) =>
    findings.push({ code, severity: severityOf(code), title, message, recommendation });

  const { about, situation } = answers;

  if (isStateCode(about.stateCode) && !getStateRule(about.stateCode).supported) {
    const rule = getStateRule(about.stateCode);
    add(
      "unsupported_state",
      `We can't prepare wills for ${rule.name} residents`,
      `${rule.name} follows a civil-law system with different will formalities (such as a notarial testament). Our documents are not designed for it.`,
      `Please contact a licensed ${rule.name} attorney. You will not be charged.`,
    );
  }

  if (
    situation.estimatedEstateValueCents !== null &&
    situation.estimatedEstateValueCents > exemption
  ) {
    add(
      "estate_tax",
      "Your estate may owe federal estate tax",
      `You estimated your estate above ${formatCents(exemption)}, the federal estate-tax exemption we use for ${FEDERAL_ESTATE_TAX_EXEMPTION.year}. Estates this size usually need tax planning (for example trusts) that a simple will does not provide.`,
    );
  }

  if (situation.ownsBusiness === true) {
    add(
      "business_ownership",
      "You own a business",
      "Business interests often need succession planning, buy-sell agreements or specific transfer language that a simple will does not cover.",
    );
  }

  if (situation.specialNeedsBeneficiary === true) {
    add(
      "special_needs_beneficiary",
      "A beneficiary receives means-tested benefits",
      "Leaving property directly to someone who receives SSI, Medicaid or similar benefits can make them lose those benefits. A special-needs (supplemental needs) trust is usually needed, and this service does not create one.",
    );
  }

  if (situation.disinheritSpouse === true) {
    add(
      "disinherit_spouse",
      "You intend to leave out your spouse",
      "Most states give a surviving spouse a right to claim part of the estate (an elective or community-property share) regardless of the will. Disinheriting a spouse usually needs legal advice and sometimes a signed agreement.",
    );
  }

  if (situation.spouseNonUsCitizen === true && hasMarriedStatus(answers)) {
    add(
      "non_citizen_spouse",
      "Your spouse is not a US citizen",
      "The unlimited marital deduction generally does not apply to non-citizen spouses; larger estates may need a qualified domestic trust (QDOT).",
    );
  }

  if (situation.significantForeignAssets === true) {
    add(
      "foreign_assets",
      "You own significant assets outside the US",
      "Property abroad may be governed by that country's inheritance rules and may need a separate will there.",
    );
  }

  if (situation.expectsContest === true) {
    add(
      "expected_contest",
      "You expect your will to be challenged",
      "If someone is likely to contest your will, an attorney-supervised signing and supporting evidence of capacity can make a big difference.",
    );
  }

  const blocked = findings.some((f) => f.severity === "block");
  const outcome: ScreeningOutcome = blocked
    ? "blocked"
    : findings.length > 0
      ? "eligible_with_warnings"
      : "eligible";

  return {
    outcome,
    findings,
    acknowledgementRequired: findings.filter((f) => f.severity === "warn").map((f) => f.code),
  };
}

/** True when every warning that needs acknowledgement has been acknowledged. */
export function warningsAcknowledged(
  result: ScreeningResult,
  acknowledged: readonly string[],
): boolean {
  return result.acknowledgementRequired.every((code) => acknowledged.includes(code));
}
