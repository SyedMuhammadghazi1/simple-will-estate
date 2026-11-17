// One big number, no card: a label above, the figure counting to its value, a line below.
// Use it for the headline number of a beat ("$5,968", "160 h").
//
// spec: { label, value, from, prefix, suffix, unit, decimals, countAt, countDur,
//         color: "green" | "ink" | "red" | "muted", size, sub, subAt, w }

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
  return (v < 0 ? "−" : "") + commas(Number(whole)) + (frac ? `.${frac}` : "");
}

const prop = {
  build(el, spec) {
    const size = spec.size ?? 150;
    const w = spec.w ?? 900;
    box(el, w, size * 1.25 + 110);
    const wrap = h("div", {
      style: `position:absolute;inset:0;text-align:center`,
      html: `
        <div class="mono" style="font-size:22px;color:var(--muted);height:34px">${esc(spec.label ?? "")}</div>
        <div class="serif" style="font-size:${size}px;line-height:1.12;font-weight:500;letter-spacing:-0.02em;white-space:nowrap;color:${COLORS[spec.color ?? "ink"]};font-variant-numeric:tabular-nums">
          <span data-n></span><span style="font-style:italic;font-size:0.5em;margin-left:12px">${esc(spec.unit ?? "")}</span>
        </div>
        <div data-sub class="mono" style="font-size:21px;color:var(--muted);margin-top:8px;opacity:0">${esc(spec.sub ?? "")}</div>`,
    });
    el.appendChild(wrap);
    return { num: wrap.querySelector("[data-n]"), sub: wrap.querySelector("[data-sub]") };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const t0 = ctx.at(spec.countAt ?? 0);
    const dur = spec.countDur ?? 0.8;
    const p = ease.outCubic(prog(t, t0, t0 + dur));
    const v = lerp(spec.from ?? spec.value ?? 0, spec.value ?? 0, p);
    const decimals = spec.decimals ?? String(spec.value ?? 0).split(".")[1]?.length ?? 0;
    setText(state.num, `${spec.prefix ?? ""}${formatNumber(v, decimals)}${spec.suffix ?? ""}`);
    const subAt = spec.subAt != null ? ctx.at(spec.subAt) : t0 + dur;
    state.sub.style.opacity = clamp(prog(t, subAt, subAt + 0.25)).toFixed(3);
  },
  sfx(spec, ctx) {
    if (spec.from == null || spec.from === spec.value) return [];
    return [{ t: ctx.at(spec.countAt ?? 0), name: "counter", dur: spec.countDur ?? 0.8 }];
  },
};

export default prop;
