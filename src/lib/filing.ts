import type { StateRule } from "./states";

/**
 * Filing / safekeeping task rules.
 *
 * court_deposit: pending → sent_to_court → filed   (or pending → filed when hand-delivered)
 * vault:         pending → vaulted
 * Either may be cancelled while not yet complete.
 */

export const FILING_METHODS = ["court_deposit", "vault"] as const;
export type FilingMethod = (typeof FILING_METHODS)[number];

export const FILING_TASK_STATUSES = [
  "pending",
  "sent_to_court",
  "filed",
  "vaulted",
  "cancelled",
] as const;
export type FilingTaskStatus = (typeof FILING_TASK_STATUSES)[number];

export const FILING_METHOD_LABELS: Record<FilingMethod, string> = {
  court_deposit: "Deposit with the court / registrar",
  vault: "Company vault safekeeping",
};

export const FILING_STATUS_LABELS: Record<FilingTaskStatus, string> = {
  pending: "Waiting for staff",
  sent_to_court: "Sent to court",
  filed: "Filed with court",
  vaulted: "Stored in vault",
  cancelled: "Cancelled",
};

const TRANSITIONS: Record<FilingMethod, Record<FilingTaskStatus, readonly FilingTaskStatus[]>> = {
  court_deposit: {
    pending: ["sent_to_court", "filed", "cancelled"],
    sent_to_court: ["filed", "cancelled"],
    filed: [],
    vaulted: [],
    cancelled: [],
  },
  vault: {
    pending: ["vaulted", "cancelled"],
    sent_to_court: [],
    filed: [],
    vaulted: [],
    cancelled: [],
  },
};

export function isFilingMethod(value: unknown): value is FilingMethod {
  return typeof value === "string" && (FILING_METHODS as readonly string[]).includes(value);
}

export function canTransitionFiling(
  method: FilingMethod,
  from: FilingTaskStatus,
  to: FilingTaskStatus,
): boolean {
  return TRANSITIONS[method][from].includes(to);
}

export function availableFilingMethods(rule: StateRule): FilingMethod[] {
  return rule.courtDepositOffered ? ["court_deposit", "vault"] : ["vault"];
}

export function isFilingMethodAllowed(rule: StateRule, method: FilingMethod): boolean {
  return availableFilingMethods(rule).includes(method);
}

export function isFilingOpen(status: FilingTaskStatus): boolean {
  return status === "pending" || status === "sent_to_court";
}
