/**
 * Server-side price list. The client never sends prices; checkout and webhook verification
 * read from here. Amounts are integer cents.
 */

export const PLAN_IDS = ["individual", "couple"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  amountCents: number;
  currency: "usd";
  willCount: 1 | 2;
  description: string;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  individual: {
    id: "individual",
    name: "Individual will",
    amountCents: 9_900,
    currency: "usd",
    willCount: 1,
    description: "One will for one adult.",
  },
  couple: {
    id: "couple",
    name: "Couple (two mirror wills)",
    amountCents: 16_900,
    currency: "usd",
    willCount: 2,
    description: "Two mirror wills for spouses or partners who live in the same state.",
  },
};

export const INCLUDED_FEATURES = [
  "Your will as a print-ready PDF",
  "A state-specific signing kit with step-by-step instructions",
  "12 months of free updates",
  "Secure, encrypted vault storage",
  "Managed filing or deposit where your state or county offers it",
] as const;

/** Length of the free-update window after payment, in months. */
export const FREE_UPDATE_MONTHS = 12;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function formatCents(amountCents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

/** End of the free-update window (exclusive) for an order paid at `paidAt`. */
export function updateWindowEnd(paidAt: Date): Date {
  const end = new Date(paidAt.getTime());
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + FREE_UPDATE_MONTHS);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export function isWithinUpdateWindow(paidAt: Date | null, now: Date): boolean {
  if (!paidAt) return false;
  return now.getTime() < updateWindowEnd(paidAt).getTime();
}
