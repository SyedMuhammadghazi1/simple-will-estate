import { describe, expect, it } from "vitest";
import { emptyAnswers } from "./answers";
import { mirrorAnswers } from "./mirror";
import { sampleAnswers } from "./sample";
import { summarizeAnswers } from "./summary";
import { validateAnswers } from "./validation";

const today = new Date("2026-09-27T00:00:00Z");

describe("summarizeAnswers", () => {
  it("describes the will in plain English", () => {
    const text = summarizeAnswers(sampleAnswers(), today)
      .flatMap((s) => s.sentences)
      .join(" ");
    expect(text).toContain("You are Jordan Avery Sample, born March 14, 1984.");
    expect(text).toContain("Travis County, Texas 78701");
    expect(text).toContain("Riley Sample (age 11)");
    expect(text).toContain("Casey Morgan Sample (80%)");
    expect(text).toContain("per stirpes");
    expect(text).toContain("my grandfather's pocket watch goes to Taylor Sample");
    expect(text).toContain("under 25 will be managed by Morgan Lee Guardian");
    expect(text).toContain("not legally binding");
  });

  it("handles an empty draft without throwing", () => {
    const sections = summarizeAnswers(emptyAnswers(), today);
    expect(sections).toHaveLength(9);
    expect(sections.flatMap((s) => s.sentences).join(" ")).toContain("(not answered yet)");
  });
});

describe("mirrorAnswers", () => {
  let n = 0;
  const ids = () => `m${++n}`;

  it("swaps testator and partner throughout", () => {
    const m = mirrorAnswers(sampleAnswers(), ids);
    expect(m.about.fullLegalName).toBe("Casey Morgan Sample");
    expect(m.about.spouseName).toBe("Jordan Avery Sample");
    expect(m.about.dateOfBirth).toBe("");
    expect(m.executor.primary.fullName).toBe("Jordan Avery Sample");
    expect(m.residuary.beneficiaries[0]?.name).toBe("Jordan Avery Sample");
    expect(m.residuary.beneficiaries[0]?.shareBps).toBe(8_000);
    expect(m.children.children.map((c) => c.fullName)).toEqual(["Riley Sample", "Taylor Sample"]);
  });

  it("does not copy personal gifts or wishes", () => {
    const m = mirrorAnswers(sampleAnswers(), ids);
    expect(m.gifts.gifts).toEqual([]);
    expect(m.wishes.funeralPreference).toBe("");
  });

  it("produces a valid will once the partner's date of birth is added", () => {
    const m = mirrorAnswers(sampleAnswers(), ids);
    m.about.dateOfBirth = "1986-01-01";
    expect(validateAnswers(m, { today }).errors).toEqual([]);
  });

  it("assigns fresh ids to list items", () => {
    const source = sampleAnswers();
    const m = mirrorAnswers(source, ids);
    const sourceIds = new Set(source.residuary.beneficiaries.map((b) => b.id));
    expect(m.residuary.beneficiaries.some((b) => sourceIds.has(b.id))).toBe(false);
  });
});
