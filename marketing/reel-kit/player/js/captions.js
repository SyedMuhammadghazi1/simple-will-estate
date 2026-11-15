// Karaoke captions: each beat's sentence is laid out in full in a "ghost" tone, then every word
// turns to ink on the frame the voice reaches it. Accent words (wrapped in *asterisks* in
// reel.json) are italic from the start but grey; on their frame they take the accent colour and
// their underline appears at full width.
//
// The sentence being visible before it is spoken is deliberate: it lets sound-off viewers read
// ahead while the reveal keeps sound-on viewers in sync with the voice.

import { LAYOUT } from "./theme.js";
import { prog } from "./timing.js";

/** "You spent *three weeks* picking." -> [{ text, accent }] (one entry per whitespace token). */
export function parseCaption(markup) {
  const out = [];
  let accent = false;
  for (const raw of markup.trim().split(/\s+/)) {
    let text = raw;
    let isAccent = accent;
    if (text.startsWith("*")) {
      text = text.slice(1);
      accent = true;
      isAccent = true;
    }
    // a closing asterisk may be followed by punctuation that stays outside the accent: *week*,
    const close = text.match(/^(.*?)\*([.,!?;:…”"')]*)$/);
    let tail = "";
    if (close) {
      text = close[1];
      tail = close[2];
      accent = false;
    }
    out.push({ text, tail, accent: isAccent });
  }
  return out;
}

/** Plain text of a caption (accent markers stripped) — used for VO, SRT and validation. */
export function plainCaption(markup) {
  return parseCaption(markup)
    .map((w) => w.text + w.tail)
    .join(" ");
}

export function buildCaptions(layerEl, beats, { eyebrow = "" } = {}) {
  const brow = document.createElement("div");
  brow.className = "eyebrow";
  brow.textContent = eyebrow;
  brow.style.left = `${LAYOUT.SIDE}px`;
  brow.style.top = `${LAYOUT.eyebrowY}px`;
  layerEl.appendChild(brow);

  const blocks = beats.map((beat) => {
    const block = document.createElement("div");
    block.className = "cap";
    block.style.left = `${LAYOUT.SIDE}px`;
    block.style.top = `${LAYOUT.captionY}px`;
    block.style.width = `${LAYOUT.captionMaxW}px`;
    block.style.fontSize = `${beat.captionSize ?? LAYOUT.captionSize}px`;
    block.style.lineHeight = `${beat.captionLine ?? LAYOUT.captionLine}px`;
    // Lines are balanced by default (no stranded last word). A caption made of two sentences
    // can read better broken at the full stop: "captionWrap": "wrap" fills the first line.
    if (beat.captionWrap) block.style.textWrap = beat.captionWrap;
    // A one- or two-letter word ("a", "to", "is") stays with the word after it, so it is never
    // stranded at the end of a line. The words are inline blocks, where a no-break space does
    // not hold, so such a run is wrapped in a nowrap group instead.
    // "breakAfter": "gigs" (or a list of words) forces the line to end after that word, for a
    // caption that reads best broken at a full stop the wrapping would not choose.
    const plain = (s) => s.toLowerCase().replace(/[^a-z0-9$%]/g, "");
    const breaks = new Set([beat.breakAfter ?? []].flat().map(plain));
    let group = null;
    const spans = beat.words.map((w, i) => {
      const last = i === beat.words.length - 1;
      const forced = !last && breaks.has(plain(w.text));
      const short = !last && !forced && w.text.length <= 2 && !w.tail && !/[.,!?;:]$/.test(w.text);
      if (short && !group) {
        group = document.createElement("span");
        group.style.whiteSpace = "nowrap";
        block.appendChild(group);
      }
      const parent = group ?? block;
      const span = document.createElement("span");
      span.className = w.accent ? "w acc" : "w";
      span.textContent = w.text;
      parent.appendChild(span);
      if (w.tail) {
        const tail = document.createElement("span");
        tail.className = "w tail";
        tail.textContent = w.tail;
        parent.appendChild(tail);
        span._tail = tail;
      }
      if (short) parent.appendChild(document.createTextNode(" "));
      else {
        group = null;
        if (forced) {
          breaks.delete(plain(w.text)); // only the first match breaks
          block.appendChild(document.createElement("br"));
        } else if (!last) block.appendChild(document.createTextNode(" "));
      }
      return span;
    });
    layerEl.appendChild(block);
    return { block, spans };
  });

  /** Shrink any caption that wraps past `maxLines`. Returns human-readable warnings. */
  function fit(maxLines = 3) {
    const warnings = [];
    blocks.forEach(({ block }, i) => {
      let size = parseFloat(block.style.fontSize);
      const ratio = parseFloat(block.style.lineHeight) / size;
      const lines = () => Math.round(block.getBoundingClientRect().height / (size * ratio));
      block.style.visibility = "hidden";
      block.style.opacity = "1";
      const before = lines();
      while (lines() > maxLines && size > 50) {
        size -= 2;
        block.style.fontSize = `${size}px`;
        block.style.lineHeight = `${(size * ratio).toFixed(1)}px`;
      }
      if (before > maxLines) {
        warnings.push(
          `beat ${beats[i].id}: caption wrapped to ${before} lines, shrunk to ${size}px (cut words instead)`,
        );
      }
      block.style.visibility = "";
      block.style.opacity = "0";
    });
    return warnings;
  }

  // Measured on the reference, frame by frame:
  //  - the caption swaps in a single frame, fully laid out in the ghost tone (no fade, no slide);
  //  - a word turns to ink in ONE frame, about 50 ms before it is spoken, sitting 7.5 px low and
  //    rising to rest over five frames (the only motion in the caption);
  //  - an accent word is italic from the start but grey; on its frame it takes the accent colour
  //    and its underline appears at full width.
  const LEAD = 0.05;
  const RISE = 5 / 30;
  const DROP = 7.5;

  function update(t, active) {
    blocks.forEach(({ block, spans }, i) => {
      if (i !== active) {
        if (block._on !== false) {
          block.style.opacity = "0";
          block._on = false;
        }
        return;
      }
      if (block._on !== true) {
        block.style.opacity = "1";
        block._on = true;
      }
      const beat = beats[i];
      spans.forEach((span, k) => {
        // The first word of a beat lights one frame after the cut (the whole sentence is grey for
        // exactly one frame). Frame 0 is "swap + 1": the hook's first word is already lit on
        // the cover/loop frame. `prelit: n` inks the first n words from the beat's first frame,
        // which lets the hook read as a phrase ("No will?") on the autoplay still.
        let at = beat.words[k].t0 - LEAD;
        const prelit = beat.prelit ?? (i === 0 ? 1 : 0);
        if (k < prelit) at = beat.start - 1;
        else if (k === 0) at = Math.min(at, beat.start + 1 / 30 + 1e-6);
        const on = t >= at;
        const dy = on ? DROP * (1 - prog(t, at, at + RISE)) : 0;
        const key = on ? Math.round(dy * 10) : -1;
        if (span._k === key) return;
        span._k = key;
        const shift = dy > 0.05 ? `translateY(${dy.toFixed(2)}px)` : "";
        for (const el of span._tail ? [span, span._tail] : [span]) {
          el.classList.toggle("on", on);
          el.style.transform = shift;
        }
      });
    });
  }

  return { update, fit, blocks, eyebrowEl: brow };
}
