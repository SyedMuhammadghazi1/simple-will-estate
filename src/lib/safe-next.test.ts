import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    ["/dashboard/orders/1", "/dashboard/orders/1"],
    ["/admin?x=1", "/admin?x=1"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["", "/dashboard"],
    [null, "/dashboard"],
    // Browsers strip tabs/newlines and treat "\" as "/" when resolving a URL, so these all
    // resolve to //evil.example.
    ["/\t/evil.example", "/dashboard"],
    ["/\n/evil.example", "/dashboard"],
    ["/\r/evil.example", "/dashboard"],
    ["/\t\\evil.example", "/dashboard"],
  ])("%j → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it("never resolves to another origin", () => {
    for (const cp of [...Array(0x21).keys(), 0x5c, 0x7f]) {
      for (const input of [
        `/${String.fromCharCode(cp)}/evil.example`,
        `/${String.fromCharCode(cp)}\\evil.example`,
      ]) {
        const target = safeNext(input);
        expect(new URL(target, "https://app.example").origin).toBe("https://app.example");
      }
    }
  });
});
