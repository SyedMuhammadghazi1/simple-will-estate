// A grid of small icons that pop in one after another, with a counter line under it:
// "32 nights" drawn as 32 moons.
//
// spec: { count, cols, icon: "moon" | "dot", at, step, label, size }
//   label  text under the grid; "{n}" is replaced with the number shown so far

import { clamp, lerp, prog, settle } from "../timing.js";
import { box, h, setText } from "./_util.js";

const MOON = `<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M27 6 A16 16 0 1 0 34 27 A13 13 0 1 1 27 6 Z" fill="var(--gold)"/></svg>`;

const prop = {
  build(el, spec) {
    const n = spec.count ?? 20;
    const cols = spec.cols ?? 8;
    const size = spec.size ?? 70;
    const gap = Math.round(size * 0.32);
    const rows = Math.ceil(n / cols);
    const w = cols * size + (cols - 1) * gap;
    const gridH = rows * size + (rows - 1) * gap;
    box(el, w, gridH + 90);
    const cells = [];
    for (let i = 0; i < n; i++) {
      const c = h("div", {
        style: `position:absolute;left:${(i % cols) * (size + gap)}px;top:${Math.floor(i / cols) * (size + gap)}px;width:${size}px;height:${size}px;opacity:0`,
        html:
          spec.icon === "dot"
            ? `<div style="width:100%;height:100%;border-radius:50%;background:var(--green)"></div>`
            : MOON,
      });
      el.appendChild(c);
      cells.push(c);
    }
    const label = h("div", {
      class: "mono",
      style: `position:absolute;left:-100px;right:-100px;top:${gridH + 34}px;text-align:center;font-size:44px;color:var(--ink);text-transform:none;letter-spacing:0`,
    });
    el.appendChild(label);
    return { cells, label };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.at ?? 0.2);
    const step = spec.step ?? 0.035;
    let shown = 0;
    state.cells.forEach((c, i) => {
      const t0 = at + i * step;
      const p = settle(t - t0, 20);
      if (t >= t0) shown++;
      c.style.opacity = clamp(prog(t, t0, t0 + 0.06)).toFixed(3);
      c.style.transform = `scale(${lerp(0.3, 1, p).toFixed(4)})`;
    });
    setText(state.label, shown ? (spec.label ?? "{n}").replace("{n}", String(shown)) : "");
  },
  sfx(spec, ctx) {
    const at = ctx.at(spec.at ?? 0.2);
    const step = spec.step ?? 0.035;
    const out = [];
    for (let i = 0; i < (spec.count ?? 20); i += 4)
      out.push({ t: at + i * step, name: "tick", pitch: 0.8 + i * 0.01, gain: 0.7 });
    return out;
  },
};

export default prop;
