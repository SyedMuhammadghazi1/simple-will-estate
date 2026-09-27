import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { orders, wills } from "@/db/schema";
import { sampleAnswers } from "@/lib/will/sample";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createOrder, listWills } from "@/server/services/orders";
import {
  loadWillForEditing,
  mirrorFromPartner,
  saveDraftSection,
  submitStep,
} from "@/server/services/wills";
import { createUser, fillWill } from "./helpers";

describe("wizard save & resume", () => {
  it("creates one encrypted draft per will (two for a couple)", async () => {
    const { actor } = await createUser();
    const single = await createOrder(actor, "individual");
    const couple = await createOrder(actor, "couple");
    expect(await listWills(single.id)).toHaveLength(1);
    const coupleWills = await listWills(couple.id);
    expect(coupleWills.map((w) => w.position)).toEqual([1, 2]);
    expect(single.amountCents).toBe(9_900);
    expect(couple.amountCents).toBe(16_900);
    expect(coupleWills[0]?.draftCiphertext.startsWith("v1:test1:")).toBe(true);
  });

  it("autosaves a section encrypted at rest and restores it on resume", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    const about = sampleAnswers().about;
    await saveDraftSection(actor, will!.id, "about", about, "children");

    const [raw] = await db.select().from(wills).where(eq(wills.id, will!.id));
    expect(raw!.draftCiphertext).not.toContain("Jordan");
    expect(raw!.currentStep).toBe("children");
    expect(raw!.completedSteps).toContain("about");

    const resumed = await loadWillForEditing(actor, will!.id);
    expect(resumed.answers.about).toEqual(about);
    expect(resumed.mode).toBe("draft");
  });

  it("keeps partial drafts but blocks advancing with invalid answers", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    const partial = { ...sampleAnswers().about, fullLegalName: "", dateOfBirth: "2015-01-01" };
    const result = await submitStep(actor, will!.id, "about", "about", partial);
    expect(result.nextStep).toBeNull();
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["required", "underage"]),
    );
    const [raw] = await db.select().from(wills).where(eq(wills.id, will!.id));
    expect(raw!.currentStep).toBe("about");
    // …but the partial answers were still saved
    const resumed = await loadWillForEditing(actor, will!.id);
    expect(resumed.answers.about.dateOfBirth).toBe("2015-01-01");
  });

  it("advances to the next step when the step is valid", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    const result = await submitStep(actor, will!.id, "about", "about", sampleAnswers().about);
    expect(result.errors).toEqual([]);
    expect(result.nextStep).toBe("situation");
    const [raw] = await db.select().from(wills).where(eq(wills.id, will!.id));
    expect(raw!.currentStep).toBe("situation");
  });

  it("validates share totals across the whole draft on the beneficiaries step", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    await fillWill(actor, will!.id);
    const residuary = { ...sampleAnswers().residuary };
    residuary.beneficiaries = residuary.beneficiaries.map((b, i) =>
      i === 0 ? { ...b, shareBps: 7_000 } : b,
    );
    const result = await submitStep(actor, will!.id, "beneficiaries", "residuary", residuary);
    expect(result.errors.map((e) => e.code)).toContain("shares_not_100");
  });

  it("rejects malformed section data", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    await expect(
      saveDraftSection(actor, will!.id, "about", { fullLegalName: "x".repeat(500) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not let another user read or write the draft", async () => {
    const a = await createUser();
    const b = await createUser();
    const order = await createOrder(a.actor, "individual");
    const [will] = await listWills(order.id);
    await expect(loadWillForEditing(b.actor, will!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveDraftSection(b.actor, will!.id, "about", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("locks answers while filing is in progress", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    await db
      .update(orders)
      .set({ status: "filing_in_progress", paidAt: new Date() })
      .where(eq(orders.id, order.id));
    await expect(
      saveDraftSection(actor, will!.id, "about", sampleAnswers().about),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("pre-fills the partner's will as a mirror for couples", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "couple");
    const [first, second] = await listWills(order.id);
    await fillWill(actor, first!.id);
    await mirrorFromPartner(actor, second!.id);
    const mirrored = await loadWillForEditing(actor, second!.id);
    expect(mirrored.answers.about.fullLegalName).toBe("Casey Morgan Sample");
    expect(mirrored.answers.residuary.beneficiaries[0]?.name).toBe("Jordan Avery Sample");
    await expect(mirrorFromPartner(actor, first!.id)).rejects.toBeInstanceOf(ConflictError);
  });
});
