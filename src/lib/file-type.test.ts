import { describe, expect, it } from "vitest";
import { checkUpload, detectFileType, sanitizeFilename } from "./file-type";

const pdf = Buffer.from("%PDF-1.7\n...");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe("detectFileType", () => {
  it("detects PDF, PNG and JPEG by magic bytes", () => {
    expect(detectFileType(pdf)).toBe("application/pdf");
    expect(detectFileType(png)).toBe("image/png");
    expect(detectFileType(jpeg)).toBe("image/jpeg");
  });

  it("rejects other content even if it claims to be a PDF", () => {
    expect(detectFileType(Buffer.from("<html>%PDF-"))).toBeNull();
    expect(detectFileType(Buffer.from("GIF89a"))).toBeNull();
    expect(detectFileType(Buffer.from("PK\u0003\u0004"))).toBeNull();
    expect(detectFileType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe("checkUpload", () => {
  it("accepts allowed files", () => {
    expect(checkUpload(pdf)).toEqual({ ok: true, mimeType: "application/pdf" });
  });

  it("rejects empty, oversized and unsupported files", () => {
    expect(checkUpload(Buffer.alloc(0))).toMatchObject({ ok: false, code: "empty" });
    expect(checkUpload(Buffer.concat([pdf, Buffer.alloc(100)]), 50)).toMatchObject({
      ok: false,
      code: "too_large",
    });
    expect(checkUpload(Buffer.from("MZ executable"))).toMatchObject({
      ok: false,
      code: "unsupported_type",
    });
  });

  it("allows exactly the maximum size", () => {
    const exact = Buffer.concat([pdf, Buffer.alloc(88)]);
    expect(checkUpload(exact, exact.length).ok).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("strips paths and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\signed will.pdf")).toBe("signed will.pdf");
    expect(sanitizeFilename('my<script>"will".pdf')).toBe("myscriptwill.pdf");
    expect(sanitizeFilename("..")).toBe("upload");
    expect(sanitizeFilename("")).toBe("upload");
  });
});
