// A digital clock that flips from one time to another on cue ("11:59" to "12:00"), with a small
// line above and below. Use it for "at midnight", "doors at eight", a deadline passing.
//
// spec: { label, labelTo, from, to, fromSuffix, toSuffix, flipAt, note, tag, tagAt, tagColor }
//   labelTo   the label after the flip, for when the flip crosses into another day
//             ("Wed, Nov 18" at 11:59 PM becomes "Thu, Nov 19" at 12:00 AM)

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const W = 560;
const H = 320;

const face = (text, suffix, attr) =>
  `<div ${attr} style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:14px;backface-visibility:hidden">
     <span class="serif" style="font-size:150px;line-height:1;font-weight:600;letter-spacing:-0.02em;color:#fdf3ea;font-variant-numeric:tabular-nums">${esc(text ?? "")}</span>
     <span class="mono" style="font-size:30px;color:#fdf3ea;opacity:0.8;align-self:flex-end;margin-bottom:26px">${esc(suffix ?? "")}</span>
   </div>`;

const prop = {
  build(el, spec) {
    box(el, W, H);
    const card = h("div", {
      class: "card",
      style: "position:absolute;inset:0;padding:22px 30px;",
      html: `
        <div data-label class="mono" style="font-size:22px;color:var(--muted);white-space:nowrap">${esc(spec.label ?? "")}</div>
        <div style="position:relative;height:186px;margin-top:12px;perspective:900px">
          <div data-panel style="position:absolute;inset:0;border:3.5px solid var(--line);border-radius:22px;background:#1d1420;box-shadow:6px 7px 0 var(--shadow);transform-origin:50% 50%">
            ${face(spec.from, spec.fromSuffix, "data-a")}
            ${face(spec.to, spec.toSuffix, "data-b")}
            <div style="position:absolute;left:0;right:0;top:50%;height:3px;margin-top:-1.5px;background:rgba(0,0,0,0.55)"></div>
          </div>
        </div>
        <div class="mono" style="font-size:22px;color:var(--ink);margin-top:14px;white-space:nowrap">${esc(spec.note ?? "")}</div>`,
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style: `position:absolute;right:-22px;top:-28px;background:${spec.tagColor ?? "var(--gold)"};color:#1c1917;opacity:0`,
      },
      spec.tag ?? "",
    );
    el.append(card, tag);
    return {
      panel: card.querySelector("[data-panel]"),
      label: card.querySelector("[data-label]"),
      a: card.querySelector("[data-a]"),
      b: card.querySelector("[data-b]"),
      tag,
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.flipAt ?? 0.8);
    // one quick flip about the horizontal axis; the old time is swapped for the new at 90 degrees
    const p = ease.inOutCubic(prog(t, at - 0.14, at + 0.14));
    const angle = p < 0.5 ? p * 180 : (p - 1) * 180;
    const colon = t < at && Math.floor(t * 2) % 2 === 1 ? 0.55 : 1; // the seconds "tick" until then
    state.panel.style.transform = `rotateX(${angle.toFixed(2)}deg)`;
    state.a.style.opacity = p < 0.5 ? colon.toFixed(2) : "0";
    state.b.style.opacity = p < 0.5 ? "0" : "1";
    const label = p >= 0.5 && spec.labelTo ? spec.labelTo : (spec.label ?? "");
    if (state.label._t !== label) {
      state.label.textContent = label;
      state.label._t = label;
    }
    if (spec.tag) {
      const ta = spec.tagAt != null ? ctx.at(spec.tagAt) : at + 0.16;
      const tp = settle(t - ta, 18);
      state.tag.style.opacity = clamp(prog(t, ta, ta + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(14, 5, tp).toFixed(2)}deg) scale(${lerp(0.5, 1, tp).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const at = ctx.at(spec.flipAt ?? 0.8);
    const cues = [{ t: at - 0.1, name: "tick", pitch: 0.7, gain: 1.2 }];
    if (spec.tag)
      cues.push({ t: spec.tagAt != null ? ctx.at(spec.tagAt) : at + 0.16, name: "pop" });
    return cues;
  },
};

export default prop;
