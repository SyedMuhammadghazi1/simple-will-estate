#!/usr/bin/env node
// Lints a reel.json against the template's "beat grammar" — the structural rules measured on the
// reference reel (see docs/TEMPLATE-SPEC.md). Errors mean the reel will not build or breaks the
// format; warnings mean it will build but drifts from what made the format work.
//
//   node marketing/reel-kit/scripts/validate.mjs --reel plainwill-default-will

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCaption, plainCaption } from "../player/js/captions.js";
import { PROPS } from "../player/js/props/index.js";
import { FACES, POSES } from "../player/js/mascot.js";
import { buildTimeline, resolveAt } from "../player/js/timeline.js";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The numbers below come from the reference: 13 beats in 34 s, beats 1.2-4.3 s, 4-14 words per
// caption, 173 wpm overall, every caption carrying 1-3 accent words, one dark beat at ~75%.
export const RULES = {
  duration: { min: 18, ideal: [24, 40], max: 90 },
  beats: { min: 7, max: 16 },
  beat: { minDur: 1.1, maxDur: 5.0, maxWords: 14, maxChars: 84 },
  hook: { maxDur: 3.5, maxWords: 9 },
  accents: { min: 1, max: 4 },
  wpm: { min: 150, max: 205 },
  darkAfter: 0.5, // a mood flip belongs in the back half, as the last jolt before the ask
};

/**
 * @returns {{ errors: string[], warnings: string[], timeline: object, stats: object }}
 */
export function validateReel(reel, timing = null) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(reel.beats) || reel.beats.length === 0) {
    return {
      errors: ["reel.beats must be a non-empty array"],
      warnings,
      timeline: null,
      stats: {},
    };
  }
  const ids = new Set();
  for (const beat of reel.beats) {
    if (!beat.id) errors.push("every beat needs an id");
    if (ids.has(beat.id)) errors.push(`duplicate beat id "${beat.id}"`);
    ids.add(beat.id);
    if (typeof beat.caption !== "string" || !beat.caption.trim()) {
      errors.push(`beat "${beat.id}": caption is required`);
    } else if ((beat.caption.match(/\*/g) ?? []).length % 2 !== 0) {
      errors.push(`beat "${beat.id}": unbalanced * accent markers in "${beat.caption}"`);
    }
  }
  if (errors.length) return { errors, warnings, timeline: null, stats: {} };

  let tl;
  try {
    tl = buildTimeline(reel, timing);
  } catch (err) {
    return { errors: [err.message], warnings, timeline: null, stats: {} };
  }

  const n = tl.beats.length;
  if (n < RULES.beats.min || n > RULES.beats.max) {
    warnings.push(`${n} beats; the format works with ${RULES.beats.min}-${RULES.beats.max}`);
  }
  if (tl.duration > RULES.duration.max)
    errors.push(`duration ${tl.duration.toFixed(1)}s exceeds ${RULES.duration.max}s`);
  else if (tl.duration < RULES.duration.ideal[0] || tl.duration > RULES.duration.ideal[1]) {
    warnings.push(
      `duration ${tl.duration.toFixed(1)}s is outside the ${RULES.duration.ideal.join("-")}s sweet spot`,
    );
  }

  let covered = -1; // index of the last beat that a spanning prop still covers
  let words = 0;
  let firstDark = -1;
  tl.beats.forEach((beat, i) => {
    const dur = beat.end - beat.start;
    const text = plainCaption(beat.caption);
    const parsed = parseCaption(beat.caption);
    words += parsed.length;
    const accents = parsed.filter((w) => w.accent).length;
    if (dur < RULES.beat.minDur)
      warnings.push(
        `beat "${beat.id}" is only ${dur.toFixed(2)}s; under ${RULES.beat.minDur}s the prop cannot land`,
      );
    if (dur > RULES.beat.maxDur)
      warnings.push(
        `beat "${beat.id}" runs ${dur.toFixed(2)}s; split it (nothing new on screen for too long)`,
      );
    if (parsed.length > RULES.beat.maxWords)
      warnings.push(
        `beat "${beat.id}" has ${parsed.length} words; keep captions to ${RULES.beat.maxWords}`,
      );
    if (text.length > RULES.beat.maxChars)
      warnings.push(
        `beat "${beat.id}" caption is ${text.length} characters and will wrap past three lines`,
      );
    if (accents < RULES.accents.min)
      warnings.push(
        `beat "${beat.id}" has no accent word; mark the one word that carries the beat with *asterisks*`,
      );
    if (accents > RULES.accents.max)
      warnings.push(
        `beat "${beat.id}" accents ${accents} words; when everything is emphasised nothing is`,
      );
    if (i === 0) {
      if (dur > RULES.hook.maxDur)
        warnings.push(
          `hook runs ${dur.toFixed(2)}s; the first caption should be read inside ${RULES.hook.maxDur}s`,
        );
      if (parsed.length > RULES.hook.maxWords)
        warnings.push(`hook has ${parsed.length} words; aim for ${RULES.hook.maxWords} or fewer`);
    }
    if (beat.mood === "dark" && firstDark < 0) firstDark = i;

    const specs = beat.props ?? (beat.prop ? [beat.prop] : []);
    for (const spec of specs) {
      if (!PROPS[spec.type]) {
        errors.push(
          `beat "${beat.id}": unknown prop type "${spec.type}" (have: ${Object.keys(PROPS).join(", ")})`,
        );
        continue;
      }
      covered = Math.max(covered, i + (spec.span ?? 1) - 1);
      const spanned = tl.beats.slice(i, i + (spec.span ?? 1));
      for (const [key, value] of Object.entries(spec)) {
        const cues = [];
        if (/At$|^delay$/.test(key) && value != null) cues.push(value);
        if (key === "hits" && Array.isArray(value)) cues.push(...value);
        if (Array.isArray(value))
          for (const v of value) if (v && typeof v === "object" && "at" in v) cues.push(v.at);
        for (const cue of cues) {
          try {
            resolveAt(cue, beat, spanned);
          } catch (err) {
            errors.push(err.message);
          }
        }
      }
      if (i === 0 && (spec.enter ?? "right") !== "none") {
        warnings.push(
          `hook prop "${spec.type}" animates in; set "enter": "none" so frame 0 (the cover and loop target) is fully composed`,
        );
      }
    }
    if (specs.length === 0 && covered < i) {
      warnings.push(
        `beat "${beat.id}" has no prop; every beat should put something new on the pad`,
      );
    }
    for (const cue of [...(beat.mascot ?? []), ...(beat.sfx ?? [])]) {
      try {
        resolveAt(cue.at ?? 0, beat);
      } catch (err) {
        errors.push(err.message);
      }
      if (cue.face && !FACES[cue.face])
        errors.push(`beat "${beat.id}": unknown mascot face "${cue.face}"`);
      if (cue.pose && !POSES[cue.pose])
        errors.push(`beat "${beat.id}": unknown mascot pose "${cue.pose}"`);
    }
  });

  if (firstDark >= 0 && tl.beats[firstDark].start / tl.duration < RULES.darkAfter) {
    warnings.push(
      `the dark beat "${tl.beats[firstDark].id}" arrives in the first half; it works as a late jolt, not an opener`,
    );
  }
  const spoken = tl.beats[n - 1].end;
  const wpm = (words / spoken) * 60;
  if (tl.measured && (wpm < RULES.wpm.min || wpm > RULES.wpm.max)) {
    warnings.push(
      `narration runs ${wpm.toFixed(0)} wpm; the reference sits at 173 (adjust voice.speed or voice.gap)`,
    );
  }
  if (!reel.endcard?.keyword)
    warnings.push("no endcard.keyword: the format ends on a comment-keyword ask");
  if (reel.loop === false)
    warnings.push("loop is off: the reference dissolves back into frame 0 so replays are seamless");

  // per-reel phrase guard, e.g. claims a regulated business must never make
  const banned = reel.lint?.banned ?? [];
  const haystack = [
    ...reel.beats.map(
      (b) => `${b.id}: ${plainCaption(b.caption)} ${JSON.stringify(b.props ?? b.prop ?? "")}`,
    ),
    `endcard: ${JSON.stringify(reel.endcard ?? "")}`,
  ];
  for (const phrase of banned) {
    const re = new RegExp(phrase, "i");
    for (const line of haystack) {
      if (re.test(line)) errors.push(`banned phrase /${phrase}/ found in ${line.slice(0, 80)}`);
    }
  }

  return {
    errors,
    warnings,
    timeline: tl,
    stats: { beats: n, words, wpm, duration: tl.duration, measured: tl.measured },
  };
}

async function main() {
  const i = process.argv.indexOf("--reel");
  const slug = i > 0 ? process.argv[i + 1] : null;
  if (!slug) throw new Error("usage: validate.mjs --reel <slug>");
  const dir = path.join(KIT, "reels", slug);
  const reel = JSON.parse(await readFile(path.join(dir, "reel.json"), "utf8"));
  const timingPath = path.join(dir, "timeline.json");
  const timing = existsSync(timingPath) ? JSON.parse(await readFile(timingPath, "utf8")) : null;
  const { errors, warnings, timeline, stats } = validateReel(reel, timing);

  if (timeline) {
    console.log(
      `${slug}: ${stats.beats} beats, ${stats.words} words, ${stats.duration.toFixed(2)}s, ${stats.wpm.toFixed(0)} wpm ${stats.measured ? "(measured)" : "(estimated: run the voice step)"}`,
    );
    for (const b of timeline.beats) {
      const mark = b.mood === "dark" ? "●" : " ";
      console.log(
        `  ${mark} ${b.start.toFixed(2).padStart(6)}  ${(b.end - b.start).toFixed(2)}s  ${String(b.words.length).padStart(2)}w  ${plainCaption(b.caption)}`,
      );
    }
  }
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(
    errors.length
      ? `FAILED (${errors.length} error${errors.length > 1 ? "s" : ""})`
      : `ok (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`,
  );
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
