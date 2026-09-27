import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { wills } from "@/db/schema";
import { resetEnvCache } from "@/env";
import { ciphertextKeyId } from "@/lib/crypto";
import { sampleAnswers } from "@/lib/will/sample";
import { reencryptMutableData, reencryptWillDraft } from "@/jobs/reencrypt";
import { resetKeyRing } from "@/server/encryption";
import { createOrder, listWills } from "@/server/services/orders";
import { loadWillForEditing, saveDraftSection } from "@/server/services/wills";
import { createUser } from "./helpers";

const NEW_KEY = Buffer.alloc(32, 9).toString("base64");

async function withRotatedKey(fn: () => Promise<void>) {
  const previous = { ...process.env };
  Object.assign(process.env, {
    DATA_ENCRYPTION_KEY: NEW_KEY,
    DATA_ENCRYPTION_KEY_ID: "test2",
    DATA_ENCRYPTION_PREVIOUS_KEYS: `test1:${previous.DATA_ENCRYPTION_KEY}`,
  });
  resetEnvCache();
  resetKeyRing();
  try {
    await fn();
  } finally {
    Object.assign(process.env, {
      DATA_ENCRYPTION_KEY: previous.DATA_ENCRYPTION_KEY,
      DATA_ENCRYPTION_KEY_ID: previous.DATA_ENCRYPTION_KEY_ID,
      DATA_ENCRYPTION_PREVIOUS_KEYS: previous.DATA_ENCRYPTION_PREVIOUS_KEYS ?? "",
    });
    resetEnvCache();
    resetKeyRing();
  }
}

describe("re-encryption job after a key rotation", () => {
  it("re-encrypts drafts with the current key", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    await withRotatedKey(async () => {
      expect(await reencryptMutableData({ apply: false })).toMatchObject({
        rowsNeedingRotation: { wills: 1 },
      });
      await reencryptMutableData({ apply: true });
      const [row] = await db.select().from(wills).where(eq(wills.id, will!.id));
      expect(ciphertextKeyId(row!.draftCiphertext)).toBe("test2");
    });
  });

  it("does not overwrite a draft the customer saved while the job was running", async () => {
    const { actor } = await createUser();
    const order = await createOrder(actor, "individual");
    const [will] = await listWills(order.id);
    await withRotatedKey(async () => {
      // The job reads the row (still encrypted with the old key)…
      const [stale] = await db
        .select({ id: wills.id, c: wills.draftCiphertext })
        .from(wills)
        .where(eq(wills.id, will!.id));
      // …the customer autosaves in the meantime…
      await saveDraftSection(actor, will!.id, "about", sampleAnswers().about);
      // …then the job gets to that row.
      expect(await reencryptWillDraft(stale!)).toBe(false);
      const { answers } = await loadWillForEditing(actor, will!.id);
      expect(answers.about.fullLegalName).toBe(sampleAnswers().about.fullLegalName);
    });
  });
});
