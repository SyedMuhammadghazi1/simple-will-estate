import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DecryptionError,
  canonicalJson,
  ciphertextKeyId,
  createKeyRing,
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  needsReencryption,
  sha256Hex,
} from "./crypto";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");
const ring = createKeyRing("k1", k1);

describe("AES-256-GCM string encryption", () => {
  it("round-trips unicode text", () => {
    const secret = JSON.stringify({ name: "Zoë Müller", ssn: "none", emoji: "✓" });
    const token = encryptString(ring, secret);
    expect(token.startsWith("v1:k1:")).toBe(true);
    expect(token).not.toContain("Zoë");
    expect(decryptString(ring, token)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptString(ring, "same")).not.toBe(encryptString(ring, "same"));
  });

  it("detects tampering with the ciphertext", () => {
    const token = encryptString(ring, "hello world");
    const parts = token.split(":");
    const ct = Buffer.from(parts[4] as string, "base64url");
    ct[0] = (ct[0] as number) ^ 0xff;
    parts[4] = ct.toString("base64url");
    expect(() => decryptString(ring, parts.join(":"))).toThrow(DecryptionError);
  });

  it("detects a tampered auth tag", () => {
    const parts = encryptString(ring, "hello").split(":");
    parts[3] = Buffer.alloc(16).toString("base64url");
    expect(() => decryptString(ring, parts.join(":"))).toThrow(DecryptionError);
  });

  it("binds ciphertext to associated data", () => {
    const token = encryptString(ring, "draft", "will:1");
    expect(decryptString(ring, token, "will:1")).toBe("draft");
    expect(() => decryptString(ring, token, "will:2")).toThrow(DecryptionError);
    expect(() => decryptString(ring, token)).toThrow(DecryptionError);
  });

  it("rejects malformed input and unknown key ids", () => {
    expect(() => decryptString(ring, "garbage")).toThrow(DecryptionError);
    const other = createKeyRing("k9", k2);
    expect(() => decryptString(ring, encryptString(other, "x"))).toThrow(/Unknown encryption key/);
  });

  it("fails with the wrong key material under the same id", () => {
    const imposter = createKeyRing("k1", k2);
    expect(() => decryptString(imposter, encryptString(ring, "x"))).toThrow(DecryptionError);
  });
});

describe("key rotation", () => {
  it("decrypts old data with a previous key and writes new data with the current key", () => {
    const oldToken = encryptString(ring, "legacy");
    const rotated = createKeyRing("k2", k2, `k1:${k1}`);
    expect(decryptString(rotated, oldToken)).toBe("legacy");
    expect(needsReencryption(rotated, oldToken)).toBe(true);
    const fresh = encryptString(rotated, "legacy");
    expect(ciphertextKeyId(fresh)).toBe("k2");
    expect(needsReencryption(rotated, fresh)).toBe(false);
  });

  it("validates key material", () => {
    expect(() => createKeyRing("k1", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => createKeyRing("bad id!", k1)).toThrow(/Invalid encryption key id/);
    expect(() => createKeyRing("k1", k1, "nocolon")).toThrow(/id:base64key/);
    expect(() => createKeyRing("k1", k1, `k1:${k2}`)).toThrow(/Duplicate/);
  });
});

describe("binary encryption", () => {
  it("round-trips bytes", () => {
    const data = randomBytes(4096);
    const blob = encryptBytes(ring, data, "upload:1");
    expect(ciphertextKeyId(blob)).toBe("k1");
    expect(decryptBytes(ring, blob, "upload:1").equals(data)).toBe(true);
  });

  it("detects tampering", () => {
    const blob = encryptBytes(ring, Buffer.from("%PDF-1.7 signed will"));
    blob[blob.length - 1] = (blob[blob.length - 1] as number) ^ 0x01;
    expect(() => decryptBytes(ring, blob)).toThrow(DecryptionError);
  });

  it("rejects truncated blobs", () => {
    expect(() => decryptBytes(ring, Buffer.from([1, 2, 3]))).toThrow(DecryptionError);
    expect(() => decryptBytes(ring, Buffer.alloc(0))).toThrow(DecryptionError);
  });
});

describe("hashing helpers", () => {
  it("produces stable canonical JSON regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })).toBe(
      '{"a":{"c":2,"d":[1,{"y":2,"z":1}]},"b":1}',
    );
    expect(sha256Hex(canonicalJson({ a: 1, b: 2 }))).toBe(sha256Hex(canonicalJson({ b: 2, a: 1 })));
  });

  it("computes sha256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
