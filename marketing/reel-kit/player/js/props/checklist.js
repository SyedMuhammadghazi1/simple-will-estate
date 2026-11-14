// A short list whose items are ticked off on cue — one per spoken item. Keep it to three or
// four rows: it has to be readable in the time it takes to say them.
//
// spec: { title, kicker, items: [{ text, at }], w }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const items = spec.items ?? [];
    const w = spec.w ?? 600;
    const hgt = 128 + items.length * 88;
    box(el, w, hgt);
    const card = h("div", {
      class: "card",
      style: `position:absolute;inset:0;padding:24px 30px;`,
      html: `<div style="display:flex;justify-content:space-between;align-items:baseline">
               <div class="serif" style="font-size:46px;font-weight:640;color:var(--ink)">${esc(spec.title ?? "")}</div>
               <div class="mono" style="font-size:19px;color:var(--muted)">${esc(spec.kicker ?? "")}</div>
             </div>
             <div data-rows style="margin-top:12px"></div>`,
    });
    const wrap = card.querySelector("[data-rows]");
    const rows = items.map((it, i) => {
      const row = h("div", {
        style: `display:flex;align-items:center;gap:20px;height:88px;border-top:3px solid var(--cardAlt)`,
        html: `<div style="position:relative;width:52px;height:52px;flex:none">
                 <div style="position:absolute;inset:0;border:3.5px solid var(--line);border-radius:14px;background:var(--card)"></div>
                 <div data-fill style="position:absolute;inset:0;border:3.5px solid var(--line);border-radius:14px;background:var(--green);opacity:0"></div>
                 <svg viewBox="0 0 52 52" width="52" height="52" style="position:absolute;inset:0;overflow:visible"><path data-tick d="M13 27 L23 37 L40 16" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="46" stroke-dashoffset="46"/></svg>
               </div>
               <div style="font:650 35px var(--font-ui);color:var(--ink);white-space:nowrap"><span class="mono" style="font-size:22px;color:var(--muted);margin-right:12px">${i + 1}</span>${esc(it.text)}</div>`,
      });
      wrap.appendChild(row);
      return {
        row,
        fill: row.querySelector("[data-fill]"),
        tick: row.querySelector("[data-tick]"),
      };
    });
    el.appendChild(card);
    return { rows };
  },

  update(state, t, ctx) {
    const items = ctx.spec.items ?? [];
    state.rows.forEach(({ row, fill, tick }, i) => {
      const at = ctx.at(items[i].at ?? 0.4 + i * 0.5);
      const p = ease.outCubic(prog(t, at, at + 0.2));
      fill.style.opacity = p.toFixed(3);
      tick.setAttribute(
        "stroke-dashoffset",
        (46 * (1 - ease.outCubic(prog(t, at + 0.04, at + 0.24)))).toFixed(2),
      );
      const pop = settle(t - at, 18);
      const s = t >= at ? lerp(0.82, 1, pop) : 1;
      fill.parentElement.style.transform = `scale(${s.toFixed(4)})`;
      // rows not yet reached sit back so the eye follows the voice down the list
      row.style.opacity = lerp(0.42, 1, clamp(prog(t, at - 0.12, at + 0.06))).toFixed(3);
    });
  },

  sfx(spec, ctx) {
    return (spec.items ?? []).map((it, i) => ({
      t: ctx.at(it.at ?? 0.4 + i * 0.5),
      name: "tick",
      pitch: 0.9 + i * 0.14,
      gain: 1.3,
    }));
  },
};

export default prop;
