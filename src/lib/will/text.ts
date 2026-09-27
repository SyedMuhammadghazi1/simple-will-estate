/**
 * Text helpers shared by validation and document generation.
 *
 * Documents are rendered with the PDF standard Times font (WinAnsi encoding). Characters outside
 * that set cannot be rendered faithfully, and a will must spell names exactly, so validation
 * rejects them instead of silently substituting characters.
 */

const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("").map((c) => c.codePointAt(0) as number),
);

export function isRenderableChar(codePoint: number): boolean {
  if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09) return true;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WIN_ANSI_EXTRAS.has(codePoint);
}

export function findUnrenderableChars(value: string): string[] {
  const bad = new Set<string>();
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && !isRenderableChar(cp)) bad.add(ch);
  }
  return [...bad];
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a);
  return na.length > 0 && na === normalizeName(b);
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Joins items as "A", "A and B", "A, B and C". */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [value, numeral] of map) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]; // prettier-ignore

export function numberToWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
