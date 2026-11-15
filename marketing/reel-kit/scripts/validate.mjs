#!/usr/bin/env node
// Lints a reel.json against the template's "beat grammar" — the structural rules measured on the
// reference reel (see docs/TEMPLATE-SPEC.md). Errors mean the reel will not build or breaks the
// format; warnings mean it will build but drifts from what made the format work.
//
//   node marketing/reel-kit/scripts/validate.mjs --reel plainwill-no-will
//
// --estimate ignores timeline.json (used before the voice step, when the wording may have changed).

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCaption, plainCaption } from "../player/js/captions.js";
import { FACES, POSES } from "../player/js/mascot.js";
import { PROPS } from "../player/js/props/index.js";
import { THEMES } from "../player/js/theme.js";
import { buildTimeline, cueMatches, resolveAt } from "../player/js/timeline.js";
import { applyVariant, variantNames } from "./variant.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The numbers below come from the reference: 13 beats in 34 s, beats 1.2-4.3 s, 4-14 words per
// caption, 173 wpm overall, every caption carrying 1-3 accent words, one dark beat at ~75%.
export const RULES = {
  fps: 30,
  duration: { min: 18, ideal: [24, 40], max: 90 },
  beats: { min: 7, max: 16 },
  beat: { minDur: 1.1, maxDur: 5.0, maxWords: 14, maxChars: 84 },
  hook: { maxDur: 3.5, maxWords: 9 },
  accents: { min: 1, max: 4 },
  wpm: { min: 150, max: 205 },
  darkAfter: 0.5, // a mood flip belongs in the back half, as the last jolt before the ask
  noteMin: 2.0, // a footnote chip has to be up long enough to be read
};

/** Effect names the mixer can play: read from mix.py's SFX table, the single source of truth. */
export function sfxNames() {
  const src = readFileSync(path.join(KIT, "scripts", "mix.py"), "utf8");
  const table = src.slice(src.indexOf("\nSFX = {"), src.indexOf("\n}\n", src.indexOf("\nSFX = {")));
  return new Set([...table.matchAll(/^\s+"([\w-]+)":\s*\(/gm)].map((m) => m[1]));
}

// keys whose values are settings, not text a viewer reads
const NOT_COPY = new Set([
  "id",
  "type",
  "theme",
  "enter",
  "exit",
  "face",
  "pose",
  "mood",
  "engine",
  "voice",
  "until",
  "color",
  "bg",
  "stampColor",
  "tagColor",
  "at",
  "delay",
  "about",
]);

/** Every cue inside a prop spec: values under `at`, `delay`, `*At`, and the entries of `hits`. */
function collectCues(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectCues(item, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "hits" && Array.isArray(value)) out.push(...value);
      else if ((key === "at" || key === "delay" || /At$/.test(key)) && typeof value !== "object") {
        out.push(value);
      } else collectCues(value, out);
    }
  }
  return out;
}

/** Every string a viewer can read (captions, prop text, fine print, end card), flattened. */
function collectCopy(node, out = []) {
  if (typeof node === "string") out.push(node.replace(/[*\s]+/g, " ").trim());
  else if (Array.isArray(node)) for (const item of node) collectCopy(item, out);
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (NOT_COPY.has(key) || /At$/.test(key) || key === "hits" || key === "lint") continue;
      collectCopy(value, out);
    }
  }
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lines that contain a banned phrase, as error messages. Bad patterns are reported once. */
export function bannedIn(lines, banned = [], seenErrors = [], where = "") {
  const found = [];
  for (const phrase of banned ?? []) {
    let re;
    try {
      const m = String(phrase).match(/^\/(.+)\/$/);
      re = new RegExp(m ? m[1] : escapeRegex(String(phrase)), "i");
    } catch {
      const msg = `lint.banned: "${phrase}" is not a valid pattern`;
      if (!seenErrors.includes(msg) && !found.includes(msg)) found.push(msg);
      continue;
    }
    for (const line of lines) {
      if (re.test(line)) {
        found.push(`banned phrase "${phrase}" found in ${where}"${line.slice(0, 70)}"`);
      }
    }
  }
  return found;
}

/** The fenced blocks of a Markdown file: the copy someone will paste (caption, DM reply). */
export function fencedBlocks(markdown) {
  return [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].flatMap((m) =>
    m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

/**
 * @returns {{ errors: string[], warnings: string[], timeline: object, stats: object }}
 */
export function validateReel(reel, timing = null) {
  const errors = [];
  const warnings = [];
  const fail = (extra = []) => ({
    errors: [...errors, ...extra],
    warnings,
    timeline: null,
    stats: {},
  });
  if (!Array.isArray(reel.beats) || reel.beats.length === 0) {
    return fail(["reel.beats must be a non-empty array"]);
  }
  if ((reel.fps ?? RULES.fps) !== RULES.fps)
    errors.push(`fps must be ${RULES.fps}: the motion rules are measured in frames`);
  if (reel.theme && !THEMES[reel.theme])
    errors.push(`unknown theme "${reel.theme}" (have: ${Object.keys(THEMES).join(", ")})`);

  const ids = new Set();
  for (const beat of reel.beats) {
    if (!beat.id) errors.push("every beat needs an id");
    if (ids.has(beat.id)) errors.push(`duplicate beat id "${beat.id}"`);
    ids.add(beat.id);
    if (typeof beat.caption !== "string" || !beat.caption.trim()) {
      errors.push(`beat "${beat.id}": caption is required`);
      continue;
    }
    // After parsing, no asterisk may survive and every accent must have been closed; that
    // catches markers the parser cannot pair up (e.g. a closing * followed by a dash).
    const parsed = parseCaption(beat.caption);
    const count = (beat.caption.match(/\*/g) ?? []).length;
    if (count % 2 !== 0 || parsed.some((w) => (w.text + w.tail).includes("*"))) {
      errors.push(
        `beat "${beat.id}": unbalanced or misplaced * accent markers in "${beat.caption}"`,
      );
    }
    if (beat.props != null && !Array.isArray(beat.props)) {
      errors.push(`beat "${beat.id}": "props" must be an array (use "prop" for a single one)`);
    }
  }
  if (reel.music && reel.music.until && reel.music.until !== "end" && !ids.has(reel.music.until)) {
    errors.push(`music.until "${reel.music.until}" is not a beat id (or "end")`);
  }
  if (errors.length) return fail();

  let tl;
  try {
    tl = buildTimeline(reel, timing);
  } catch (err) {
    return fail([err.message]);
  }

  const n = tl.beats.length;
  if (n < RULES.beats.min || n > RULES.beats.max) {
    warnings.push(`${n} beats; the format works with ${RULES.beats.min}-${RULES.beats.max}`);
  }
  if (tl.duration > RULES.duration.max) {
    errors.push(`duration ${tl.duration.toFixed(1)}s exceeds ${RULES.duration.max}s`);
  } else if (tl.duration < RULES.duration.min) {
    warnings.push(
      `duration ${tl.duration.toFixed(1)}s is too short for the arc (under ${RULES.duration.min}s)`,
    );
  } else if (tl.duration < RULES.duration.ideal[0] || tl.duration > RULES.duration.ideal[1]) {
    warnings.push(
      `duration ${tl.duration.toFixed(1)}s is outside the ${RULES.duration.ideal.join("-")}s sweet spot`,
    );
  }

  const checkCue = (cue, beat, spanned) => {
    try {
      resolveAt(cue, beat, spanned);
    } catch (err) {
      errors.push(err.message);
      return;
    }
    const hits = cueMatches(cue, spanned);
    if (hits > 1) {
      warnings.push(
        `beat "${beat.id}": cue "${cue}" matches ${hits} words and uses the first; add an occurrence, e.g. "${String(cue).replace(/^(w:[^#+-]+)/, "$1#2")}"`,
      );
    }
  };

  const known = sfxNames();
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
      for (const cue of collectCues(spec)) checkCue(cue, beat, spanned);
      if (spec.type === "note") {
        // the caveat is part of the claim: it has to be readable, not merely present
        let shown = 0;
        try {
          shown = spanned[spanned.length - 1].end - resolveAt(spec.delay ?? 0, beat, spanned);
        } catch {
          shown = RULES.noteMin; // the bad cue is already reported above
        }
        if (shown < RULES.noteMin) {
          warnings.push(
            `beat "${beat.id}": the note "${String(spec.text).split("\n")[0]}" is on screen ${shown.toFixed(1)}s; bring it in earlier (at least ${RULES.noteMin}s to be read)`,
          );
        }
      }
      if (i === 0 && spec.delay == null && (spec.enter ?? "right") !== "none") {
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
    if (parsed.some((w) => !/[a-z0-9]/i.test(w.text))) {
      warnings.push(
        `beat "${beat.id}": a caption token has no letters or digits (a lone dash or "&"); the voice cannot be timed to it`,
      );
    }
    for (const cue of beat.sfx ?? []) {
      if (!known.has(cue.name))
        errors.push(
          `beat "${beat.id}": unknown sound "${cue.name}" (have: ${[...known].join(", ")})`,
        );
    }
    for (const cue of [...(beat.mascot ?? []), ...(beat.sfx ?? [])]) {
      checkCue(cue.at ?? 0, beat, [beat]);
      if (cue.face && !FACES[cue.face])
        errors.push(`beat "${beat.id}": unknown mascot face "${cue.face}"`);
      if (cue.pose && !POSES[cue.pose])
        errors.push(`beat "${beat.id}": unknown mascot pose "${cue.pose}"`);
    }
  });
  if (reel.cover?.at != null) checkCue(reel.cover.at, tl.beats[0], tl.beats);

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
  if (!reel.endcard)
    warnings.push("no endcard: the format ends on a follow card that loops back to frame 0");
  if (reel.endcard?.say) {
    const said = parseCaption(reel.endcard.say).length;
    const shown = parseCaption(String(reel.endcard.headline ?? "")).length;
    if (said !== shown) {
      warnings.push(
        `endcard.say has ${said} words and endcard.headline ${shown}: the headline only follows the voice word by word when they match`,
      );
    }
  } else if (reel.endcard && (reel.endcard.hold ?? 2.5) > 3) {
    warnings.push(
      "the end card holds over 3s in silence: give it a spoken line (endcard.say) or shorten endcard.hold",
    );
  }
  if (reel.loop === false)
    warnings.push("loop is off: the reference dissolves back into frame 0 so replays are seamless");

  // Per-reel phrase guard, e.g. claims a regulated business must never make. It reads every
  // string a viewer can see (captions, prop text, fine print, eyebrow, end card). Phrases are
  // literal and case-insensitive; wrap one in /slashes/ to use a regular expression.
  const copy = collectCopy({ ...reel, voice: undefined, music: undefined });
  errors.push(...bannedIn(copy, reel.lint?.banned, errors));

  // Disclosures the reel must carry, e.g. { "field": "endcard.disclaimer", "includes": [...] }.
  // Without this a reel with its fine print deleted would still validate.
  for (const rule of reel.lint?.require ?? []) {
    const value = String(rule.field ?? "")
      .split(".")
      .reduce((node, key) => node?.[key], reel);
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`lint.require: "${rule.field}" is missing`);
      continue;
    }
    for (const phrase of rule.includes ?? []) {
      if (!value.toLowerCase().includes(String(phrase).toLowerCase())) {
        errors.push(`lint.require: "${rule.field}" must include "${phrase}"`);
      }
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
  if (!slug) throw new Error("usage: validate.mjs --reel <slug> [--estimate]");
  const dir = path.join(KIT, "reels", slug);
  const reel = JSON.parse(await readFile(path.join(dir, "reel.json"), "utf8"));
  const timingPath = path.join(dir, "timeline.json");
  const useTiming = !process.argv.includes("--estimate") && existsSync(timingPath);
  const timing = useTiming ? JSON.parse(await readFile(timingPath, "utf8")) : null;
  const { errors, warnings, timeline, stats } = validateReel(reel, timing);

  // the copy that is posted with the reel is held to the same phrase guard
  const kit = path.join(dir, "POSTING-KIT.md");
  if (existsSync(kit) && reel.lint?.banned) {
    const lines = fencedBlocks(await readFile(kit, "utf8"));
    errors.push(...bannedIn(lines, reel.lint.banned, errors, "POSTING-KIT.md: "));
  }
  // every variant has to stand on its own (its timing is only ever estimated here)
  for (const name of variantNames(reel)) {
    try {
      const res = validateReel(applyVariant(reel, name), null);
      for (const e of res.errors) errors.push(`variant "${name}": ${e}`);
      for (const w of res.warnings) {
        if (!warnings.includes(w)) warnings.push(`variant "${name}": ${w}`);
      }
    } catch (err) {
      errors.push(`variant "${name}": ${err.message}`);
    }
  }

  if (timeline) {
    const basis = stats.measured ? "(measured)" : "(estimated: timing comes from the voice step)";
    console.log(
      `${slug}: ${stats.beats} beats, ${stats.words} words, ${stats.duration.toFixed(2)}s, ${stats.wpm.toFixed(0)} wpm ${basis}`,
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
