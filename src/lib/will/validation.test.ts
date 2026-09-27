import { describe, expect, it } from "vitest";
import { emptyAnswers, type WillAnswers } from "./answers";
import { sampleAnswers } from "./sample";
import {
  completedSteps,
  hasMinorChildren,
  issuesByPath,
  totalShareBps,
  validateAnswers,
  validateStep,
} from "./validation";

const today = new Date("2026-09-27T12:00:00Z");
const opts = { today };

function codes(answers: WillAnswers, step?: Parameters<typeof validateStep>[0]) {
  const r = step ? validateStep(step, answers, opts) : validateAnswers(answers, opts);
  return r.errors.map((e) => `${e.path}:${e.code}`);
}

function withAbout(patch: Partial<WillAnswers["about"]>) {
  const a = sampleAnswers();
  return { ...a, about: { ...a.about, ...patch } };
}

describe("validateAnswers — complete sample", () => {
  it("accepts the sample answers with no errors", () => {
    expect(validateAnswers(sampleAnswers(), opts).errors).toEqual([]);
  });

  it("reports every step as complete for valid answers", () => {
    expect(completedSteps(sampleAnswers(), opts)).toEqual([
      "about",
      "situation",
      "children",
      "guardians",
      "executor",
      "beneficiaries",
      "gifts",
      "minors",
      "wishes",
    ]);
  });

  it("flags required fields on an empty draft", () => {
    const errs = codes(emptyAnswers());
    expect(errs).toContain("about.fullLegalName:required");
    expect(errs).toContain("about.dateOfBirth:required");
    expect(errs).toContain("about.stateCode:required");
    expect(errs).toContain("situation.ownsBusiness:required");
    expect(errs).toContain("children.hasChildren:required");
    expect(errs).toContain("executor.primary.fullName:required");
    expect(errs).toContain("residuary.beneficiaries:required");
    expect(errs).toContain("residuary.contingency:required");
    expect(errs).toContain("minors.useCustodian:required");
  });
});

describe("about you", () => {
  it("requires first and last name", () => {
    expect(codes(withAbout({ fullLegalName: "Cher" }), "about")).toContain(
      "about.fullLegalName:full_name_required",
    );
  });

  it("rejects names that are blank or whitespace", () => {
    expect(codes(withAbout({ fullLegalName: "   " }), "about")).toContain(
      "about.fullLegalName:required",
    );
  });

  it("rejects characters the PDF font cannot print", () => {
    expect(codes(withAbout({ fullLegalName: "Łukasz Nowak 李" }), "about")).toContain(
      "about.fullLegalName:unsupported_characters",
    );
  });

  it("accepts Latin-1 accented names", () => {
    expect(codes(withAbout({ fullLegalName: "Zoë Renée Müller" }), "about")).toEqual([]);
  });

  it.each([
    ["2008-09-28", "underage"], // turns 18 tomorrow
    ["2030-01-01", "future_date"],
    ["1984-02-30", "invalid_date"],
    ["not-a-date", "invalid_date"],
    ["1890-01-01", "invalid_date"],
  ])("rejects date of birth %s (%s)", (dob, code) => {
    expect(codes(withAbout({ dateOfBirth: dob }), "about")).toContain(`about.dateOfBirth:${code}`);
  });

  it("accepts a testator who turns 18 today", () => {
    expect(codes(withAbout({ dateOfBirth: "2008-09-27" }), "about")).toEqual([]);
  });

  it("rejects unknown states and bad ZIP codes", () => {
    const errs = codes(withAbout({ stateCode: "ZZ", postalCode: "123" }), "about");
    expect(errs).toContain("about.stateCode:invalid_state");
    expect(errs).toContain("about.postalCode:invalid_postal_code");
  });

  it("accepts ZIP+4", () => {
    expect(codes(withAbout({ postalCode: "78701-1234" }), "about")).toEqual([]);
  });

  it("requires a spouse name when married, but not when single", () => {
    expect(codes(withAbout({ spouseName: "" }), "about")).toContain("about.spouseName:required");
    expect(codes(withAbout({ maritalStatus: "single", spouseName: "" }), "about")).toEqual([]);
  });

  it("rejects a spouse with the same name as the testator", () => {
    expect(codes(withAbout({ spouseName: " jordan  avery SAMPLE " }), "about")).toContain(
      "about.spouseName:same_as_testator",
    );
  });
});

describe("children & guardians", () => {
  it("computes minor status from date of birth", () => {
    expect(hasMinorChildren(sampleAnswers(), today)).toBe(true);
    const a = sampleAnswers();
    a.children.children = [{ id: "x", fullName: "Adult Kid", dateOfBirth: "2000-01-01" }];
    expect(hasMinorChildren(a, today)).toBe(false);
  });

  it("requires at least one child when the answer is yes", () => {
    const a = sampleAnswers();
    a.children.children = [];
    expect(codes(a, "children")).toContain("children.children:required");
  });

  it("rejects duplicate children and future birth dates", () => {
    const a = sampleAnswers();
    a.children.children = [
      { id: "1", fullName: "Riley Sample", dateOfBirth: "2015-06-01" },
      { id: "2", fullName: "riley sample", dateOfBirth: "2027-01-01" },
    ];
    const errs = codes(a, "children");
    expect(errs).toContain("children.children.1.fullName:duplicate");
    expect(errs).toContain("children.children.1.dateOfBirth:future_date");
  });

  it("requires a guardian when there is a minor child", () => {
    const a = sampleAnswers();
    a.guardians.primary.fullName = "";
    a.guardians.alternate.fullName = "";
    expect(codes(a, "guardians")).toContain("guardians.primary.fullName:required");
  });

  it("does not require a guardian when all children are adults", () => {
    const a = sampleAnswers();
    a.children.children = [{ id: "x", fullName: "Adult Kid", dateOfBirth: "2000-01-01" }];
    a.guardians.primary.fullName = "";
    a.guardians.alternate.fullName = "";
    expect(codes(a, "guardians")).toEqual([]);
  });

  it("ignores listed children when the testator answered no", () => {
    const a = sampleAnswers();
    a.children.hasChildren = false;
    a.guardians.primary.fullName = "";
    a.guardians.alternate.fullName = "";
    expect(hasMinorChildren(a, today)).toBe(false);
    expect(codes(a, "guardians")).toEqual([]);
  });

  it("rejects an alternate guardian identical to the primary", () => {
    const a = sampleAnswers();
    a.guardians.alternate.fullName = "MORGAN LEE GUARDIAN";
    expect(codes(a, "guardians")).toContain(
      "guardians.alternate.fullName:alternate_same_as_primary",
    );
  });

  it("warns (but does not block) when no alternate guardian is named", () => {
    const a = sampleAnswers();
    a.guardians.alternate.fullName = "";
    const r = validateStep("guardians", a, opts);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain("alternate_recommended");
  });

  it("rejects the testator as their own guardian", () => {
    const a = sampleAnswers();
    a.guardians.primary.fullName = "Jordan Avery Sample";
    expect(codes(a, "guardians")).toContain("guardians.primary.fullName:self_appointment");
  });
});

describe("executor", () => {
  it("requires an executor", () => {
    const a = sampleAnswers();
    a.executor.primary.fullName = "";
    expect(codes(a, "executor")).toContain("executor.primary.fullName:required");
  });

  it("rejects the testator as executor and duplicate alternates", () => {
    const a = sampleAnswers();
    a.executor.primary.fullName = "Jordan Avery Sample";
    a.executor.alternate.fullName = "jordan avery sample";
    const errs = codes(a, "executor");
    expect(errs).toContain("executor.primary.fullName:self_appointment");
    expect(errs).toContain("executor.alternate.fullName:alternate_same_as_primary");
  });
});

describe("beneficiaries & residuary", () => {
  it("sums shares in basis points", () => {
    expect(totalShareBps(sampleAnswers())).toBe(10_000);
  });

  it.each([
    [[5_000, 4_999], "99.99"],
    [[5_000, 5_001], "100.01"],
    [[3_333, 3_333, 3_333], "99.99"],
  ])("rejects shares %j that do not total exactly 100%%", (shares, shown) => {
    const a = sampleAnswers();
    a.residuary.beneficiaries = shares.map((s, i) => ({
      id: `b${i}`,
      kind: "person" as const,
      name: `Person Number${i}`,
      relationship: "",
      shareBps: s,
    }));
    const r = validateStep("beneficiaries", a, opts);
    const total = r.errors.find((e) => e.code === "shares_not_100");
    expect(total?.message).toContain(`${shown}%`);
  });

  it("accepts thirds expressed as 33.34 / 33.33 / 33.33", () => {
    const a = sampleAnswers();
    a.residuary.beneficiaries = [3_334, 3_333, 3_333].map((s, i) => ({
      id: `b${i}`,
      kind: "person" as const,
      name: `Person Number${i}`,
      relationship: "",
      shareBps: s,
    }));
    expect(codes(a, "beneficiaries")).toEqual([]);
  });

  it("rejects zero shares, duplicates and self-gifts", () => {
    const a = sampleAnswers();
    a.residuary.beneficiaries = [
      { id: "1", kind: "person", name: "Jordan Avery Sample", relationship: "", shareBps: 10_000 },
      { id: "2", kind: "person", name: "Riley Sample", relationship: "", shareBps: 0 },
      { id: "3", kind: "person", name: "riley sample", relationship: "", shareBps: 0 },
    ];
    const errs = codes(a, "beneficiaries");
    expect(errs).toContain("residuary.beneficiaries.0.name:self_beneficiary");
    expect(errs).toContain("residuary.beneficiaries.1.shareBps:invalid_share");
    expect(errs).toContain("residuary.beneficiaries.2.name:duplicate");
  });

  it("requires a contingency rule", () => {
    const a = sampleAnswers();
    a.residuary.contingency = "";
    expect(codes(a, "beneficiaries")).toContain("residuary.contingency:required");
  });

  it("warns when a married testator leaves nothing to their spouse", () => {
    const a = sampleAnswers();
    a.residuary.beneficiaries = [
      { id: "1", kind: "person", name: "Riley Sample", relationship: "", shareBps: 10_000 },
    ];
    const r = validateStep("beneficiaries", a, opts);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain("spouse_not_beneficiary");
  });
});

describe("gifts, minors and wishes", () => {
  it("requires gift descriptions and recipients, with distinct alternates", () => {
    const a = sampleAnswers();
    a.gifts.gifts = [
      { id: "g", description: "", recipientName: "", alternateRecipientName: "" },
      {
        id: "h",
        description: "car",
        recipientName: "Riley Sample",
        alternateRecipientName: "Riley Sample",
      },
    ];
    const errs = codes(a, "gifts");
    expect(errs).toContain("gifts.gifts.0.description:required");
    expect(errs).toContain("gifts.gifts.0.recipientName:required");
    expect(errs).toContain("gifts.gifts.1.alternateRecipientName:alternate_same_as_primary");
  });

  it.each([17, 26, 0])("rejects custodian age %i", (age) => {
    const a = sampleAnswers();
    a.minors.custodianAge = age;
    expect(codes(a, "minors")).toContain("minors.custodianAge:invalid_age");
  });

  it.each([18, 21, 25])("accepts custodian age %i", (age) => {
    const a = sampleAnswers();
    a.minors.custodianAge = age;
    expect(codes(a, "minors")).toEqual([]);
  });

  it("requires a custodian name and a distinct alternate", () => {
    const a = sampleAnswers();
    a.minors.custodianName = "";
    a.minors.alternateCustodianName = "Sam Patel";
    expect(codes(a, "minors")).toContain("minors.custodianName:required");
    a.minors.custodianName = "sam patel";
    expect(codes(a, "minors")).toContain("minors.alternateCustodianName:alternate_same_as_primary");
  });

  it("warns when minors exist but no custodian is chosen", () => {
    const a = sampleAnswers();
    a.minors.useCustodian = false;
    const r = validateStep("minors", a, opts);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain("custodian_recommended");
  });

  it("requires a pet caretaker when the testator has pets", () => {
    const a = sampleAnswers();
    a.wishes.petCaretakerName = "";
    expect(codes(a, "wishes")).toContain("wishes.petCaretakerName:required");
  });

  it("requires a description for an 'other' funeral preference", () => {
    const a = sampleAnswers();
    a.wishes.funeralPreference = "other";
    a.wishes.funeralNotes = "";
    expect(codes(a, "wishes")).toContain("wishes.funeralNotes:required");
  });
});

describe("helpers", () => {
  it("maps issues by path keeping the first message", () => {
    const map = issuesByPath([
      { step: "about", path: "a", code: "x", message: "first" },
      { step: "about", path: "a", code: "y", message: "second" },
    ]);
    expect(map).toEqual({ a: "first" });
  });

  it("validateStep only returns issues for that step", () => {
    const r = validateStep("gifts", emptyAnswers(), opts);
    expect(r.errors.every((e) => e.step === "gifts")).toBe(true);
  });
});
