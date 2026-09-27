import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { getStateRule, type StateRule } from "../states";
import { sampleAnswers } from "../will/sample";
import { documentText, type DocBlock } from "./model";
import { renderDocumentPdf, sanitizeForPdf } from "./render-pdf";
import { buildSigningInstructions } from "./signing-instructions";
import { UnsupportedStateError, buildWillDocument, interestedPersons } from "./will-document";

const createdAt = new Date("2026-09-27T15:00:00Z");
const base = { reference: "Ref TEST1234 · v1", createdAt, appName: "Plainwill" };

function willFor(state: StateRule, answers = sampleAnswers()) {
  return buildWillDocument({ ...base, answers, state });
}

function countSignatures(blocks: DocBlock[], prefix: string): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "signature" && b.label.startsWith(prefix)) n++;
    if (b.type === "keepTogether") n += countSignatures(b.blocks, prefix);
  }
  return n;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ");
}

describe("will document model", () => {
  const model = willFor(getStateRule("TX"));
  const text = documentText(model);

  it("is titled with the testator's name", () => {
    expect(model.title).toBe("Last Will and Testament of Jordan Avery Sample");
    expect(text).toContain("I, JORDAN AVERY SAMPLE, a resident of Travis County, Texas");
  });

  it("contains numbered articles in order", () => {
    const headings = model.blocks
      .filter((b): b is Extract<DocBlock, { type: "heading" }> => b.type === "heading")
      .map((b) => b.text);
    expect(headings.slice(0, 10)).toEqual([
      "Article I — Declaration and Revocation of Prior Wills",
      "Article II — Family",
      "Article III — Executor and Executor's Powers",
      "Article IV — Guardian of Minor Children",
      "Article V — Specific Gifts",
      "Article VI — Residuary Estate",
      "Article VII — Contingent Beneficiaries",
      "Article VIII — Property for Minor and Young Beneficiaries",
      "Article IX — Other Wishes",
      "Article X — General Provisions",
    ]);
  });

  it("revokes prior wills and names family, executor and guardian", () => {
    expect(text).toContain("I revoke all wills and codicils");
    expect(text).toContain("I am married to Casey Morgan Sample");
    expect(text).toContain("Riley Sample, born June 1, 2015");
    expect(text).toContain("any child born to or legally adopted by me after I sign this will");
    expect(text).toContain("I appoint Casey Morgan Sample as Executor");
    expect(text).toContain("I appoint Morgan Lee Guardian as alternate Executor");
    expect(text).toContain("No bond or other security shall be required");
    expect(text).toContain("I appoint Morgan Lee Guardian as guardian of the person");
    expect(text).toContain(
      "If Morgan Lee Guardian is unable or unwilling to serve, I appoint Sam Patel",
    );
  });

  it("lists gifts, residuary shares and the per stirpes rule", () => {
    expect(text).toContain("I give my grandfather's pocket watch to Taylor Sample.");
    expect(text).toContain("If Taylor Sample does not survive me, I give it to Riley Sample.");
    expect(text).toContain("Casey Morgan Sample, my spouse: 80 percent (80%)");
    expect(text).toContain("Example Animal Shelter, a charitable organization: 10 percent (10%)");
    expect(text).toContain("per stirpes");
    expect(text).toContain("named in Article VI does not survive me");
    expect(text).toContain("If any charitable beneficiary is not in existence");
  });

  it("sets up custodianship until the chosen age", () => {
    expect(text).toContain("has not reached age 25");
    expect(text).toContain("Uniform Transfers to Minors Act of Texas");
  });

  it("includes non-binding funeral wishes, pets and digital assets", () => {
    expect(text).toContain("I give any pets I own at my death to Sam Patel");
    expect(text).toContain("Memorialize my social media accounts.");
    expect(text).toContain(
      "not legally binding on anyone: Cremation. Scatter my ashes at the lake.",
    );
  });

  it("has a signature block with date and place lines", () => {
    expect(text).toContain("IN WITNESS WHEREOF");
    expect(text).toContain("Date:");
    expect(text).toContain("Signed at (city and state):");
    expect(text).toContain("Jordan Avery Sample, Testator");
  });

  it("sizes the attestation clause to the state's witness count", () => {
    expect(text).toContain("the two (2) undersigned witnesses");
    expect(
      countSignatures(
        model.blocks.slice(
          0,
          model.blocks.findIndex((b) => b.type === "pageBreak"),
        ),
        "Witness",
      ),
    ).toBe(2);
    const three = willFor({ ...getStateRule("TX"), witnessesRequired: 3 });
    expect(documentText(three)).toContain("the three (3) undersigned witnesses");
    expect(countSignatures(three.blocks, "Witness")).toBe(6); // attestation + affidavit
  });

  it("adds a self-proving affidavit with notary block when available", () => {
    expect(text).toContain("Self-Proving Affidavit");
    expect(text).toContain("STATE OF TEXAS");
    expect(text).toContain("Notary Public");
    expect(countSignatures(model.blocks, "Witness")).toBe(4);
  });

  it("omits the affidavit where the state has none", () => {
    const ca = documentText(willFor(getStateRule("CA")));
    expect(ca).not.toContain("Self-Proving Affidavit");
    expect(ca).not.toContain("Notary Public");
    expect(ca).toContain("Attestation Clause");
  });

  it("omits the notary block when the affidavit needs no notary", () => {
    const noNotary = willFor({ ...getStateRule("TX"), affidavitRequiresNotary: false });
    expect(documentText(noNotary)).toContain("Self-Proving Affidavit");
    expect(documentText(noNotary)).not.toContain("Notary Public");
  });

  it("uses the survivors rule and skips optional articles when not applicable", () => {
    const a = sampleAnswers();
    a.residuary.contingency = "surviving_beneficiaries";
    a.children = { hasChildren: false, children: [], includeFutureChildren: false };
    a.guardians = {
      primary: { fullName: "", relationship: "" },
      alternate: { fullName: "", relationship: "" },
    };
    a.gifts.gifts = [];
    a.minors.useCustodian = false;
    a.wishes = {
      funeralPreference: "",
      funeralNotes: "",
      hasPets: false,
      petCaretakerName: "",
      petNotes: "",
      digitalAssetsInstructions: "",
    };
    const m = willFor(getStateRule("NY"), a);
    const t = documentText(m);
    expect(t).toContain("I have no children.");
    expect(t).toContain("I intentionally make no provision");
    expect(t).toContain("divided among the other residuary beneficiaries who survive me");
    expect(t).not.toContain("Guardian of Minor Children");
    expect(t).not.toContain("Specific Gifts");
    expect(t).not.toContain("Other Wishes");
    expect(t).toContain("Article V — Contingent Beneficiaries");
    expect(t).toContain("named in Article IV does not survive me");
  });

  it("refuses unsupported states", () => {
    expect(() => willFor(getStateRule("LA"))).toThrow(UnsupportedStateError);
    expect(() =>
      buildSigningInstructions({ ...base, answers: sampleAnswers(), state: getStateRule("LA") }),
    ).toThrow(UnsupportedStateError);
  });
});

describe("signing instructions model", () => {
  it("gives a state-specific checklist", () => {
    const m = buildSigningInstructions({
      ...base,
      answers: sampleAnswers(),
      state: getStateRule("TX"),
    });
    const t = documentText(m);
    expect(m.title).toBe("Signing Instructions — Texas");
    expect(t).toContain("Choose two (2) witnesses");
    expect(t).toContain("disinterested");
    expect(t).toContain("Arrange a notary public");
    expect(t).toContain("signs in each other's presence");
    expect(t).toContain("Do not unstaple");
    expect(t).toContain("County clerk");
    expect(t).toContain("have not yet been verified by an attorney licensed in Texas");
    expect(t).toContain("is not a law firm");
    expect(t).toContain("Do not ask any of these people to be a witness: Casey Morgan Sample");
  });

  it("drops the notary step where no affidavit exists", () => {
    const t = documentText(
      buildSigningInstructions({ ...base, answers: sampleAnswers(), state: getStateRule("CA") }),
    );
    expect(t).not.toContain("Arrange a notary public");
    expect(t).toContain("company vault safekeeping");
    expect(t).not.toContain("deposit with the court");
  });

  it("omits the unreviewed warning once a state is reviewed", () => {
    const reviewed = { ...getStateRule("TX"), legalReviewStatus: "reviewed" as const };
    const t = documentText(
      buildSigningInstructions({ ...base, answers: sampleAnswers(), state: reviewed }),
    );
    expect(t).not.toContain("have not yet been verified");
  });

  it("lists everyone named in the will as unsuitable witnesses", () => {
    expect(interestedPersons(sampleAnswers())).toEqual(
      expect.arrayContaining([
        "Casey Morgan Sample",
        "Riley Sample",
        "Taylor Sample",
        "Sam Patel",
        "Morgan Lee Guardian",
      ]),
    );
    expect(interestedPersons(sampleAnswers())).not.toContain("Example Animal Shelter");
  });
});

describe("PDF rendering", () => {
  it("renders the will with the expected text", async () => {
    const bytes = await renderDocumentPdf(willFor(getStateRule("TX")));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const text = await pdfText(bytes);
    expect(text).toContain("Last Will and Testament of Jordan Avery Sample");
    expect(text).toContain("Jordan Avery Sample");
    expect(text).toContain("ARTICLE VI");
    expect(text).toContain("Testator's initials");
    expect(text).toMatch(/Page 1 of \d+/);
    expect(text).toContain("Self-Proving Affidavit STATE OF TEXAS");
    expect(text).not.toContain("DRAFT");
  });

  it("is deterministic for the same snapshot", async () => {
    const a = await renderDocumentPdf(willFor(getStateRule("TX")));
    const b = await renderDocumentPdf(willFor(getStateRule("TX")));
    const hash = (x: Uint8Array) => createHash("sha256").update(x).digest("hex");
    expect(hash(a)).toBe(hash(b));
  });

  it("watermarks previews", async () => {
    const bytes = await renderDocumentPdf(willFor(getStateRule("TX")), { watermark: "DRAFT" });
    const text = await pdfText(bytes);
    expect(text).toContain("DRAFT");
    expect(text).toContain("preview only, do not sign");
  });

  it("renders the signing instructions", async () => {
    const bytes = await renderDocumentPdf(
      buildSigningInstructions({ ...base, answers: sampleAnswers(), state: getStateRule("OH") }),
    );
    const text = await pdfText(bytes);
    expect(text).toContain("Signing Instructions");
    expect(text).toContain("Ohio");
  });

  it("replaces characters the font cannot encode instead of crashing", async () => {
    expect(sanitizeForPdf("Zoë 李\tx")).toBe("Zoë ?    x");
    const a = sampleAnswers();
    a.wishes.digitalAssetsInstructions = "Delete everything 🙂 thanks";
    await expect(renderDocumentPdf(willFor(getStateRule("TX"), a))).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it("handles very long unbroken words", async () => {
    const a = sampleAnswers();
    a.wishes.digitalAssetsInstructions = "x".repeat(600);
    await expect(renderDocumentPdf(willFor(getStateRule("TX"), a))).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
});
