/**
 * Re-encrypts MUTABLE encrypted data with the current DATA_ENCRYPTION_KEY after a key rotation.
 *
 *   npm run job:reencrypt            # dry run (counts only)
 *   npm run job:reencrypt -- --apply # rewrite rows
 *
 * Immutable legal records (will_versions, documents) are protected by DB triggers and keep
 * their original key id — keep that key in DATA_ENCRYPTION_PREVIOUS_KEYS (see docs/RUNBOOK.md).
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { orderNotes, uploads, wills } from "@/db/schema";
import { needsReencryption } from "@/lib/crypto";
import {
  aad,
  decryptBuffer,
  decryptText,
  encryptBuffer,
  encryptText,
  keyRing,
} from "@/server/encryption";

async function main() {
  const apply = process.argv.includes("--apply");
  const ring = keyRing();
  const counts = { wills: 0, uploads: 0, notes: 0 };

  for (const w of await db.select({ id: wills.id, c: wills.draftCiphertext }).from(wills)) {
    if (!needsReencryption(ring, w.c)) continue;
    counts.wills++;
    if (apply) {
      const plain = decryptText(w.c, aad.willDraft(w.id));
      await db
        .update(wills)
        .set({ draftCiphertext: encryptText(plain, aad.willDraft(w.id)) })
        .where(eq(wills.id, w.id));
    }
  }
  for (const u of await db
    .select({ id: uploads.id, d: uploads.dataCiphertext, n: uploads.filenameCiphertext })
    .from(uploads)) {
    if (!needsReencryption(ring, u.d) && !needsReencryption(ring, u.n)) continue;
    counts.uploads++;
    if (apply) {
      await db
        .update(uploads)
        .set({
          dataCiphertext: encryptBuffer(decryptBuffer(u.d, aad.upload(u.id)), aad.upload(u.id)),
          filenameCiphertext: encryptText(
            decryptText(u.n, aad.uploadName(u.id)),
            aad.uploadName(u.id),
          ),
        })
        .where(eq(uploads.id, u.id));
    }
  }
  for (const n of await db
    .select({ id: orderNotes.id, c: orderNotes.bodyCiphertext })
    .from(orderNotes)) {
    if (!needsReencryption(ring, n.c)) continue;
    counts.notes++;
    if (apply) {
      await db
        .update(orderNotes)
        .set({ bodyCiphertext: encryptText(decryptText(n.c, aad.note(n.id)), aad.note(n.id)) })
        .where(eq(orderNotes.id, n.id));
    }
  }
  console.log(
    JSON.stringify({
      job: "reencrypt",
      apply,
      currentKeyId: ring.currentKeyId,
      rowsNeedingRotation: counts,
    }),
  );
}

main()
  .catch((err: unknown) => {
    console.error("reencrypt failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
