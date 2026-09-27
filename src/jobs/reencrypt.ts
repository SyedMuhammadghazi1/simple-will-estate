import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
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

export interface ReencryptResult {
  apply: boolean;
  currentKeyId: string;
  rowsNeedingRotation: { wills: number; uploads: number; notes: number };
}

/**
 * Rewrites one will draft with the current key. The job runs while the app is live, so the row is
 * only updated if it still holds the ciphertext that was read: a draft autosaved in the meantime is
 * already encrypted with the current key and must not be replaced by the older answers.
 */
export async function reencryptWillDraft(row: { id: string; c: string }): Promise<boolean> {
  const plain = decryptText(row.c, aad.willDraft(row.id));
  const updated = await db
    .update(wills)
    .set({ draftCiphertext: encryptText(plain, aad.willDraft(row.id)) })
    .where(and(eq(wills.id, row.id), eq(wills.draftCiphertext, row.c)))
    .returning({ id: wills.id });
  return updated.length > 0;
}

/**
 * Re-encrypts MUTABLE encrypted data with the current DATA_ENCRYPTION_KEY after a key rotation.
 * Immutable legal records (will_versions, documents) are protected by DB triggers and keep their
 * original key id — keep that key in DATA_ENCRYPTION_PREVIOUS_KEYS (see docs/RUNBOOK.md).
 */
export async function reencryptMutableData({
  apply,
}: {
  apply: boolean;
}): Promise<ReencryptResult> {
  const ring = keyRing();
  const counts = { wills: 0, uploads: 0, notes: 0 };

  for (const w of await db.select({ id: wills.id, c: wills.draftCiphertext }).from(wills)) {
    if (!needsReencryption(ring, w.c)) continue;
    counts.wills++;
    if (apply) await reencryptWillDraft(w);
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
  return { apply, currentKeyId: ring.currentKeyId, rowsNeedingRotation: counts };
}
