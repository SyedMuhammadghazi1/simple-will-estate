// Two or three hanging price tags that drop in on cue and swing a little. Use it for "this one
// costs X, that one costs Y". Prices are text, so write them exactly as they should read.
//
// spec: { tags: [{ label, price, note, at, color }] }

import { clamp, lerp, prog, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const TAG_W = 296;
const TAG_H = 236;
const GAP = 34;

const prop = {
  build(el, spec) {
    const tags = spec.tags ?? [];
    box(el, tags.length * TAG_W + (tags.length - 1) * GAP, TAG_H + 60);
    const els = tags.map((tag, i) => {
      const wrap = h("div", {
        style: `position:absolute;left:${i * (TAG_W + GAP)}px;top:${i % 2 ? 44 : 0}px;width:${TAG_W}px;height:${TAG_H}px;transform-origin:50% 22px;opacity:0`,
        html: `
          <svg viewBox="0 0 ${TAG_W} ${TAG_H}" width="${TAG_W}" height="${TAG_H}" style="position:absolute;inset:0;overflow:visible">
            <path d="M${TAG_W / 2} 22 V-70" stroke="var(--line)" stroke-width="4" stroke-linecap="round" fill="none"/>
            <path d="M22 62 L${TAG_W / 2 - 46} 6 H${TAG_W / 2 + 46} L${TAG_W - 22} 62 V${TAG_H - 22} a18 18 0 0 1 -18 18 H40 a18 18 0 0 1 -18 -18 Z"
              fill="var(--shadow)" transform="translate(8 9)"/>
            <path d="M22 62 L${TAG_W / 2 - 46} 6 H${TAG_W / 2 + 46} L${TAG_W - 22} 62 V${TAG_H - 22} a18 18 0 0 1 -18 18 H40 a18 18 0 0 1 -18 -18 Z"
              fill="var(--card)" stroke="var(--line)" stroke-width="3.5" stroke-linejoin="round"/>
            <circle cx="${TAG_W / 2}" cy="34" r="11" fill="var(--cardAlt)" stroke="var(--line)" stroke-width="3.5"/>
          </svg>
          <div style="position:absolute;left:0;right:0;top:66px;text-align:center">
            <div class="mono" style="font-size:22px;color:${tag.color ?? "var(--muted)"};white-space:nowrap">${esc(tag.label ?? "")}</div>
            <div class="serif" style="font-size:66px;line-height:1.14;font-weight:600;letter-spacing:-0.02em;color:var(--ink);white-space:nowrap">${esc(tag.price ?? "")}</div>
            <div class="mono" style="font-size:19px;letter-spacing:0.08em;color:var(--muted);white-space:nowrap">${esc(tag.note ?? "")}</div>
          </div>`,
      });
      return wrap;
    });
    el.append(...els);
    return { els };
  },

  update(state, t, ctx) {
    (ctx.spec.tags ?? []).forEach((tag, i) => {
      const at = ctx.at(tag.at ?? 0.2 + i * 0.5);
      const p = settle(t - at, 16);
      const el = state.els[i];
      el.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      // drops in from above, then hangs and swings from its string
      const drop = (1 - p) * -90;
      const land = t > at ? Math.exp(-5 * (t - at)) * Math.sin((t - at) * 11) * 9 : 0;
      const swing = Math.sin(t * 2.1 + i * 1.7) * 2.2 + land;
      el.style.transform = `translateY(${drop.toFixed(2)}px) rotate(${swing.toFixed(3)}deg) scale(${lerp(0.8, 1, p).toFixed(4)})`;
    });
  },

  sfx(spec, ctx) {
    return (spec.tags ?? []).map((tag, i) => ({
      t: ctx.at(tag.at ?? 0.2 + i * 0.5),
      name: "pop",
      pitch: 0.9 + i * 0.12,
    }));
  },
};

export default prop;
