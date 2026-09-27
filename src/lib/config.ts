/**
 * Business configuration that needs periodic human review.
 */

/**
 * Federal estate-tax basic exclusion amount used by the complexity screening.
 * VERIFY ANNUALLY: the IRS adjusts this figure. $15,000,000 per individual is used for 2026.
 * Update the amount and `year` every January (see docs/LAUNCH_CHECKLIST.md).
 */
export const FEDERAL_ESTATE_TAX_EXEMPTION = {
  year: 2026,
  amountCents: 15_000_000_00,
  note: "Verify annually against the current IRS basic exclusion amount.",
} as const;

/** Signing reminders go out when documents have been ready this many days without execution. */
export const SIGNING_REMINDER_AFTER_DAYS = 7;
/** Minimum gap between two reminders for the same order. */
export const SIGNING_REMINDER_INTERVAL_DAYS = 7;

/** Upload limits for signed will scans. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed custodianship ages for young beneficiaries (UTMA-style). */
export const CUSTODIAN_AGE_MIN = 18;
export const CUSTODIAN_AGE_MAX = 25;

export const MINIMUM_TESTATOR_AGE = 18;
