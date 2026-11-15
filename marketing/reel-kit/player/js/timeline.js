// Turns reel.json (+ the measured voice timings, when they exist) into absolute times.
// Pure and DOM-free so the Node scripts (validate, subtitles, audio cues) share one clock with
// the player.

import { parseCaption, plainCaption } from "./captions.js";

export const DEFAULTS = {
  fps: 30,
  wpm: 172, // reference narration pace; only used to estimate timing before the voice exists
  beatGap: 0.16, // silence after a beat's last word before the next caption
  beatLead: 0.1, // caption is on screen this long before its first word is spoken
  endcardHold: 2.5,
  endcardLead: 0.3, // the end card's spoken line starts this long after the card appears
  endcardTail: 0.9, // and the card stays at least this long after the line ends
  loopDur: 0.4,
};

export const normWord = (s) => s.toLowerCase().replace(/[^a-z0-9$%]/g, "");

function estimateBeat(words, start, wpm, gap, lead) {
  // `wpm` is the overall pace including pauses; words themselves are spoken ~19% faster (the
  // reference: 173 wpm overall, ~205 wpm while talking). An average caption word is ~4.2 letters
  // plus 2 units of "space".
  const perUnit = 60 / (wpm * 1.19) / 6.2;
  let t = start + lead;
  const timed = words.map((w) => {
    const dur =
      (normWord(w.text).length + 2) * perUnit + (/[.,!?;:]$/.test(w.text + w.tail) ? 0.09 : 0);
    const out = { ...w, t0: t, t1: t + dur * 0.88 };
    t += dur;
    return out;
  });
  return { words: timed, end: t + gap };
}

/**
 * @param reel    parsed reel.json
 * @param timing  parsed timeline.json from scripts/vo.py, or null to estimate from word counts
 */
export function buildTimeline(reel, timing = null) {
  const fps = reel.fps ?? DEFAULTS.fps;
  const wpm = reel.voice?.wpm ?? DEFAULTS.wpm;
  // Every cut lands exactly on a frame. Snapping here (rather than trusting the file) means
  // "beat.start <= frameTime" can never be off by one because of a rounded decimal.
  const snap = (t) => Math.round(t * fps) / fps;
  const beats = [];
  let cursor = 0;
  reel.beats.forEach((beat, index) => {
    const words = parseCaption(beat.caption);
    let start;
    let end;
    let timed;
    const measured = timing?.beats?.[index];
    if (measured) {
      const reworded = measured.text != null && measured.text !== plainCaption(beat.caption);
      if (measured.words.length !== words.length || reworded) {
        throw new Error(
          `timeline.json is stale for beat "${beat.id}": the caption changed after the voice was generated. Re-run the voice step.`,
        );
      }
      start = snap(measured.start);
      end = snap(measured.end);
      timed = words.map((w, i) => ({ ...w, t0: measured.words[i].t0, t1: measured.words[i].t1 }));
    } else {
      start = cursor;
      const est = estimateBeat(words, start, wpm, beat.gap ?? DEFAULTS.beatGap, DEFAULTS.beatLead);
      timed = est.words;
      end = snap(Math.max(est.end, start + 1.2));
    }
    cursor = end;
    beats.push({ ...beat, index, start, end, words: timed });
  });

  const hold = reel.endcard?.hold ?? DEFAULTS.endcardHold;
  let endcard = null;
  if (reel.endcard) {
    endcard = { start: cursor, end: snap(cursor + hold), words: [] };
    // An end card may be spoken (`endcard.say`): the voice step times it like a beat, and the
    // card never ends before the line does.
    const say = reel.endcard.say;
    if (say) {
      const words = parseCaption(say);
      const measured = timing?.endcard;
      if (timing && (!measured || measured.text !== plainCaption(say))) {
        throw new Error(
          "timeline.json is stale for the end card: endcard.say changed after the voice was generated. Re-run the voice step.",
        );
      }
      endcard.words = measured
        ? words.map((w, i) => ({ ...w, t0: measured.words[i].t0, t1: measured.words[i].t1 }))
        : estimateBeat(words, cursor, wpm, 0, reel.endcard.lead ?? DEFAULTS.endcardLead).words;
      const spokenEnd = endcard.words[endcard.words.length - 1].t1;
      endcard.end = snap(Math.max(endcard.end, spokenEnd + DEFAULTS.endcardTail));
    }
  }
  const duration = endcard ? endcard.end : cursor;
  const loopDur = reel.loop === false ? 0 : (reel.loop?.dur ?? DEFAULTS.loopDur);
  return {
    fps,
    duration,
    frames: Math.round(duration * fps),
    beats,
    endcard,
    loop: loopDur > 0 ? { start: snap(duration - loopDur), dur: loopDur } : null,
    measured: Boolean(timing),
  };
}

/**
 * How many caption words in the span a word cue would match. More than one means the cue should
 * carry an occurrence selector ("w:you#2"); the validator warns about it.
 */
export function cueMatches(cue, spanned) {
  if (typeof cue !== "string" || !cue.startsWith("w:") || cue.includes("#")) return 1;
  const all = spanned.flatMap((b) => b.words);
  const count = (key) => all.filter((w) => normWord(w.text) === normWord(key)).length;
  const whole = count(cue.slice(2));
  if (whole) return whole;
  const base = cue.match(/^w:(.*?)([+-]\d*\.?\d+)?$/)[1];
  return /^\d+$/.test(base) ? 1 : count(base);
}

function findWord(key, nth, allWords) {
  const hits = allWords.filter((w) => normWord(w.text) === normWord(key));
  return hits[nth === undefined ? 0 : parseInt(nth, 10) - 1];
}

/**
 * Resolve a cue to an absolute time.
 *
 *   0.4            seconds from the beat start
 *   "w:judge"      the first word that matches "judge" (case and punctuation ignored)
 *   "w:you#2"      the 2nd word that matches "you"
 *   "i:3"          the 4th caption word (0-based index across the spanned beats);
 *                  "w:3" means the same unless the caption contains the word "3"
 *   "beat:1"       start of the 2nd beat a spanning prop covers
 *   "end"          end of the last spanned beat
 *
 * Any string cue may end with an offset in seconds: "w:judge+0.2", "end-0.5". A word that itself
 * ends in "-digits" ("w:covid-19") is matched as a word first.
 */
export function resolveAt(cue, beat, spanned = [beat]) {
  if (typeof cue === "number") return beat.start + cue;
  if (cue == null) return beat.start;
  const text = String(cue);
  const allWords = spanned.flatMap((b) => b.words);
  // the whole thing as a word, before anything is read as an offset
  if (text.startsWith("w:")) {
    const [key, nth] = text.slice(2).split("#");
    const whole = nth === undefined || /^\d+$/.test(nth) ? findWord(key, nth, allWords) : null;
    if (whole) return whole.t0;
  }
  const m = text.match(/^(.*?)([+-]\d*\.?\d+)?$/);
  const base = m[1];
  const offset = m[2] ? parseFloat(m[2]) : 0;
  let t;
  if (base === "end") t = spanned[spanned.length - 1].end;
  else if (base === "start" || base === "") t = beat.start;
  else if (base.startsWith("beat:")) {
    const target = spanned[parseInt(base.slice(5), 10)];
    if (!target) {
      throw new Error(
        `cue "${cue}" in beat "${beat.id}" points past the ${spanned.length} beat(s) the prop spans`,
      );
    }
    t = target.start;
  } else if (base.startsWith("w:") || base.startsWith("i:")) {
    const [key, nth] = base.slice(2).split("#");
    let word = base.startsWith("w:") ? findWord(key, nth, allWords) : undefined;
    if (!word && /^\d+$/.test(key) && nth === undefined) word = allWords[parseInt(key, 10)];
    if (!word) throw new Error(`cue "${cue}" in beat "${beat.id}" does not match any caption word`);
    t = word.t0;
  } else if (!Number.isNaN(parseFloat(base))) t = beat.start + parseFloat(base);
  else throw new Error(`unknown cue "${cue}" in beat "${beat.id}"`);
  return t + offset;
}
