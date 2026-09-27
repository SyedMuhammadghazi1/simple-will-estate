import "server-only";
import {
  createKeyRing,
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  type KeyRing,
} from "@/lib/crypto";
import { getEnv } from "@/env";

let ring: KeyRing | undefined;

export function keyRing(): KeyRing {
  if (!ring) {
    const env = getEnv();
    ring = createKeyRing(
      env.DATA_ENCRYPTION_KEY_ID,
      env.DATA_ENCRYPTION_KEY,
      env.DATA_ENCRYPTION_PREVIOUS_KEYS,
    );
  }
  return ring;
}

/** Associated-data labels bind each ciphertext to the row it belongs to. */
export const aad = {
  willDraft: (willId: string) => `will-draft:${willId}`,
  willVersion: (versionId: string) => `will-version:${versionId}`,
  document: (documentId: string) => `document:${documentId}`,
  upload: (uploadId: string) => `upload:${uploadId}`,
  uploadName: (uploadId: string) => `upload-name:${uploadId}`,
  note: (noteId: string) => `order-note:${noteId}`,
};

export function encryptJson(value: unknown, context: string): string {
  return encryptString(keyRing(), JSON.stringify(value), context);
}

export function decryptJson(token: string, context: string): unknown {
  return JSON.parse(decryptString(keyRing(), token, context));
}

export function encryptText(value: string, context: string): string {
  return encryptString(keyRing(), value, context);
}

export function decryptText(token: string, context: string): string {
  return decryptString(keyRing(), token, context);
}

export function encryptBuffer(data: Uint8Array, context: string): Buffer {
  return encryptBytes(keyRing(), data, context);
}

export function decryptBuffer(blob: Uint8Array, context: string): Buffer {
  return decryptBytes(keyRing(), blob, context);
}

/** Test helper. */
export function resetKeyRing() {
  ring = undefined;
}
