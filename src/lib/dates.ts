/**
 * Date helpers that operate on ISO calendar dates (YYYY-MM-DD) without time zones, so a birthday
 * is never shifted by the server's zone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export function parseIsoDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  if (year < 1880) return null;
  return { year, month, day };
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  return parseIsoDate(value) !== null;
}

export function toCalendarDate(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Whole years between birth and `on` (birthday counts on the day itself). */
export function ageOn(birth: CalendarDate, on: CalendarDate): number {
  let age = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) age -= 1;
  return age;
}

export function ageFromIso(dob: string | null | undefined, today: Date): number | null {
  const birth = parseIsoDate(dob);
  if (!birth) return null;
  return ageOn(birth, toCalendarDate(today));
}

export function isInFuture(value: string, today: Date): boolean {
  const d = parseIsoDate(value);
  if (!d) return false;
  return compareCalendarDates(d, toCalendarDate(today)) > 0;
}

export function formatLongDate(value: string | null | undefined): string {
  const d = parseIsoDate(value);
  if (!d) return "";
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
