import { MAX_UPLOAD_BYTES } from "./config";

/**
 * Upload type detection by magic bytes. The client-declared MIME type and file extension are
 * never trusted.
 */

export const ALLOWED_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

export function detectFileType(bytes: Uint8Array): AllowedUploadType | null {
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  return null;
}

export const EXTENSION_FOR_TYPE: Record<AllowedUploadType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export type UploadCheck =
  | { ok: true; mimeType: AllowedUploadType }
  | { ok: false; code: "empty" | "too_large" | "unsupported_type"; message: string };

export function checkUpload(bytes: Uint8Array, maxBytes = MAX_UPLOAD_BYTES): UploadCheck {
  if (bytes.length === 0) return { ok: false, code: "empty", message: "The file is empty." };
  if (bytes.length > maxBytes) {
    return {
      ok: false,
      code: "too_large",
      message: `The file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    };
  }
  const mimeType = detectFileType(bytes);
  if (!mimeType) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "Upload a PDF, PNG or JPEG file.",
    };
  }
  return { ok: true, mimeType };
}

/** Removes path components and unsafe characters from an uploaded file name. */
export function sanitizeFilename(name: string, fallback = "upload"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".." ? cleaned : fallback;
}
