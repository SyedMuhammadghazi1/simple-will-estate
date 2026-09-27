import { describe, expect, it } from "vitest";
import {
  STATE_CODES,
  STATE_RULES,
  getStateRule,
  isStateCode,
  listStateRules,
  unreviewedStates,
  unreviewedStatesWarning,
  type StateRule,
} from "./states";

describe("state rules data", () => {
  it("covers all 50 states plus DC exactly once", () => {
    expect(STATE_CODES).toHaveLength(51);
    expect(new Set(STATE_CODES).size).toBe(51);
    expect(Object.keys(STATE_RULES).sort()).toEqual([...STATE_CODES].sort());
    for (const code of STATE_CODES) expect(STATE_RULES[code].code).toBe(code);
  });

  it("marks every entry as unreviewed with no review date (honesty rule)", () => {
    for (const rule of listStateRules()) {
      expect(rule.legalReviewStatus).toBe("unreviewed");
      expect(rule.lastReviewedAt).toBeNull();
      expect(rule.reviewedBy).toBeNull();
    }
  });

  it("uses 2 witnesses as the default everywhere", () => {
    for (const rule of listStateRules()) expect(rule.witnessesRequired).toBe(2);
  });

  it("marks only Louisiana as unsupported", () => {
    const unsupported = listStateRules().filter((r) => !r.supported);
    expect(unsupported.map((r) => r.code)).toEqual(["LA"]);
    expect(getStateRule("LA").notes.join(" ")).toMatch(/notarial testament/i);
  });

  it("never requires a notary for an affidavit that is not available", () => {
    for (const rule of listStateRules()) {
      if (!rule.selfProvingAffidavitAvailable) expect(rule.affidavitRequiresNotary).toBe(false);
    }
  });

  it("names a deposit authority whenever court deposit is offered", () => {
    for (const rule of listStateRules()) {
      if (rule.courtDepositOffered) expect(rule.depositAuthority).toBeTruthy();
      else expect(rule.depositAuthority).toBeNull();
    }
  });

  it("validates state codes", () => {
    expect(isStateCode("DC")).toBe(true);
    expect(isStateCode("tx")).toBe(false);
    expect(isStateCode("PR")).toBe(false);
    expect(isStateCode(undefined)).toBe(false);
  });

  it("builds a startup warning listing unreviewed states", () => {
    const warning = unreviewedStatesWarning();
    expect(warning).toContain("51 jurisdiction(s)");
    expect(warning).toContain("LA");
    expect(warning).toContain("LAUNCH_CHECKLIST");
  });

  it("returns no warning once every state is reviewed", () => {
    const reviewed: StateRule[] = listStateRules().map((r) => ({
      ...r,
      legalReviewStatus: "reviewed",
      lastReviewedAt: "2026-01-01",
    }));
    expect(unreviewedStates(reviewed)).toEqual([]);
    expect(unreviewedStatesWarning(reviewed)).toBeNull();
  });
});
