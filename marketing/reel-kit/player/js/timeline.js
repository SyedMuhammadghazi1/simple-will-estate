// Turns reel.json (+ the measured voice timings, when they exist) into absolute times.
// Pure and DOM-free so the Node scripts (validate, subtitles, audio cues) share one clock with
// the player.

import { parseCaption } from "./captions.js";

export const DEFAULTS = {
  fps: 30,
  wpm: 172, // reference narration pace; only used to estimate timing before the voice exists
  beatGap: 0.16, // silence after a beat's last word before the next caption
  beatLead: 0.1, // caption is on screen this long before its first word is spoken
  endcardHold: 2.5,
  loopDur: 0.4,
};

export const normWord = (s) => s.toLowerCase().replace(/[^a-z0-9$%]/g, "");

function estimateBeat(words, start, wpm, gap, lead) {
  const perUnit = 60 / wpm / 6.2; // an average English word is ~4.2 letters + 2 units of "space"
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
  const beats = [];
  let cursor = 0;
  reel.beats.forEach((beat, index) => {
    const words = parseCaption(beat.caption);
    let start;
    let end;
    let timed;
    const measured = timing?.beats?.[index];
    if (measured) {
      if (measured.words.length !== words.length) {
        throw new Error(
          `timeline.json is stale for beat "${beat.id}": ${measured.words.length} timed words vs ${words.length} caption words. Re-run the voice step.`,
        );
      }
      start = measured.start;
      end = measured.end;
      timed = words.map((w, i) => ({ ...w, t0: measured.words[i].t0, t1: measured.words[i].t1 }));
    } else {
      start = cursor;
      const est = estimateBeat(words, start, wpm, beat.gap ?? DEFAULTS.beatGap, DEFAULTS.beatLead);
      timed = est.words;
      end = Math.max(est.end, start + 1.2);
    }
    cursor = end;
    beats.push({ ...beat, index, start, end, words: timed });
  });

  const hold = reel.endcard?.hold ?? DEFAULTS.endcardHold;
  const endcard = reel.endcard ? { start: cursor, end: cursor + hold } : null;
  const raw = endcard ? endcard.end : cursor;
  // whole number of frames so the encoder never has to round the last one
  const duration = Math.round(raw * fps) / fps;
  const loopDur = reel.loop === false ? 0 : (reel.loop?.dur ?? DEFAULTS.loopDur);
  return {
    fps,
    duration,
    frames: Math.round(duration * fps),
    beats,
    endcard,
    loop: loopDur > 0 ? { start: duration - loopDur, dur: loopDur } : null,
    measured: Boolean(timing),
  };
}

/**
 * Resolve a cue to an absolute time. Cues: number (seconds from the beat start), "w:3" (4th
 * word), "w:stroller" (first word matching), "beat:1" (start of the 2nd spanned beat), "end"
 * (end of the last spanned beat). An optional "+0.2" / "-0.1" offset may follow.
 */
export function resolveAt(cue, beat, spanned = [beat]) {
  if (typeof cue === "number") return beat.start + cue;
  if (cue == null) return beat.start;
  const m = String(cue).match(/^(.*?)([+-]\d*\.?\d+)?$/);
  const base = m[1];
  const offset = m[2] ? parseFloat(m[2]) : 0;
  const allWords = spanned.flatMap((b) => b.words);
  let t;
  if (base === "end") t = spanned[spanned.length - 1].end;
  else if (base === "start" || base === "") t = beat.start;
  else if (base.startsWith("beat:")) t = (spanned[parseInt(base.slice(5), 10)] ?? beat).start;
  else if (base.startsWith("w:")) {
    const key = base.slice(2);
    const word = /^\d+$/.test(key)
      ? allWords[parseInt(key, 10)]
      : allWords.find((w) => normWord(w.text) === normWord(key));
    if (!word) throw new Error(`cue "${cue}" in beat "${beat.id}" does not match any caption word`);
    t = word.t0;
  } else if (!Number.isNaN(parseFloat(base))) t = beat.start + parseFloat(base);
  else throw new Error(`unknown cue "${cue}" in beat "${beat.id}"`);
  return t + offset;
}
