// A big number over a bar that fills on cue: how much of something a thing takes up ("212 GB of
// a 364 GB drive"), or progress toward done. A tag can land when the fill finishes.
//
// spec: {
//   title, kicker,                    small labels above
//   value, unit, from, decimals,      the number that counts up (and what the bar fills to)
//   total, totalLabel,                what the bar is measured against (default: value itself,
//                                     i.e. the bar fills completely) and the text under its end
//   caption,                          one line under the bar
//   fillAt, fillDur,                  when the fill starts and how long it takes
//   rescale: { total, totalLabel, at }  later, measure the same value against something else:
//                                     the bar moves to value/total ("...of a 364 GB drive").
//                                     An array of these steps runs them one after another.
//   tag, tagAt, tagColor              sticker that pops in (defaults to when the fill ends, or
//                                     to just after the last rescale)
// }

import { clamp, commas, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const ZOOM = 0.45; // seconds a rescale takes
const steps = (spec) => (spec.rescale ? [spec.rescale].flat() : []);

const prop = {
  build(el, spec) {
    const w = spec.w ?? 600;
    const hgt = spec.caption ? 348 : 300;
    box(el, w, hgt);
    const card = h("div", {
      class: "card",
      style: `position:absolute;inset:0;padding:24px 32px;`,
      html: `
        <div style="display:flex;justify-content:space-between;align-items:baseline;white-space:nowrap">
          <div class="mono" style="font-size:22px;color:var(--muted)">${esc(spec.title ?? "")}</div>
          <div class="mono" style="font-size:21px;color:var(--muted)">${esc(spec.kicker ?? "")}</div>
        </div>
        <div class="serif" style="font-size:112px;line-height:1.1;font-weight:560;letter-spacing:-0.02em;white-space:nowrap;color:var(--ink)">
          <span data-n></span><span style="font-style:italic;color:var(--accent);font-size:0.52em;margin-left:14px">${esc(spec.unit ?? "")}</span>
        </div>
        <div style="position:relative;height:34px;margin-top:10px;border:3.5px solid var(--line);border-radius:17px;background:var(--cardAlt);overflow:hidden">
          <div data-fill style="position:absolute;left:0;top:0;bottom:0;width:0;background:var(--amber);border-right:3.5px solid var(--line)">
            <div data-stripes style="position:absolute;inset:0;background:repeating-linear-gradient(115deg, rgba(255,255,255,0.28) 0 12px, transparent 12px 28px);background-size:200% 100%"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;white-space:nowrap">
          <div class="mono" style="font-size:21px;color:var(--muted)">0</div>
          <div data-total class="mono" style="font-size:21px;color:var(--muted)">${esc(spec.totalLabel ?? "")}</div>
        </div>
        ${spec.caption ? `<div data-cap style="margin-top:8px;font:650 28px var(--font-ui);color:var(--ink);white-space:nowrap">${esc(spec.caption)}</div>` : ""}`,
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style: `position:absolute;right:-22px;top:-30px;background:${spec.tagColor ?? "var(--gold)"};color:#1c1917;opacity:0`,
      },
      spec.tag ?? "",
    );
    el.append(card, tag);
    return {
      num: card.querySelector("[data-n]"),
      fill: card.querySelector("[data-fill]"),
      stripes: card.querySelector("[data-stripes]"),
      total: card.querySelector("[data-total]"),
      tag,
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const value = spec.value ?? 0;
    const total = spec.total ?? value;
    const t0 = ctx.at(spec.fillAt ?? 0.15);
    const dur = spec.fillDur ?? 0.9;
    const p = ease.outCubic(prog(t, t0, t0 + dur));
    const v = lerp(spec.from ?? 0, value, p);
    const decimals = spec.decimals ?? String(value).split(".")[1]?.length ?? 0;
    const [whole, frac] = v.toFixed(decimals).split(".");
    setText(state.num, commas(Number(whole)) + (frac ? `.${frac}` : ""));
    let share = total > 0 ? clamp(v / total) : 0;
    let label = spec.totalLabel ?? "";
    let tagAt = t0 + dur;
    for (const step of steps(spec)) {
      // the bar "zooms": the same value against a different whole
      const at = ctx.at(step.at ?? "end-1");
      const zp = ease.inOutCubic(prog(t, at, at + ZOOM));
      share = lerp(share, clamp(value / (step.total || value)), zp);
      if (t >= at + 0.2) label = step.totalLabel ?? label;
      tagAt = at + ZOOM;
    }
    setText(state.total, label);
    state.fill.style.width = `${(share * 100).toFixed(2)}%`;
    // the stripes drift, so the bar is never a still rectangle
    state.stripes.style.backgroundPosition = `${(-t * 46).toFixed(1)}px 0`;
    if (spec.tag) {
      const at = spec.tagAt != null ? ctx.at(spec.tagAt) : tagAt;
      const tp = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(14, 5, tp).toFixed(2)}deg) scale(${lerp(0.5, 1, tp).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const t0 = ctx.at(spec.fillAt ?? 0.15);
    const dur = spec.fillDur ?? 0.9;
    const cues = [{ t: t0, name: "counter", dur }];
    let tagAt = t0 + dur;
    for (const step of steps(spec)) {
      const at = ctx.at(step.at ?? "end-1");
      cues.push({ t: at, name: "whoosh-out", gain: 0.6 });
      tagAt = at + ZOOM;
    }
    if (spec.tag) cues.push({ t: spec.tagAt != null ? ctx.at(spec.tagAt) : tagAt, name: "pop" });
    return cues;
  },
};

export default prop;
