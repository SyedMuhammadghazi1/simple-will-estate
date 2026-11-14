// A small footnote chip: the honest caveat or the source for a claim, set in mono so it reads as
// "the fine print" without competing with the caption. The reference reel does the same thing
// ("* only clip streamers who allow it") — keeping the caveat on screen is part of the format.
//
// spec: { text, at, w }   Use "\n" for a second line. Usually combined with enter: "pop".

import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const lines = String(spec.text ?? "").split("\n");
    const w = spec.w ?? 380;
    box(el, w, 30 + lines.length * 30);
    el.appendChild(
      h("div", {
        style: `position:absolute;inset:0;padding:14px 18px;background:var(--card);border:2.5px solid var(--line);border-radius:10px;font:400 21px/30px var(--font-mono);letter-spacing:0.02em;color:var(--ink);white-space:nowrap;box-shadow:5px 6px 0 var(--shadow)`,
        html: lines.map((l) => esc(l)).join("<br>"),
      }),
    );
    return {};
  },
  update() {},
};

export default prop;
