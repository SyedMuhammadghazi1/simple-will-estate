import { describe, expect, it } from "vitest";
import { FEDERAL_ESTATE_TAX_EXEMPTION } from "../config";
import { sampleAnswers } from "./sample";
import { screenAnswers, warningsAcknowledged } from "./screening";

function withSituation(patch: Partial<ReturnType<typeof sampleAnswers>["situation"]>) {
  const a = sampleAnswers();
  return { ...a, situation: { ...a.situation, ...patch } };
}

describe("screenAnswers", () => {
  it("is eligible for a simple estate", () => {
    const r = screenAnswers(sampleAnswers());
    expect(r.outcome).toBe("eligible");
    expect(r.findings).toEqual([]);
  });

  it("blocks Louisiana residents", () => {
    const a = sampleAnswers();
    a.about.stateCode = "LA";
    const r = screenAnswers(a);
    expect(r.outcome).toBe("blocked");
    expect(r.findings[0]).toMatchObject({ code: "unsupported_state", severity: "block" });
    expect(r.findings[0]?.recommendation).toMatch(/attorney/i);
  });

  it("uses the $15M 2026 exemption and only flags estates above it", () => {
    expect(FEDERAL_ESTATE_TAX_EXEMPTION).toMatchObject({ year: 2026, amountCents: 1_500_000_000 });
    expect(
      screenAnswers(withSituation({ estimatedEstateValueCents: 1_500_000_000 })).findings,
    ).toEqual([]);
    const r = screenAnswers(withSituation({ estimatedEstateValueCents: 1_500_000_001 }));
    expect(r.outcome).toBe("eligible_with_warnings");
    expect(r.findings.map((f) => f.code)).toEqual(["estate_tax"]);
  });

  it("accepts a custom exemption threshold", () => {
    const r = screenAnswers(withSituation({ estimatedEstateValueCents: 200 }), {
      estateTaxExemptionCents: 100,
    });
    expect(r.findings.map((f) => f.code)).toEqual(["estate_tax"]);
  });

  it.each([
    ["ownsBusiness", "business_ownership"],
    ["specialNeedsBeneficiary", "special_needs_beneficiary"],
    ["disinheritSpouse", "disinherit_spouse"],
    ["spouseNonUsCitizen", "non_citizen_spouse"],
    ["significantForeignAssets", "foreign_assets"],
    ["expectsContest", "expected_contest"],
  ] as const)("warns when %s is true", (field, code) => {
    const r = screenAnswers(withSituation({ [field]: true }));
    expect(r.outcome).toBe("eligible_with_warnings");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ code, severity: "warn" });
    expect(r.acknowledgementRequired).toEqual([code]);
  });

  it("ignores the non-citizen spouse flag for unmarried testators", () => {
    const a = withSituation({ spouseNonUsCitizen: true });
    a.about.maritalStatus = "single";
    expect(screenAnswers(a).findings).toEqual([]);
  });

  it("lets counsel escalate a warning to a block", () => {
    const r = screenAnswers(withSituation({ specialNeedsBeneficiary: true }), {
      severity: { special_needs_beneficiary: "block" },
    });
    expect(r.outcome).toBe("blocked");
    expect(r.acknowledgementRequired).toEqual([]);
  });

  it("collects multiple findings and a block wins", () => {
    const a = withSituation({ ownsBusiness: true, expectsContest: true });
    a.about.stateCode = "LA";
    const r = screenAnswers(a);
    expect(r.outcome).toBe("blocked");
    expect(r.findings.map((f) => f.code).sort()).toEqual(
      ["business_ownership", "expected_contest", "unsupported_state"].sort(),
    );
  });

  it("tracks acknowledgement of warnings", () => {
    const r = screenAnswers(withSituation({ ownsBusiness: true, expectsContest: true }));
    expect(warningsAcknowledged(r, ["business_ownership"])).toBe(false);
    expect(warningsAcknowledged(r, ["business_ownership", "expected_contest"])).toBe(true);
    expect(warningsAcknowledged(screenAnswers(sampleAnswers()), [])).toBe(true);
  });
});
