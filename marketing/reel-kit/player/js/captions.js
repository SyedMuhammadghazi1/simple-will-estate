// Karaoke captions: each beat's sentence is laid out in full in a "ghost" tone, then every word
// turns to ink on the frame the voice reaches it. Accent words (wrapped in *asterisks* in
// reel.json) are italic, tinted before they are spoken, and get an underline that draws in.
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
    const spans = beat.words.map((w, i) => {
      const span = document.createElement("span");
      span.className = w.accent ? "w acc" : "w";
      span.textContent = w.text;
      block.appendChild(span);
      if (w.tail) {
        const tail = document.createElement("span");
        tail.className = "w tail";
        tail.textContent = w.tail;
        block.appendChild(tail);
        span._tail = tail;
      }
      if (i < beat.words.length - 1) block.appendChild(document.createTextNode(" "));
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
        const at = beat.words[k].t0 - LEAD;
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
