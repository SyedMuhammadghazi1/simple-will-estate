// A small footnote chip: the honest caveat or the source for a claim, set in mono so it reads as
// "the fine print" without competing with the caption. The reference reel does the same thing
// ("* only clip streamers who allow it") — keeping the caveat on screen is part of the format.
//
// spec: { text, w }   Use "\n" for more lines. Usually combined with enter: "pop" and a
// `delay` cue so it appears on the word it qualifies. The chip is as wide as its longest line
// needs (the type is monospaced, so that is known); `w` can only make it wider.

import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const lines = String(spec.text ?? "").split("\n");
    // 27px DM Mono advances 16.2px per character; 36px of padding and 5px of border
    const need = Math.ceil(Math.max(...lines.map((l) => l.length)) * 16.2 + 42);
    const w = Math.max(spec.w ?? 0, need);
    box(el, w, 30 + lines.length * 36);
    el.appendChild(
      h("div", {
        style: `position:absolute;inset:0;padding:14px 18px 16px;background:var(--card);border:2.5px solid var(--line);border-radius:10px;font:500 27px/36px var(--font-mono);letter-spacing:0;color:var(--ink);white-space:pre;box-shadow:5px 6px 0 var(--shadow)`,
        html: lines.map((l) => esc(l)).join("<br>"),
      }),
    );
    return {};
  },
  update() {},
};

export default prop;
