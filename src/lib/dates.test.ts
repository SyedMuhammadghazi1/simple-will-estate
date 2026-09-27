import { describe, expect, it } from "vitest";
import { ageFromIso, ageOn, formatLongDate, isInFuture, parseIsoDate } from "./dates";

describe("dates", () => {
  it("parses valid calendar dates only", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate("2023-02-29")).toBeNull();
    expect(parseIsoDate("2023-13-01")).toBeNull();
    expect(parseIsoDate("2023-1-1")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });

  it("computes age with birthday boundaries", () => {
    const b = { year: 2000, month: 6, day: 15 };
    expect(ageOn(b, { year: 2018, month: 6, day: 14 })).toBe(17);
    expect(ageOn(b, { year: 2018, month: 6, day: 15 })).toBe(18);
  });

  it("handles leap-day birthdays", () => {
    expect(ageFromIso("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(17);
    expect(ageFromIso("2008-02-29", new Date("2026-03-01T12:00:00Z"))).toBe(18);
  });

  it("detects future dates and formats long dates", () => {
    const today = new Date("2026-09-27T00:00:00Z");
    expect(isInFuture("2026-09-28", today)).toBe(true);
    expect(isInFuture("2026-09-27", today)).toBe(false);
    expect(formatLongDate("1984-03-14")).toBe("March 14, 1984");
  });
});
