/**
 * State rules data for all 50 US states + DC.
 *
 * !!! HONESTY NOTICE !!!
 * These values are best-effort DEFAULTS compiled without legal review. They are NOT verified
 * legal facts. Every entry is marked `legalReviewStatus: "unreviewed"` and `lastReviewedAt: null`
 * until a licensed attorney in that jurisdiction verifies it (see docs/LAUNCH_CHECKLIST.md).
 * The application logs a startup warning listing unreviewed states and the admin console shows
 * the review status. When an attorney verifies a state, update the entry, set
 * `legalReviewStatus: "reviewed"`, `lastReviewedAt` (ISO date) and `reviewedBy`.
 *
 * Defaults: 2 witnesses everywhere; Louisiana is unsupported (civil-law notarial testament).
 */

export const STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
] as const; // prettier-ignore

export type StateCode = (typeof STATE_CODES)[number];

export type LegalReviewStatus = "unreviewed" | "reviewed";

export interface StateRule {
  code: StateCode;
  name: string;
  /** Whether the product can produce a will for residents of this jurisdiction. */
  supported: boolean;
  /** Number of attesting witnesses the document and instructions are sized for. */
  witnessesRequired: number;
  /** Whether a self-proving affidavit page is generated. */
  selfProvingAffidavitAvailable: boolean;
  /** Whether the self-proving affidavit needs a notary block. */
  affidavitRequiresNotary: boolean;
  /** Whether a lifetime deposit of the original will with a court/registrar is offered. */
  courtDepositOffered: boolean;
  /** Human description of where deposits go, when offered. */
  depositAuthority: string | null;
  notes: string[];
  legalReviewStatus: LegalReviewStatus;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
}

const DEFAULT_WITNESSES = 2;

type Overrides = Partial<Omit<StateRule, "code" | "name">>;

const UPC_DEPOSIT_NOTE =
  "Lifetime deposit with the court is believed to be available (Uniform Probate Code §2-515-style " +
  "statute). Procedure and fees vary by county — confirm with the court before offering.";

const NO_AFFIDAVIT_NOTE =
  "No separate notarized self-proving affidavit is generated for this jurisdiction by default " +
  "(the attestation clause is believed to serve that purpose). Verify with counsel.";

function rule(code: StateCode, name: string, overrides: Overrides = {}): StateRule {
  return {
    code,
    name,
    supported: true,
    witnessesRequired: DEFAULT_WITNESSES,
    selfProvingAffidavitAvailable: true,
    affidavitRequiresNotary: true,
    courtDepositOffered: false,
    depositAuthority: null,
    notes: [],
    legalReviewStatus: "unreviewed",
    lastReviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

const deposit = (authority: string, note = UPC_DEPOSIT_NOTE): Overrides => ({
  courtDepositOffered: true,
  depositAuthority: authority,
  notes: [note],
});

export const STATE_RULES: Readonly<Record<StateCode, StateRule>> = {
  AL: rule("AL", "Alabama"),
  AK: rule("AK", "Alaska", deposit("Alaska Superior Court (probate)")),
  AZ: rule("AZ", "Arizona", deposit("Arizona Superior Court clerk (probate)")),
  AR: rule("AR", "Arkansas"),
  CA: rule("CA", "California", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    notes: [NO_AFFIDAVIT_NOTE],
  }),
  CO: rule("CO", "Colorado", deposit("Colorado district court (probate)")),
  CT: rule("CT", "Connecticut", deposit("Connecticut probate court")),
  DE: rule("DE", "Delaware", deposit("County Register of Wills")),
  DC: rule("DC", "District of Columbia", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    notes: [NO_AFFIDAVIT_NOTE],
  }),
  FL: rule("FL", "Florida", {
    notes: [
      "Florida has specific requirements for remote/electronic wills and deposit with the clerk " +
        "after death only. Verify with counsel.",
    ],
  }),
  GA: rule("GA", "Georgia", deposit("County probate court")),
  HI: rule("HI", "Hawaii"),
  ID: rule("ID", "Idaho"),
  IL: rule("IL", "Illinois", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    notes: [NO_AFFIDAVIT_NOTE],
  }),
  IN: rule("IN", "Indiana", {
    notes: [
      "A self-proving clause may be executable under penalties of perjury without a notary. " +
        "A notary block is included by default — verify whether it is necessary.",
    ],
  }),
  IA: rule("IA", "Iowa"),
  KS: rule("KS", "Kansas", deposit("Kansas district court")),
  KY: rule("KY", "Kentucky", deposit("County district court clerk")),
  LA: rule("LA", "Louisiana", {
    supported: false,
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    notes: [
      "UNSUPPORTED: Louisiana is a civil-law jurisdiction that uses a notarial testament with " +
        "different formalities (and forced heirship rules). Refer customers to a Louisiana attorney.",
    ],
  }),
  ME: rule("ME", "Maine", deposit("County probate court")),
  MD: rule("MD", "Maryland", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    ...deposit("County Register of Wills"),
    notes: [NO_AFFIDAVIT_NOTE, "Registers of Wills are believed to accept wills for safekeeping."],
  }),
  MA: rule("MA", "Massachusetts"),
  MI: rule("MI", "Michigan", deposit("County probate court")),
  MN: rule("MN", "Minnesota", deposit("County court administrator (probate)")),
  MS: rule("MS", "Mississippi"),
  MO: rule("MO", "Missouri"),
  MT: rule("MT", "Montana", deposit("Montana district court clerk")),
  NE: rule("NE", "Nebraska", deposit("Nebraska county court")),
  NV: rule("NV", "Nevada"),
  NH: rule("NH", "New Hampshire"),
  NJ: rule("NJ", "New Jersey"),
  NM: rule("NM", "New Mexico"),
  NY: rule("NY", "New York", {
    ...deposit(
      "County Surrogate's Court",
      "Surrogate's Courts are believed to accept lifetime deposit of wills; confirm fees/procedure.",
    ),
  }),
  NC: rule("NC", "North Carolina", deposit("Clerk of Superior Court")),
  ND: rule("ND", "North Dakota", deposit("North Dakota district court")),
  OH: rule("OH", "Ohio", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    ...deposit(
      "County probate court",
      "Ohio probate courts are believed to accept wills for deposit during the testator's lifetime.",
    ),
    notes: [
      NO_AFFIDAVIT_NOTE,
      "Ohio probate courts are believed to accept wills for deposit during the testator's lifetime.",
    ],
  }),
  OK: rule("OK", "Oklahoma"),
  OR: rule("OR", "Oregon"),
  PA: rule("PA", "Pennsylvania"),
  RI: rule("RI", "Rhode Island"),
  SC: rule("SC", "South Carolina"),
  SD: rule("SD", "South Dakota"),
  TN: rule("TN", "Tennessee"),
  TX: rule("TX", "Texas", deposit("County clerk", "Texas county clerks are believed to accept wills for deposit; confirm fee.")), // prettier-ignore
  UT: rule("UT", "Utah", deposit("Utah district court")),
  VT: rule("VT", "Vermont", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    notes: [NO_AFFIDAVIT_NOTE],
  }),
  VA: rule("VA", "Virginia"),
  WA: rule("WA", "Washington", {
    notes: [
      "The self-proving affidavit may be signable under penalty of perjury without a notary. " +
        "A notary block is included by default — verify whether it is necessary.",
    ],
  }),
  WV: rule("WV", "West Virginia"),
  WI: rule("WI", "Wisconsin", {
    selfProvingAffidavitAvailable: false,
    affidavitRequiresNotary: false,
    ...deposit("County register in probate"),
    notes: [NO_AFFIDAVIT_NOTE, "Registers in probate are believed to accept wills for deposit."],
  }),
  WY: rule("WY", "Wyoming"),
};

export function isStateCode(value: unknown): value is StateCode {
  return typeof value === "string" && (STATE_CODES as readonly string[]).includes(value);
}

export function getStateRule(code: StateCode): StateRule {
  return STATE_RULES[code];
}

export function listStateRules(): StateRule[] {
  return STATE_CODES.map((c) => STATE_RULES[c]).sort((a, b) => a.name.localeCompare(b.name));
}

export function unreviewedStates(rules: Iterable<StateRule> = listStateRules()): StateRule[] {
  return [...rules].filter((r) => r.legalReviewStatus !== "reviewed");
}

/** Message logged at startup until every jurisdiction has been reviewed by counsel. */
export function unreviewedStatesWarning(
  rules: Iterable<StateRule> = listStateRules(),
): string | null {
  const pending = unreviewedStates(rules);
  if (pending.length === 0) return null;
  return (
    `LEGAL REVIEW PENDING: ${pending.length} jurisdiction(s) have state rules that have not been ` +
    `verified by a licensed attorney: ${pending.map((r) => r.code).join(", ")}. ` +
    `See docs/LAUNCH_CHECKLIST.md.`
  );
}
