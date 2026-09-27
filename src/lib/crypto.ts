import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope encryption for sensitive data at rest.
 *
 * Text format:   "v1:<keyId>:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>"
 * Binary format: [0x01][keyIdLength][keyId bytes][iv 12][tag 16][ciphertext]
 *
 * The key id prefix lets keys be rotated: new data is written with the current key while
 * older ciphertexts are decrypted with the matching previous key. Optional associated data
 * (AAD) binds a ciphertext to its row so it can't be swapped into another record.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const TEXT_VERSION = "v1";
const BINARY_VERSION = 0x01;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export interface KeyRing {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

export class DecryptionError extends Error {
  constructor(message = "Unable to decrypt data (wrong key or tampered ciphertext)") {
    super(message);
    this.name = "DecryptionError";
  }
}

function decodeKey(id: string, base64: string): Buffer {
  if (!KEY_ID_PATTERN.test(id)) throw new Error(`Invalid encryption key id "${id}"`);
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error(`Encryption key "${id}" must be 32 bytes (base64)`);
  return key;
}

/**
 * @param currentKeyId id written into new ciphertexts
 * @param currentKey   base64 encoded 32-byte key
 * @param previousKeys comma separated "id:base64" pairs used for decryption only
 */
export function createKeyRing(
  currentKeyId: string,
  currentKey: string,
  previousKeys = "",
): KeyRing {
  const keys = new Map<string, Buffer>();
  keys.set(currentKeyId, decodeKey(currentKeyId, currentKey));
  for (const entry of previousKeys
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const idx = entry.indexOf(":");
    if (idx <= 0) throw new Error("DATA_ENCRYPTION_PREVIOUS_KEYS entries must be id:base64key");
    const id = entry.slice(0, idx);
    if (keys.has(id)) throw new Error(`Duplicate encryption key id "${id}"`);
    keys.set(id, decodeKey(id, entry.slice(idx + 1)));
  }
  return { currentKeyId, keys };
}

function currentKey(ring: KeyRing): Buffer {
  const key = ring.keys.get(ring.currentKeyId);
  if (!key) throw new Error("Current encryption key missing from key ring");
  return key;
}

function seal(key: Buffer, plaintext: Buffer, aad?: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer, aad?: string): Buffer {
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) throw new DecryptionError();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionError();
  }
}

export function encryptString(ring: KeyRing, plaintext: string, aad?: string): string {
  const { iv, tag, ciphertext } = seal(currentKey(ring), Buffer.from(plaintext, "utf8"), aad);
  return [
    TEXT_VERSION,
    ring.currentKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptString(ring: KeyRing, token: string, aad?: string): string {
  const parts = token.split(":");
  if (parts.length !== 5 || parts[0] !== TEXT_VERSION)
    throw new DecryptionError("Malformed ciphertext");
  const [, keyId, iv, tag, ct] = parts as [string, string, string, string, string];
  const key = ring.keys.get(keyId);
  if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}"`);
  return open(
    key,
    Buffer.from(iv, "base64url"),
    Buffer.from(tag, "base64url"),
    Buffer.from(ct, "base64url"),
    aad,
  ).toString("utf8");
}

export function encryptBytes(ring: KeyRing, data: Uint8Array, aad?: string): Buffer {
  const { iv, tag, ciphertext } = seal(currentKey(ring), Buffer.from(data), aad);
  const keyId = Buffer.from(ring.currentKeyId, "utf8");
  return Buffer.concat([Buffer.from([BINARY_VERSION, keyId.length]), keyId, iv, tag, ciphertext]);
}

export function decryptBytes(ring: KeyRing, blob: Uint8Array, aad?: string): Buffer {
  const buf = Buffer.from(blob);
  if (buf.length < 2 || buf[0] !== BINARY_VERSION)
    throw new DecryptionError("Malformed ciphertext");
  const idLength = buf[1] as number;
  const headerEnd = 2 + idLength;
  if (buf.length < headerEnd + IV_LENGTH + TAG_LENGTH)
    throw new DecryptionError("Malformed ciphertext");
  const keyId = buf.subarray(2, headerEnd).toString("utf8");
  const key = ring.keys.get(keyId);
  if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}"`);
  const iv = buf.subarray(headerEnd, headerEnd + IV_LENGTH);
  const tag = buf.subarray(headerEnd + IV_LENGTH, headerEnd + IV_LENGTH + TAG_LENGTH);
  const ct = buf.subarray(headerEnd + IV_LENGTH + TAG_LENGTH);
  return open(key, iv, tag, ct, aad);
}

/** Key id used by a ciphertext (text or binary) — used by the key-rotation job. */
export function ciphertextKeyId(value: string | Uint8Array): string {
  if (typeof value === "string") {
    const parts = value.split(":");
    if (parts.length !== 5 || parts[0] !== TEXT_VERSION)
      throw new DecryptionError("Malformed ciphertext");
    return parts[1] as string;
  }
  const buf = Buffer.from(value);
  if (buf.length < 2 || buf[0] !== BINARY_VERSION)
    throw new DecryptionError("Malformed ciphertext");
  return buf.subarray(2, 2 + (buf[1] as number)).toString("utf8");
}

export function needsReencryption(ring: KeyRing, value: string | Uint8Array): boolean {
  return ciphertextKeyId(value) !== ring.currentKeyId;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** JSON serialisation with recursively sorted object keys (stable input for hashing). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
