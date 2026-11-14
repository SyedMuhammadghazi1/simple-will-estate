import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseCaption, plainCaption } from "../player/js/captions.js";
import { propPose } from "../player/js/motion.js";
import { buildTimeline, resolveAt } from "../player/js/timeline.js";
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
import { validateReel } from "../scripts/validate.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const reel = (beats, extra = {}) => ({
  id: "t",
  beats,
  endcard: { headline: "Follow", keyword: "WORD" },
  ...extra,
});
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

  it("writes one subtitle per beat", () => {
    const srt = toSrt(buildTimeline(r));
    expect(srt).toMatch(/^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nOne two three\.\n\n2\n/);
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

  it("enforces a reel's own banned phrases", () => {
    const r4 = good();
    r4.lint = { banned: ["guarantee", "legal advice"] };
    r4.beats[2].caption = "We *guarantee* it holds up.";
    expect(validateReel(r4).errors.join("\n")).toMatch(/banned phrase/);
  });
});

describe("shipped reels", () => {
  const dir = path.join(KIT, "reels");
  const slugs = readdirSync(dir).filter((d) => !d.startsWith("_"));

  it.each(slugs)("%s passes validation with its committed voice timing", (slug) => {
    const read = (f) => JSON.parse(readFileSync(path.join(dir, slug, f), "utf8"));
    const res = validateReel(read("reel.json"), read("timeline.json"));
    expect(res.errors).toEqual([]);
    expect(res.stats.measured).toBe(true);
  });
});
