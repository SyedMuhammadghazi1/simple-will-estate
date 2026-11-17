// A press-cutting card: an outlet line, a headline, a quote with one word lit on cue, and an
// attribution under the card. Text only: no logos or photos from the publication.
//
// spec: { source, date, headline, quote, highlight, highlightAt, by, role, w }

import { clamp, prog } from "../timing.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const w = spec.w ?? 760;
    box(el, w, 470);
    const q = esc(spec.quote ?? "");
    const word = spec.highlight ? esc(spec.highlight) : null;
    const quoteHtml = word
      ? q.replace(word, `<span data-hi style="color:inherit">${word}</span>`)
      : q;
    const card = h("div", {
      class: "card",
      style: `position:absolute;left:0;top:0;width:${w}px;padding:26px 32px 30px;`,
      html: `
        <div style="display:flex;justify-content:space-between;white-space:nowrap">
          <span class="mono" style="font-size:21px;color:var(--ink)">${esc(spec.source ?? "")}</span>
          <span class="mono" style="font-size:21px;color:var(--muted)">${esc(spec.date ?? "")}</span>
        </div>
        <div class="serif" style="font-size:44px;line-height:1.15;font-weight:560;color:var(--ink);margin-top:18px">${esc(spec.headline ?? "")}</div>
        <div class="serif" style="margin-top:22px;padding-left:22px;border-left:5px solid var(--green);font-size:36px;line-height:1.3;font-style:italic;color:var(--muted)">${quoteHtml}</div>`,
    });
    const by = h("div", {
      style: "position:absolute;left:0;right:0;top:100%;margin-top:22px;text-align:center",
      html: `<div class="mono" style="font-size:22px;color:var(--ink)">${esc(spec.by ?? "")}</div>
             <div class="mono" style="font-size:19px;color:var(--muted);margin-top:6px">${esc(spec.role ?? "")}</div>`,
    });
    card.appendChild(by);
    el.appendChild(card);
    return { hi: card.querySelector("[data-hi]") };
  },
  update(state, t, ctx) {
    if (!state.hi) return;
    const at = ctx.at(ctx.spec.highlightAt ?? 0.8);
    const on = clamp(prog(t, at, at + 0.12));
    state.hi.style.color = on > 0.5 ? "var(--green)" : "inherit";
    state.hi.style.fontWeight = on > 0.5 ? "650" : "inherit";
  },
  sfx(spec, ctx) {
    return spec.highlight ? [{ t: ctx.at(spec.highlightAt ?? 0.8), name: "tick", gain: 1.1 }] : [];
  },
};

export default prop;
