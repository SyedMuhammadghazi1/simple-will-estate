import { formatLongDate } from "../dates";
import { formatCents } from "../pricing";
import { getStateRule, isStateCode } from "../states";
import { FUNERAL_LABELS, MARITAL_STATUS_LABELS, bpsToPercent, type WillAnswers } from "./answers";
import type { StepId } from "./steps";
import { isBlank, joinWithAnd } from "./text";
import { childrenWithAges, hasMarriedStatus } from "./validation";

export interface SummarySection {
  step: StepId;
  title: string;
  sentences: string[];
}

const orNotAnswered = (v: string) => (isBlank(v) ? "(not answered yet)" : v.trim());

/** Plain-English summary of a will draft, used on the review page. */
export function summarizeAnswers(answers: WillAnswers, today: Date): SummarySection[] {
  const { about, children, guardians, executor, residuary, gifts, minors, wishes, situation } =
    answers;
  const stateName = isStateCode(about.stateCode) ? getStateRule(about.stateCode).name : "";
  const sections: SummarySection[] = [];

  const aboutSentences = [
    `You are ${orNotAnswered(about.fullLegalName)}, born ${formatLongDate(about.dateOfBirth) || "(date of birth missing)"}.`,
    `You live at ${[about.addressLine1, about.addressLine2, about.city].filter((p) => !isBlank(p)).join(", ") || "(address missing)"}, ${about.county ? `${about.county} County, ` : ""}${stateName || "(state missing)"} ${about.postalCode}.`.replace(
      /\s+\./,
      ".",
    ),
  ];
  if (about.maritalStatus) {
    aboutSentences.push(
      hasMarriedStatus(answers)
        ? `You are ${MARITAL_STATUS_LABELS[about.maritalStatus].toLowerCase()} to ${orNotAnswered(about.spouseName)}.`
        : `Your marital status is: ${MARITAL_STATUS_LABELS[about.maritalStatus].toLowerCase()}.`,
    );
  }
  sections.push({ step: "about", title: "About you", sentences: aboutSentences });

  const sit: string[] = [];
  if (situation.estimatedEstateValueCents !== null) {
    sit.push(
      `You estimate everything you own is worth about ${formatCents(situation.estimatedEstateValueCents)}.`,
    );
  }
  sections.push({
    step: "situation",
    title: "Your situation",
    sentences: sit.length ? sit : ["Not answered yet."],
  });

  const kids = childrenWithAges(answers, today);
  const childSentences: string[] = [];
  if (children.hasChildren === false) childSentences.push("You have no children.");
  else if (kids.length > 0) {
    childSentences.push(
      `Your children are ${joinWithAnd(
        kids.map((k) => `${orNotAnswered(k.fullName)}${k.age !== null ? ` (age ${k.age})` : ""}`),
      )}.`,
    );
    childSentences.push(
      children.includeFutureChildren
        ? "Children born or adopted after you sign will be treated the same as the children listed."
        : "Children born or adopted after you sign are NOT automatically included.",
    );
  } else childSentences.push("Not answered yet.");
  sections.push({ step: "children", title: "Children", sentences: childSentences });

  const guardianSentences: string[] = [];
  if (!isBlank(guardians.primary.fullName)) {
    guardianSentences.push(
      `If your children are under 18 and no parent can care for them, ${guardians.primary.fullName.trim()} will be their guardian.`,
    );
    if (!isBlank(guardians.alternate.fullName)) {
      guardianSentences.push(
        `If ${guardians.primary.fullName.trim()} can't, ${guardians.alternate.fullName.trim()} will be.`,
      );
    }
  } else guardianSentences.push("You haven't named a guardian.");
  sections.push({ step: "guardians", title: "Guardians", sentences: guardianSentences });

  const execSentences = [
    `${orNotAnswered(executor.primary.fullName)} will be your executor${isBlank(executor.alternate.fullName) ? "" : `, with ${executor.alternate.fullName.trim()} as the alternate`}.`,
    executor.waiveBond
      ? "Your executor won't need to buy a bond (insurance) to serve, where the law allows."
      : "Your executor will need to post a bond if the court requires one.",
  ];
  sections.push({ step: "executor", title: "Executor", sentences: execSentences });

  const resSentences: string[] = [];
  if (residuary.beneficiaries.length > 0) {
    resSentences.push(
      `Everything not given as a specific gift goes to ${joinWithAnd(
        residuary.beneficiaries.map(
          (b) => `${orNotAnswered(b.name)} (${bpsToPercent(b.shareBps)}%)`,
        ),
      )}.`,
    );
  } else resSentences.push("You haven't added any beneficiaries yet.");
  if (residuary.contingency === "per_stirpes") {
    resSentences.push(
      "If a beneficiary dies before you, their share goes to their own children and descendants (per stirpes).",
    );
  } else if (residuary.contingency === "surviving_beneficiaries") {
    resSentences.push(
      "If a beneficiary dies before you, their share is divided among the other beneficiaries.",
    );
  }
  sections.push({ step: "beneficiaries", title: "Beneficiaries", sentences: resSentences });

  sections.push({
    step: "gifts",
    title: "Specific gifts",
    sentences:
      gifts.gifts.length === 0
        ? ["You aren't leaving any specific gifts."]
        : gifts.gifts.map(
            (g) =>
              `${orNotAnswered(g.description)} goes to ${orNotAnswered(g.recipientName)}${isBlank(g.alternateRecipientName) ? "" : ` (or ${g.alternateRecipientName.trim()} if they die before you)`}.`,
          ),
  });

  sections.push({
    step: "minors",
    title: "Young beneficiaries",
    sentences:
      minors.useCustodian === true
        ? [
            `Anything left to someone under ${minors.custodianAge} will be managed by ${orNotAnswered(minors.custodianName)} as custodian until they reach ${minors.custodianAge}${isBlank(minors.alternateCustodianName) ? "" : `, with ${minors.alternateCustodianName.trim()} as the alternate`}.`,
          ]
        : minors.useCustodian === false
          ? ["You chose not to appoint a custodian for young beneficiaries."]
          : ["Not answered yet."],
  });

  const wishSentences: string[] = [];
  if (wishes.funeralPreference) {
    wishSentences.push(
      `Funeral preference (not legally binding): ${FUNERAL_LABELS[wishes.funeralPreference].toLowerCase()}${isBlank(wishes.funeralNotes) ? "" : ` — ${wishes.funeralNotes.trim()}`}.`,
    );
  }
  if (wishes.hasPets)
    wishSentences.push(`${orNotAnswered(wishes.petCaretakerName)} will care for your pets.`);
  if (!isBlank(wishes.digitalAssetsInstructions)) {
    wishSentences.push("You've left instructions for your digital accounts.");
  }
  sections.push({
    step: "wishes",
    title: "Other wishes",
    sentences: wishSentences.length ? wishSentences : ["No other wishes recorded."],
  });

  return sections;
}
