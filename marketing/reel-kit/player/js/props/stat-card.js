// A big number that counts up to a value, with a small label above and a caption below.
// spec: { label, value, from, prefix, suffix, unit, note, countAt, countDur, w, decimals }
// `decimals` defaults to the number of decimal places written in `value` (67.5 stays 67.5).

import { clamp, commas, ease, lerp, prog } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const prop = {
  build(el, spec) {
    const w = spec.w ?? 520;
    box(el, w, 250);
    const card = h("div", {
      class: "card",
      style: `width:${w}px;height:250px;padding:26px 34px;`,
      html: `
        <div class="mono" style="font-size:22px;color:var(--muted)">${esc(spec.label ?? "")}</div>
        <div class="serif" style="font-size:118px;line-height:1.08;font-weight:560;letter-spacing:-0.02em;white-space:nowrap">
          <span data-n></span><span style="font-style:italic;color:var(--accent);font-size:0.56em;margin-left:14px">${esc(spec.unit ?? "")}</span>
        </div>
        <div style="margin-top:6px;border-top:3px solid var(--cardAlt);padding-top:12px;font-weight:650;font-size:27px;color:var(--green)" data-note>${esc(spec.note ?? "")}</div>`,
    });
    el.appendChild(card);
    return { num: card.querySelector("[data-n]"), note: card.querySelector("[data-note]") };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const t0 = ctx.at(spec.countAt ?? 0.15);
    const dur = spec.countDur ?? Math.max(0.6, ctx.dur - t0 - 0.35);
    const p = ease.outCubic(prog(t, t0, t0 + dur));
    const v = lerp(spec.from ?? 0, spec.value ?? 0, p);
    const decimals = spec.decimals ?? String(spec.value ?? 0).split(".")[1]?.length ?? 0;
    const [whole, frac] = v.toFixed(decimals).split(".");
    const shown = commas(Number(whole)) + (frac ? `.${frac}` : "");
    setText(state.num, `${spec.prefix ?? ""}${shown}${spec.suffix ?? ""}`);
    state.note.style.opacity = clamp(prog(t, t0 + dur * 0.5, t0 + dur * 0.5 + 0.2)).toFixed(3);
  },
  sfx(spec, ctx) {
    const t0 = ctx.at(spec.countAt ?? 0.15);
    return [{ t: t0, name: "counter", dur: spec.countDur ?? Math.max(0.6, ctx.dur - t0 - 0.35) }];
  },
};

export default prop;
