import type { WillSectionKey } from "./answers";

export const STEP_IDS = [
  "about",
  "situation",
  "children",
  "guardians",
  "executor",
  "beneficiaries",
  "gifts",
  "minors",
  "wishes",
  "review",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export interface StepDefinition {
  id: StepId;
  title: string;
  shortTitle: string;
  /** Section of the answers object edited by this step (review edits nothing). */
  section: WillSectionKey | null;
  description: string;
}

export const STEPS: readonly StepDefinition[] = [
  {
    id: "about",
    title: "About you",
    shortTitle: "You",
    section: "about",
    description: "Your legal name, date of birth, where you live and your marital status.",
  },
  {
    id: "situation",
    title: "Your situation",
    shortTitle: "Situation",
    section: "situation",
    description:
      "A few questions that tell us whether a simple will fits your circumstances, or whether you should speak with an estate attorney.",
  },
  {
    id: "children",
    title: "Children",
    shortTitle: "Children",
    section: "children",
    description: "Your children, including adopted children.",
  },
  {
    id: "guardians",
    title: "Guardian for minor children",
    shortTitle: "Guardians",
    section: "guardians",
    description: "Who would care for your children under 18 if no parent can.",
  },
  {
    id: "executor",
    title: "Executor",
    shortTitle: "Executor",
    section: "executor",
    description: "The person who will carry out your will (also called a personal representative).",
  },
  {
    id: "beneficiaries",
    title: "Beneficiaries & residuary estate",
    shortTitle: "Beneficiaries",
    section: "residuary",
    description: "Who receives everything not given away as a specific gift, and in what shares.",
  },
  {
    id: "gifts",
    title: "Specific gifts",
    shortTitle: "Gifts",
    section: "gifts",
    description: "Particular items or amounts you want to leave to particular people.",
  },
  {
    id: "minors",
    title: "Young beneficiaries",
    shortTitle: "Young ones",
    section: "minors",
    description: "How property for beneficiaries under 18 (or a later age you choose) is managed.",
  },
  {
    id: "wishes",
    title: "Other wishes",
    shortTitle: "Wishes",
    section: "wishes",
    description: "Funeral preferences, pets and digital accounts.",
  },
  {
    id: "review",
    title: "Review",
    shortTitle: "Review",
    section: null,
    description: "Check everything in plain English before you continue.",
  },
];

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_IDS as readonly string[]).includes(value);
}

export function getStep(id: StepId): StepDefinition {
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step ${id}`);
  return step;
}

export function stepIndex(id: StepId): number {
  return STEP_IDS.indexOf(id);
}

export function nextStep(id: StepId): StepId | null {
  const i = stepIndex(id);
  return i >= 0 && i < STEP_IDS.length - 1 ? (STEP_IDS[i + 1] ?? null) : null;
}

export function previousStep(id: StepId): StepId | null {
  const i = stepIndex(id);
  return i > 0 ? (STEP_IDS[i - 1] ?? null) : null;
}

export function sectionStep(section: WillSectionKey): StepId {
  const step = STEPS.find((s) => s.section === section);
  if (!step) throw new Error(`No step for section ${section}`);
  return step.id;
}

/** Percentage of the wizard completed, based on steps whose validation passes. */
export function progressPercent(completedSteps: readonly StepId[]): number {
  const countable = STEP_IDS.filter((s) => s !== "review");
  const done = countable.filter((s) => completedSteps.includes(s)).length;
  return Math.round((done / countable.length) * 100);
}
