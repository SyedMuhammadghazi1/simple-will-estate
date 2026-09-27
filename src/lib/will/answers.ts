import { z } from "zod";

/**
 * Questionnaire answers ("draft") schema.
 *
 * This schema is intentionally LENIENT: it only enforces types and maximum lengths so that a
 * partially completed draft can be autosaved at any time. Business validation (required fields,
 * shares totalling 100%, ages, …) lives in `validation.ts` and runs per step and before checkout.
 */

export const MARITAL_STATUSES = [
  "single",
  "married",
  "domestic_partnership",
  "divorced",
  "widowed",
  "separated",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: "Single, never married",
  married: "Married",
  domestic_partnership: "Registered domestic partnership / civil union",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Legally separated",
};

export const CONTINGENCY_RULES = ["per_stirpes", "surviving_beneficiaries"] as const;
export type ContingencyRule = (typeof CONTINGENCY_RULES)[number];

export const FUNERAL_PREFERENCES = [
  "burial",
  "cremation",
  "donation",
  "no_preference",
  "other",
] as const;
export type FuneralPreference = (typeof FUNERAL_PREFERENCES)[number];

export const FUNERAL_LABELS: Record<FuneralPreference, string> = {
  burial: "Burial",
  cremation: "Cremation",
  donation: "Donation of my body to science",
  no_preference: "No preference",
  other: "Other (described below)",
};

const text = (max: number) => z.string().max(max).default("");
const idSchema = z.string().min(1).max(64);
const yesNo = z.boolean().nullable().default(null);
const enumOrEmpty = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("")]).default("");

export const personRefSchema = z.object({
  fullName: text(200),
  relationship: text(100),
});
export type PersonRef = z.infer<typeof personRefSchema>;

export const aboutSchema = z.object({
  fullLegalName: text(200),
  dateOfBirth: text(10),
  stateCode: text(2),
  county: text(100),
  addressLine1: text(200),
  addressLine2: text(200),
  city: text(100),
  postalCode: text(10),
  maritalStatus: enumOrEmpty(MARITAL_STATUSES),
  spouseName: text(200),
});

export const situationSchema = z.object({
  /** Rough estimate of everything owned (after debts), in cents. */
  estimatedEstateValueCents: z.number().int().min(0).max(1e15).nullable().default(null),
  ownsBusiness: yesNo,
  specialNeedsBeneficiary: yesNo,
  disinheritSpouse: yesNo,
  spouseNonUsCitizen: yesNo,
  significantForeignAssets: yesNo,
  expectsContest: yesNo,
});

export const childSchema = z.object({
  id: idSchema,
  fullName: text(200),
  dateOfBirth: text(10),
});
export type Child = z.infer<typeof childSchema>;

export const childrenSchema = z.object({
  hasChildren: yesNo,
  children: z.array(childSchema).max(20).default([]),
  includeFutureChildren: z.boolean().default(true),
});

export const guardiansSchema = z.object({
  primary: personRefSchema.prefault({}),
  alternate: personRefSchema.prefault({}),
});

export const executorSchema = z.object({
  primary: personRefSchema.prefault({}),
  alternate: personRefSchema.prefault({}),
  waiveBond: z.boolean().default(true),
});

export const beneficiarySchema = z.object({
  id: idSchema,
  kind: z.enum(["person", "charity"]).default("person"),
  name: text(200),
  relationship: text(100),
  /** Share of the residuary estate in basis points (10000 = 100%). */
  shareBps: z.number().int().min(0).max(10_000).default(0),
});
export type Beneficiary = z.infer<typeof beneficiarySchema>;

export const residuarySchema = z.object({
  beneficiaries: z.array(beneficiarySchema).max(30).default([]),
  contingency: enumOrEmpty(CONTINGENCY_RULES),
});

export const giftSchema = z.object({
  id: idSchema,
  description: text(500),
  recipientName: text(200),
  alternateRecipientName: text(200),
});
export type Gift = z.infer<typeof giftSchema>;

export const giftsSchema = z.object({
  gifts: z.array(giftSchema).max(50).default([]),
});

export const minorsSchema = z.object({
  useCustodian: yesNo,
  custodianAge: z.number().int().min(0).max(120).default(21),
  custodianName: text(200),
  alternateCustodianName: text(200),
});

export const wishesSchema = z.object({
  funeralPreference: enumOrEmpty(FUNERAL_PREFERENCES),
  funeralNotes: text(2000),
  hasPets: z.boolean().default(false),
  petCaretakerName: text(200),
  petNotes: text(1000),
  digitalAssetsInstructions: text(2000),
});

export const willAnswersSchema = z.object({
  about: aboutSchema.prefault({}),
  situation: situationSchema.prefault({}),
  children: childrenSchema.prefault({}),
  guardians: guardiansSchema.prefault({}),
  executor: executorSchema.prefault({}),
  residuary: residuarySchema.prefault({}),
  gifts: giftsSchema.prefault({}),
  minors: minorsSchema.prefault({}),
  wishes: wishesSchema.prefault({}),
});

export type WillAnswers = z.infer<typeof willAnswersSchema>;
export type WillSectionKey = keyof WillAnswers;

export const SECTION_SCHEMAS = {
  about: aboutSchema,
  situation: situationSchema,
  children: childrenSchema,
  guardians: guardiansSchema,
  executor: executorSchema,
  residuary: residuarySchema,
  gifts: giftsSchema,
  minors: minorsSchema,
  wishes: wishesSchema,
} as const satisfies Record<WillSectionKey, z.ZodType>;

export function emptyAnswers(): WillAnswers {
  return willAnswersSchema.parse({});
}

/** Parses stored/unknown data into a complete answers object (missing parts get defaults). */
export function parseAnswers(input: unknown): WillAnswers {
  return willAnswersSchema.parse(input ?? {});
}

export function parseSection<K extends WillSectionKey>(key: K, input: unknown): WillAnswers[K] {
  return SECTION_SCHEMAS[key].parse(input ?? {}) as WillAnswers[K];
}

export function isWillSectionKey(value: unknown): value is WillSectionKey {
  return typeof value === "string" && value in SECTION_SCHEMAS;
}

/** Percent string (e.g. "33.33") → basis points. Returns null for invalid input. */
export function percentToBps(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (bps > 10_000) return null;
  return bps;
}

export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}
