import { describe, expect, it } from "vitest";
import {
  bpsToPercent,
  emptyAnswers,
  parseAnswers,
  parseSection,
  percentToBps,
  willAnswersSchema,
} from "./answers";

describe("answers schema", () => {
  it("fills every section with defaults", () => {
    const a = emptyAnswers();
    expect(a.about.fullLegalName).toBe("");
    expect(a.children.includeFutureChildren).toBe(true);
    expect(a.executor.waiveBond).toBe(true);
    expect(a.residuary.beneficiaries).toEqual([]);
    expect(a.minors.custodianAge).toBe(21);
  });

  it("parses partial data, keeping provided values", () => {
    const a = parseAnswers({ about: { fullLegalName: "A B" } });
    expect(a.about.fullLegalName).toBe("A B");
    expect(a.about.city).toBe("");
  });

  it("rejects wrong types and oversized input", () => {
    expect(willAnswersSchema.safeParse({ about: { fullLegalName: 1 } }).success).toBe(false);
    expect(willAnswersSchema.safeParse({ about: { fullLegalName: "x".repeat(201) } }).success).toBe(
      false,
    );
    expect(
      willAnswersSchema.safeParse({
        residuary: { beneficiaries: [{ id: "a", name: "x", shareBps: 10_001 }] },
      }).success,
    ).toBe(false);
  });

  it("parses a single section", () => {
    expect(parseSection("wishes", { hasPets: true }).hasPets).toBe(true);
  });
});

describe("percent ↔ basis points", () => {
  it.each([
    ["100", 10_000],
    ["50", 5_000],
    ["33.33", 3_333],
    ["33.3", 3_330],
    ["0.01", 1],
    [" 12.5 ", 1_250],
  ])("%s%% → %i bps", (input, bps) => {
    expect(percentToBps(input)).toBe(bps);
  });

  it.each(["", "abc", "-5", "100.01", "1.234", "1e2", "1000"])("rejects %s", (input) => {
    expect(percentToBps(input)).toBeNull();
  });

  it.each([
    [10_000, "100"],
    [3_333, "33.33"],
    [3_330, "33.3"],
    [1, "0.01"],
    [1_250, "12.5"],
  ])("%i bps → %s%%", (bps, pct) => {
    expect(bpsToPercent(bps)).toBe(pct);
  });
});
