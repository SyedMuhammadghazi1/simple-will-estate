// A brand reveal: a mark that builds, a wordmark, a tagline, and an optional field of small
// cells that light up at random (seeded), to suggest a feed being watched.
//
// spec: { name, suffix, tagline, at, taglineAt, field: { at, cols, rows } }
// The mark is three rising steps (the theme's accent on the last); it is drawn here, not loaded.

import { clamp, ease, lerp, prog, rng, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const W = 860;
    const field = spec.field;
    const cols = field?.cols ?? 40;
    const rows = field?.rows ?? 10;
    box(el, W, field ? 540 : 300);
    const head = h("div", {
      style:
        "position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:center;gap:28px",
      html: `<svg viewBox="0 0 84 72" width="104" height="90" style="overflow:visible">
               <rect data-s="0" x="0" y="46" width="22" height="26" rx="4" style="fill:var(--ink)" opacity="0.55"/>
               <rect data-s="1" x="30" y="24" width="22" height="48" rx="4" style="fill:var(--ink)" opacity="0.8"/>
               <rect data-s="2" x="60" y="0" width="24" height="72" rx="4" fill="#7c5cff"/>
             </svg>
             <div data-word style="font:800 112px/1 var(--font-ui);letter-spacing:-0.035em;color:var(--ink);white-space:nowrap">${esc(spec.name ?? "")}<sup style="font-size:0.32em;font-weight:700;letter-spacing:0;margin-left:6px;color:#a991ff;vertical-align:1.9em">${esc(spec.suffix ?? "")}</sup></div>`,
    });
    const tag = h(
      "div",
      {
        style:
          "position:absolute;left:0;right:0;top:132px;text-align:center;font:500 34px var(--font-ui);color:var(--ink);opacity:0",
      },
      spec.tagline ?? "",
    );
    el.append(head, tag);
    const cells = [];
    if (field) {
      const g = h("div", {
        style: `position:absolute;left:0;right:0;top:220px;height:300px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:5px;opacity:0`,
      });
      const r = rng(7);
      for (let i = 0; i < cols * rows; i++) {
        const c = h("div", { style: "border-radius:2px;background:var(--cardAlt)" });
        g.appendChild(c);
        cells.push({ c, phase: r() * 6, rate: 0.6 + r() * 1.8 });
      }
      el.appendChild(g);
      return {
        steps: [...head.querySelectorAll("[data-s]")],
        word: head.querySelector("[data-word]"),
        tag,
        grid: g,
        cells,
      };
    }
    return {
      steps: [...head.querySelectorAll("[data-s]")],
      word: head.querySelector("[data-word]"),
      tag,
      cells,
    };
  },
  update(s, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.at ?? 0);
    s.steps.forEach((el, i) => {
      const p = settle(t - at - i * 0.08, 18);
      el.style.transformBox = "fill-box";
      el.style.transformOrigin = "50% 100%";
      el.style.transform = `scaleY(${p.toFixed(4)})`;
    });
    const wp = ease.outCubic(prog(t, at + 0.2, at + 0.55));
    s.word.style.opacity = wp.toFixed(3);
    s.word.style.transform = `translateX(${lerp(-24, 0, wp).toFixed(2)}px)`;
    const ta = ctx.at(spec.taglineAt ?? 0.7);
    s.tag.style.opacity = ease.outCubic(prog(t, ta, ta + 0.3)).toFixed(3);
    if (s.grid) {
      const fa = ctx.at(spec.field.at ?? 1);
      const reveal = clamp(prog(t, fa, fa + 0.4));
      s.grid.style.opacity = reveal.toFixed(3);
      for (const { c, phase, rate } of s.cells) {
        const lit = Math.sin(t * rate * 3 + phase) > 0.86 && t > fa;
        c.style.background = lit ? "var(--green)" : "var(--cardAlt)";
      }
    }
  },
  sfx(spec, ctx) {
    return [
      { t: ctx.at(spec.at ?? 0), name: "swell", gain: 0.6 },
      { t: ctx.at(spec.at ?? 0) + 0.25, name: "pop", gain: 0.8 },
    ];
  },
};

export default prop;
