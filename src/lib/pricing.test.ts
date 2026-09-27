import { describe, expect, it } from "vitest";
import {
  PLANS,
  formatCents,
  getPlan,
  isPlanId,
  isWithinUpdateWindow,
  updateWindowEnd,
} from "./pricing";

describe("pricing", () => {
  it("charges flat fees in cents", () => {
    expect(getPlan("individual").amountCents).toBe(9_900);
    expect(getPlan("couple").amountCents).toBe(16_900);
    expect(PLANS.couple.willCount).toBe(2);
    for (const plan of Object.values(PLANS)) expect(Number.isInteger(plan.amountCents)).toBe(true);
  });

  it("formats money", () => {
    expect(formatCents(9_900)).toBe("$99");
    expect(formatCents(16_950)).toBe("$169.50");
    expect(formatCents(1_500_000_000)).toBe("$15,000,000");
  });

  it("validates plan ids", () => {
    expect(isPlanId("couple")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
  });
});

describe("12-month update window", () => {
  it("ends 12 months after payment", () => {
    expect(updateWindowEnd(new Date("2026-01-15T10:00:00Z")).toISOString()).toBe(
      "2027-01-15T10:00:00.000Z",
    );
  });

  it("clamps to the end of shorter months (leap day)", () => {
    expect(updateWindowEnd(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });

  it("is open before the end and closed after", () => {
    const paid = new Date("2026-01-15T10:00:00Z");
    expect(isWithinUpdateWindow(paid, new Date("2027-01-15T09:59:59Z"))).toBe(true);
    expect(isWithinUpdateWindow(paid, new Date("2027-01-15T10:00:00Z"))).toBe(false);
    expect(isWithinUpdateWindow(null, new Date())).toBe(false);
  });
});
