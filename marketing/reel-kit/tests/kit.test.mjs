import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseCaption, plainCaption } from "../player/js/captions.js";
import { propPose } from "../player/js/motion.js";
import { buildTimeline, cueMatches, resolveAt } from "../player/js/timeline.js";
import {
  blurPop,
  clamp,
  commas,
  ease,
  kf,
  mix,
  prog,
  rng,
  settle,
  spring,
} from "../player/js/timing.js";
import { toSrt } from "../scripts/build.mjs";
import { bannedIn, fencedBlocks, validateReel } from "../scripts/validate.mjs";
import { applyVariant, spokenText, variantNames } from "../scripts/variant.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const reel = (beats, extra = {}) => ({
  id: "t",
  beats,
  endcard: { headline: "Follow", keyword: "WORD" },
  ...extra,
});
const word = (t0) => ({ t0, t1: t0 + 0.2 });
const beat = (id, caption, extra = {}) => ({
  id,
  caption,
  prop: { type: "note", text: "x", enter: "none" },
  ...extra,
});

describe("timing", () => {
  it("easings start at 0 and end at 1", () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBeCloseTo(0, 6);
      expect(fn(1), name).toBeCloseTo(1, 6);
    }
  });

  it("spring overshoots then settles on 1", () => {
    const samples = Array.from({ length: 200 }, (_, i) => spring(i / 100));
    expect(spring(0)).toBe(0);
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(spring(2)).toBeCloseTo(1, 3);
  });

  it("settle reaches 1 without ever overshooting; blur-pop ends sharp and full size", () => {
    let previous = 0;
    for (let i = 0; i <= 120; i++) {
      const v = settle(i / 60);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
    expect(settle(0.5)).toBeGreaterThan(0.99);
    expect(blurPop(0)).toMatchObject({ opacity: 0, scale: 0.55 });
    expect(blurPop(1)).toMatchObject({ opacity: 1, scale: 1, blur: 0 });
  });

  it("keyframes interpolate numbers and arrays and clamp outside the range", () => {
    const frames = [
      [0, 0],
      [1, 10, ease.linear],
      [2, 0, ease.linear],
    ];
    expect(kf(-1, frames)).toBe(0);
    expect(kf(0.5, frames)).toBeCloseTo(5);
    expect(kf(1.5, frames)).toBeCloseTo(5);
    expect(kf(9, frames)).toBe(0);
    expect(
      kf(0.5, [
        [0, [0, 0]],
        [1, [2, 4], ease.linear],
      ]),
    ).toEqual([1, 2]);
  });

  it("is deterministic: the seeded generator repeats and never leaves 0..1", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("helpers", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(prog(5, 0, 10)).toBe(0.5);
    expect(prog(1, 2, 2)).toBe(0);
    expect(commas(1234567)).toBe("1,234,567");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
  });
});

describe("captions", () => {
  it("parses accent markers and keeps trailing punctuation outside a closed accent", () => {
    const words = parseCaption("You spent *three weeks* picking, *well*, a stroller.");
    expect(words.map((w) => w.text)).toEqual([
      "You",
      "spent",
      "three",
      "weeks",
      "picking,",
      "well",
      "a",
      "stroller.",
    ]);
    expect(words.map((w) => w.accent)).toEqual([
      false,
      false,
      true,
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(words[5].tail).toBe(",");
    expect(plainCaption("Your *state* wrote it.")).toBe("Your state wrote it.");
  });

  it("keeps punctuation that sits inside the accent", () => {
    const words = parseCaption("gets *nothing.*");
    expect(words[1]).toMatchObject({ text: "nothing.", accent: true, tail: "" });
  });
});

describe("timeline", () => {
  const r = reel([beat("a", "One two *three.*"), beat("b", "Four five six seven.")]);

  it("estimates contiguous beats when no voice timing exists", () => {
    const tl = buildTimeline(r);
    expect(tl.measured).toBe(false);
    expect(tl.beats[0].start).toBe(0);
    expect(tl.beats[1].start).toBeCloseTo(tl.beats[0].end);
    expect(tl.endcard.start).toBeCloseTo(tl.beats[1].end);
    expect(tl.duration * tl.fps).toBeCloseTo(tl.frames, 6);
    expect(tl.loop.start + tl.loop.dur).toBeCloseTo(tl.duration);
    for (const b of tl.beats) {
      for (let i = 1; i < b.words.length; i++)
        expect(b.words[i].t0).toBeGreaterThan(b.words[i - 1].t0);
    }
  });

  it("uses measured word times and rejects a stale timing file", () => {
    const timing = {
      beats: [
        {
          start: 0,
          end: 2,
          words: [
            { t0: 0.1, t1: 0.3 },
            { t0: 0.4, t1: 0.6 },
            { t0: 0.9, t1: 1.4 },
          ],
        },
        {
          start: 2,
          end: 4,
          words: [
            { t0: 2.1, t1: 2.3 },
            { t0: 2.4, t1: 2.6 },
            { t0: 2.9, t1: 3.1 },
            { t0: 3.2, t1: 3.6 },
          ],
        },
      ],
    };
    const tl = buildTimeline(r, timing);
    expect(tl.measured).toBe(true);
    expect(tl.beats[0].words[2]).toMatchObject({ text: "three.", accent: true, t0: 0.9 });
    expect(() => buildTimeline(reel([beat("a", "One two.")]), timing)).toThrow(/stale/);
  });

  it("resolves cues by index, by word, by beat and with offsets", () => {
    const tl = buildTimeline(r);
    const [a, b] = tl.beats;
    expect(resolveAt(0.5, a)).toBeCloseTo(a.start + 0.5);
    expect(resolveAt("w:2", a)).toBeCloseTo(a.words[2].t0);
    expect(resolveAt("w:three", a)).toBeCloseTo(a.words[2].t0);
    expect(resolveAt("w:three+0.25", a)).toBeCloseTo(a.words[2].t0 + 0.25);
    expect(resolveAt("w:six", a, [a, b])).toBeCloseTo(b.words[2].t0);
    expect(resolveAt("beat:1", a, [a, b])).toBeCloseTo(b.start);
    expect(resolveAt("end-0.5", a, [a, b])).toBeCloseTo(b.end - 0.5);
    expect(() => resolveAt("w:nope", a)).toThrow(/does not match/);
  });

  it("picks a later occurrence of a repeated word, and reports ambiguous cues", () => {
    const tl = buildTimeline(reel([beat("a", "You can replace it where *you* decide.")]));
    const [a] = tl.beats;
    expect(resolveAt("w:you", a)).toBeCloseTo(a.words[0].t0);
    expect(resolveAt("w:you#2", a)).toBeCloseTo(a.words[5].t0);
    expect(resolveAt("w:you#2+0.1", a)).toBeCloseTo(a.words[5].t0 + 0.1);
    expect(() => resolveAt("w:you#3", a)).toThrow(/does not match/);
    expect(cueMatches("w:you", [a])).toBe(2);
    expect(cueMatches("w:you#2", [a])).toBe(1);
    expect(cueMatches("w:replace", [a])).toBe(1);
    expect(cueMatches(0.4, [a])).toBe(1);
    expect(() => resolveAt("beat:1", a, [a])).toThrow(/points past/);
  });

  it("resolves words that look like offsets or indexes as words", () => {
    const tl = buildTimeline(reel([beat("a", "Only 2 in 3 said *covid-19* was over.")]));
    const [a] = tl.beats;
    expect(resolveAt("w:covid-19", a)).toBeCloseTo(a.words[5].t0);
    expect(resolveAt("w:covid-19+0.5", a)).toBeCloseTo(a.words[5].t0 + 0.5);
    expect(resolveAt("w:2", a)).toBeCloseTo(a.words[1].t0); // the word "2", not index 2
    expect(resolveAt("i:2", a)).toBeCloseTo(a.words[2].t0);
    expect(resolveAt("w:6", a)).toBeCloseTo(a.words[6].t0); // no word "6": falls back to index
    expect(cueMatches("w:covid-19", [a])).toBe(1);
  });

  it("snaps cuts to frames and rejects timings whose wording no longer matches", () => {
    const one = reel([beat("a", "One two *three.*")]);
    const timing = (text) => ({
      beats: [
        {
          text,
          start: 0,
          end: 1.9667, // a 4-decimal rounding of 59/30
          words: [
            { t0: 0.1, t1: 0.3 },
            { t0: 0.4, t1: 0.6 },
            { t0: 0.9, t1: 1.4 },
          ],
        },
      ],
    });
    const tl = buildTimeline(one, timing("One two three."));
    expect(tl.beats[0].end).toBe(59 / 30);
    expect(tl.endcard.start).toBe(59 / 30);
    // same word count, different words: still stale
    expect(() => buildTimeline(one, timing("One two four."))).toThrow(/stale/);
  });

  it("writes one subtitle per beat", () => {
    const srt = toSrt(buildTimeline(r));
    expect(srt).toMatch(/^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nOne two three\.\n\n2\n/);
  });

  it("every cut of every beat lands exactly on a frame", () => {
    const tl = buildTimeline(r, {
      beats: [
        { text: "One two three.", start: 0, end: 1.2333, words: [0.1, 0.4, 0.8].map(word) },
        {
          text: "Four five six seven.",
          start: 1.2333,
          end: 3.0667,
          words: [1.3, 1.7, 2.1, 2.5].map(word),
        },
      ],
    });
    for (const t of [...tl.beats.flatMap((b) => [b.start, b.end]), tl.endcard.end, tl.loop.start]) {
      expect(Math.abs(t * tl.fps - Math.round(t * tl.fps))).toBeLessThan(1e-9);
    }
  });

  it("times a spoken end card like a beat and never ends the card before the line", () => {
    const spoken = reel([beat("a", "One two *three.*")], {
      endcard: { headline: "Follow for *more*", say: "Follow for more.", hold: 1 },
    });
    const est = buildTimeline(spoken);
    expect(est.endcard.words).toHaveLength(3);
    expect(est.endcard.words[0].t0).toBeGreaterThan(est.endcard.start);
    expect(est.endcard.end).toBeGreaterThanOrEqual(est.endcard.words[2].t1 + 0.85);
    expect(est.duration).toBe(est.endcard.end);

    const timing = (text) => ({
      beats: [{ text: "One two three.", start: 0, end: 2, words: [0.1, 0.5, 0.9].map(word) }],
      endcard: { text, words: [2.3, 2.6, 3.0].map(word) },
    });
    const tl = buildTimeline(spoken, timing("Follow for more."));
    expect(tl.endcard.words.map((w) => w.t0)).toEqual([2.3, 2.6, 3.0]);
    expect(tl.endcard.end).toBeCloseTo(3.2 + 0.9, 1);
    // the line was reworded, or the voice was made before the line existed
    expect(() => buildTimeline(spoken, timing("Follow for less."))).toThrow(
      /stale for the end card/,
    );
    expect(() => buildTimeline(spoken, { beats: timing("").beats })).toThrow(
      /stale for the end card/,
    );
    // an unspoken end card has no words and keeps its hold
    expect(buildTimeline(r).endcard.words).toEqual([]);
  });

  it("subtitles carry the end card's spoken line and its on-screen disclosure", () => {
    const card = { headline: "Follow", say: "Follow for more.", disclaimer: "Not a law firm." };
    const srt = toSrt(buildTimeline(reel(r.beats, { endcard: card })), card);
    expect(srt).toMatch(
      /\n3\n[\d:,]+ --> [\d:,]+\nFollow for more\.\n\[On screen\] Not a law firm\.\n/,
    );
  });
});

describe("motion", () => {
  const spec = { x: 500, y: 900, enter: "right", exit: "left" };
  const frame = 1 / 30;

  it("is hidden before it arrives and from the swap frame after its four exit frames", () => {
    expect(propPose(spec, 0.9, 1, 3).visible).toBe(false);
    expect(propPose(spec, 3 + 3 * frame, 1, 3).visible).toBe(true);
    expect(propPose(spec, 3 + 4 * frame, 1, 3).visible).toBe(false);
  });

  it("arrives most of a screen away and settles on its anchor without overshooting", () => {
    expect(propPose(spec, 1, 1, 3).x).toBeCloseTo(500 + 760, 0);
    let previous = Infinity;
    for (let f = 0; f <= 30; f++) {
      const pose = propPose(spec, 1 + f * frame, 1, 3);
      expect(pose.x).toBeGreaterThanOrEqual(500 - 1e-6); // never past the anchor
      expect(pose.x).toBeLessThanOrEqual(previous + 1e-6); // never backs up
      previous = pose.x;
    }
    const rest = propPose(spec, 1 + 15 * frame, 1, 3);
    expect(rest.x).toBeCloseTo(500, -1);
    expect(rest.blur).toBeLessThan(0.5);
  });

  it("leaves left at a constant speed, blurring more each frame", () => {
    const poses = [0, 1, 2, 3].map((f) => propPose(spec, 3 + f * frame, 1, 3));
    const steps = poses.slice(1).map((p, i) => poses[i].x - p.x);
    for (const step of steps) expect(step).toBeCloseTo(180, 3);
    expect(poses[3].blur).toBeGreaterThan(poses[0].blur);
    expect(poses[3].opacity).toBe(1);
  });

  it('enter "none" is on its anchor from the first frame', () => {
    const pose = propPose({ ...spec, enter: "none" }, 1, 1, 3);
    expect(pose).toMatchObject({ visible: true, x: 500, y: 900, blur: 0 });
  });
});

describe("validator", () => {
  const good = () =>
    reel(
      Array.from({ length: 8 }, (_, i) =>
        beat(`b${i}`, `This is the *number ${i}* caption of the reel.`),
      ),
    );

  it("accepts a well-formed reel", () => {
    const res = validateReel(good());
    expect(res.errors).toEqual([]);
    expect(res.stats.beats).toBe(8);
  });

  it("reports unknown props, bad cues, unbalanced accents and duplicate ids", () => {
    const bad = good();
    bad.beats[1].prop = { type: "nope" };
    bad.beats[2].prop = { type: "checklist", items: [{ text: "x", at: "w:missing" }] };
    expect(validateReel(bad).errors.join("\n")).toMatch(/unknown prop type "nope"/);
    expect(validateReel(bad).errors.join("\n")).toMatch(/does not match any caption word/);
    const accent = good();
    accent.beats[0].caption = "Broken *accent here.";
    expect(validateReel(accent).errors.join("\n")).toMatch(/unbalanced/);
    const dup = good();
    dup.beats[3].id = "b0";
    expect(validateReel(dup).errors.join("\n")).toMatch(/duplicate beat id/);
  });

  it("warns when the hook animates in, a beat has no prop, or nothing is accented", () => {
    const r2 = good();
    r2.beats[0].prop = { type: "note", text: "x" };
    delete r2.beats[4].prop;
    r2.beats[5].caption = "Nothing is emphasised in this one.";
    const { warnings } = validateReel(r2);
    expect(warnings.join("\n")).toMatch(/frame 0/);
    expect(warnings.join("\n")).toMatch(/"b4" has no prop/);
    expect(warnings.join("\n")).toMatch(/"b5" has no accent word/);
  });

  it("a prop that spans beats covers them", () => {
    const r3 = good();
    r3.beats[0].prop = { type: "note", text: "x", enter: "none", span: 3 };
    delete r3.beats[1].prop;
    delete r3.beats[2].prop;
    expect(validateReel(r3).warnings.join("\n")).not.toMatch(/has no prop/);
  });

  it("checks cues in nested prop fields and warns about ambiguous word cues", () => {
    const r5 = good();
    r5.beats[1].caption = "You can do it where *you* decide.";
    r5.beats[1].prop = { type: "doc-stamp", typeAt: "w:you", stampAt: "w:decide" };
    r5.beats[2].prop = {
      type: "formula-card",
      rows: [{ label: "A" }],
      highlight: { row: 0, at: "w:missing" },
    };
    const res = validateReel(r5);
    expect(res.warnings.join("\n")).toMatch(/cue "w:you" matches 2 words/);
    expect(res.errors.join("\n")).toMatch(/cue "w:missing"/);
  });

  it("rejects bad structure: props object, unknown theme, unknown music.until, stray asterisk", () => {
    const a = good();
    a.beats[0].props = { type: "note", text: "x" };
    expect(validateReel(a).errors.join("\n")).toMatch(/"props" must be an array/);
    const b = good();
    b.theme = "nope";
    expect(validateReel(b).errors.join("\n")).toMatch(/unknown theme/);
    const c = good();
    c.music = { until: "nope" };
    expect(validateReel(c).errors.join("\n")).toMatch(/music.until/);
    const d = good();
    d.beats[0].caption = "A *word*— then *more* text here.";
    expect(validateReel(d).errors.join("\n")).toMatch(/accent markers/);
  });

  it("knows the mixer's effect names and flags captions the voice cannot be timed to", () => {
    const r7 = good();
    r7.beats[2].sfx = [{ at: 0.2, name: "kazoo" }];
    r7.beats[3].sfx = [{ at: 0.2, name: "ding" }];
    r7.beats[4].caption = "Kids & pets come *first* here.";
    const res = validateReel(r7);
    expect(res.errors.join("\n")).toMatch(/unknown sound "kazoo"/);
    expect(res.errors.join("\n")).not.toMatch(/unknown sound "ding"/);
    expect(res.warnings.join("\n")).toMatch(/no letters or digits/);
  });

  it("the phrase guard reads everything a viewer can see, literally", () => {
    const r6 = good();
    r6.lint = { banned: ["$0 (free)", "legal advice"] };
    r6.disclaimer = "This is legal advice";
    expect(validateReel(r6).errors.join("\n")).toMatch(/banned phrase "legal advice"/);
    r6.disclaimer = "General information";
    r6.beats[3].prop = { type: "note", text: "costs\n$0 (free) today", enter: "none" };
    expect(validateReel(r6).errors.join("\n")).toMatch(/banned phrase "\$0 \(free\)"/);
    r6.beats[3].prop = { type: "note", text: "x", enter: "none" };
    expect(validateReel(r6).errors).toEqual([]);
  });

  it("enforces a reel's own banned phrases", () => {
    const r4 = good();
    r4.lint = { banned: ["guarantee", "legal advice"] };
    r4.beats[2].caption = "We *guarantee* it holds up.";
    expect(validateReel(r4).errors.join("\n")).toMatch(/banned phrase/);
  });

  it("enforces the disclosures a reel says it must carry", () => {
    const r7 = good();
    r7.lint = {
      require: [
        { field: "disclaimer", includes: ["not legal advice"] },
        { field: "endcard.disclaimer", includes: ["not a law firm", "substitute"] },
      ],
    };
    expect(validateReel(r7).errors.join("\n")).toMatch(/"disclaimer" is missing/);
    r7.disclaimer = "Not Legal Advice · Laws vary";
    r7.endcard.disclaimer = "We are not a law firm.";
    const errs = validateReel(r7).errors;
    expect(errs).toEqual(['lint.require: "endcard.disclaimer" must include "substitute"']);
    r7.endcard.disclaimer = "Not a law firm and not a substitute for an attorney.";
    expect(validateReel(r7).errors).toEqual([]);
  });

  it("warns when a footnote is up too briefly or the end card sits in silence", () => {
    const r8 = good();
    r8.beats[4].props = [
      { type: "note", text: "x", enter: "none" },
      { type: "note", text: "* the caveat", enter: "pop", delay: "end-0.6" },
    ];
    delete r8.beats[4].prop;
    r8.endcard.hold = 4;
    const warns = validateReel(r8).warnings.join("\n");
    expect(warns).toMatch(/note "\* the caveat" is on screen 0\.6s/);
    expect(warns).toMatch(/holds over 3s in silence/);
    r8.endcard.say = "Follow for more of these.";
    expect(validateReel(r8).warnings.join("\n")).toMatch(
      /endcard\.say has 5 words and endcard\.headline 1/,
    );
  });

  it("holds pasted copy (fenced blocks) to the same phrase guard", () => {
    const md =
      "Intro: it is free to read.\n\n```\nComment LIST\nIt's free today\n```\n\n```text\nSecond block\n```\n";
    expect(fencedBlocks(md)).toEqual(["Comment LIST", "It's free today", "Second block"]);
    const found = bannedIn(fencedBlocks(md), ["/\\bfree\\b/", "/(unclosed/"], [], "kit: ");
    expect(found).toEqual([
      'banned phrase "/\\bfree\\b/" found in kit: "It\'s free today"',
      'lint.banned: "/(unclosed/" is not a valid pattern',
    ]);
  });
});

describe("variants", () => {
  const base = reel(
    [
      beat("a", "One two *three.*"),
      beat("b", "Four five *six.*", { mascot: [{ at: 0, face: "talk" }] }),
    ],
    {
      endcard: { headline: "Follow", sub: "Original" },
      variants: {
        card: { about: "keyword card", endcard: { keyword: "WORD", sub: null } },
        ask: { beats: { b: { caption: "Seven *eight.*", prop: { text: "y" }, mascot: [] } } },
        short: { beats: { a: null } },
        broken: { beats: { nope: { caption: "x" } } },
      },
    },
  );

  it("merges objects, replaces arrays and values, and removes keys set to null", () => {
    expect(variantNames(base)).toEqual(["card", "ask", "short", "broken"]);
    const card = applyVariant(base, "card");
    expect(card.id).toBe("t--card");
    expect(card.endcard).toEqual({ headline: "Follow", keyword: "WORD" });
    expect(card.variants).toBeUndefined();
    expect(card.beats).toEqual(base.beats);
    // the original is left untouched
    expect(base.endcard.sub).toBe("Original");
  });

  it("patches beats by id and can drop one", () => {
    const ask = applyVariant(base, "ask");
    expect(ask.beats[1]).toMatchObject({
      id: "b",
      caption: "Seven *eight.*",
      prop: { type: "note", text: "y", enter: "none" },
      mascot: [],
    });
    expect(applyVariant(base, "short").beats.map((b) => b.id)).toEqual(["b"]);
    expect(() => applyVariant(base, "broken")).toThrow(/patches beat "nope"/);
    expect(() => applyVariant(base, "missing")).toThrow(/no variant "missing" \(have: card, ask/);
  });

  it("knows when a variant can reuse the original narration", () => {
    expect(spokenText(applyVariant(base, "card"))).toBe(spokenText(base));
    expect(spokenText(applyVariant(base, "ask"))).not.toBe(spokenText(base));
  });
});

describe("shipped reels", () => {
  const dir = path.join(KIT, "reels");
  // "<slug>--<variant>" folders are generated by build.mjs --variant, not shipped
  const slugs = readdirSync(dir).filter((d) => !d.startsWith("_") && !d.includes("--"));

  it.each(slugs)("%s passes validation with its committed voice timing", (slug) => {
    const read = (f) => JSON.parse(readFileSync(path.join(dir, slug, f), "utf8"));
    const res = validateReel(read("reel.json"), read("timeline.json"));
    expect(res.errors).toEqual([]);
    expect(res.stats.measured).toBe(true);
  });
});
