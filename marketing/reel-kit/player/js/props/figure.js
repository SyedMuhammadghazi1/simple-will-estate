// One big number, no card of its own: a label above, the figure, and an optional line below.
// Use it for the headline number of a beat ("$5,968", "160 h").
//
// spec: { label, value, from, prefix, suffix, unit, decimals, countAt, countDur, countEnd,
//         color: "green" | "ink" | "red" | "muted", size, sub, subAt, w }
//   countEnd  a cue the count should finish on (usually the word that says the number), so the
//             figure is moving while the sentence is spoken and lands with the voice. Without
//             `from` the number does not count: it is simply there.
//   sub       shown with the figure unless subAt says otherwise; with no sub there is no gap.

import { clamp, commas, ease, lerp, prog } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const COLORS = {
  green: "var(--green)",
  ink: "var(--ink)",
  red: "var(--red)",
  muted: "var(--muted)",
};

export function formatNumber(v, decimals) {
  const [whole, frac] = Math.abs(v).toFixed(decimals).split(".");
  return (v < 0 ? "\u2212" : "") + commas(Number(whole)) + (frac ? `.${frac}` : "");
}

const prop = {
  build(el, spec) {
    const size = spec.size ?? 150;
    const w = spec.w ?? 820;
    const labelH = spec.label ? 46 : 0;
    const subH = spec.sub ? 50 : 0;
    box(el, w, labelH + size * 1.16 + subH);
    const wrap = h("div", {
      style: `position:absolute;inset:0;text-align:center`,
      html: `
        ${spec.label ? `<div class="mono" style="font-size:27px;line-height:34px;height:${labelH}px;color:var(--muted);white-space:nowrap">${esc(spec.label)}</div>` : ""}
        <div class="serif" style="font-size:${size}px;line-height:1.16;font-weight:500;letter-spacing:-0.02em;white-space:nowrap;color:${COLORS[spec.color ?? "ink"]};font-variant-numeric:tabular-nums">
          <span data-n></span>${spec.unit ? `<span style="font-size:0.42em;margin-left:14px;letter-spacing:0">${esc(spec.unit)}</span>` : ""}
        </div>
        ${spec.sub ? `<div data-sub class="mono" style="font-size:26px;line-height:34px;color:var(--muted);margin-top:12px;white-space:nowrap">${esc(spec.sub)}</div>` : ""}`,
    });
    el.appendChild(wrap);
    return { num: wrap.querySelector("[data-n]"), sub: wrap.querySelector("[data-sub]") };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const value = spec.value ?? 0;
    const counts = spec.from != null && spec.from !== value;
    const t0 = ctx.at(spec.countAt ?? 0);
    const t1 = spec.countEnd != null ? ctx.at(spec.countEnd) : t0 + (spec.countDur ?? 0.8);
    const p = counts ? ease.outCubic(prog(t, t0, Math.max(t0 + 0.2, t1))) : 1;
    const v = lerp(counts ? spec.from : value, value, p);
    const decimals = spec.decimals ?? String(value).split(".")[1]?.length ?? 0;
    setText(state.num, `${spec.prefix ?? ""}${formatNumber(v, decimals)}${spec.suffix ?? ""}`);
    if (state.sub) {
      const at = spec.subAt != null ? ctx.at(spec.subAt) : -1;
      state.sub.style.opacity = clamp(prog(t, at, at + 0.25)).toFixed(3);
    }
  },
  sfx(spec, ctx) {
    if (spec.from == null || spec.from === spec.value) return [];
    const t0 = ctx.at(spec.countAt ?? 0);
    const t1 = spec.countEnd != null ? ctx.at(spec.countEnd) : t0 + (spec.countDur ?? 0.8);
    return [{ t: t0, name: "counter", dur: Math.max(0.2, t1 - t0) }];
  },
};

export default prop;
