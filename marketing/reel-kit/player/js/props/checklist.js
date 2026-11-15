// A short list whose items are ticked off on cue — one per spoken item. Keep it to three or
// four rows: it has to be readable in the time it takes to say them.
//
// spec: { title, kicker, items: [{ text, at }], w, stamp: { text, at, color } }

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
               <div class="mono" style="font-size:21px;color:var(--muted)">${esc(spec.kicker ?? "")}</div>
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
    const stamp = h(
      "div",
      {
        style: `position:absolute;right:-22px;top:-34px;padding:10px 20px 8px;border:5px solid ${spec.stamp?.color ?? "var(--green)"};border-radius:12px;color:${spec.stamp?.color ?? "var(--green)"};font:500 34px var(--font-mono);letter-spacing:0.1em;white-space:nowrap;text-transform:uppercase;background:var(--card);opacity:0`,
      },
      spec.stamp?.text ?? "",
    );
    el.append(card, stamp);
    return { rows, stamp };
  },

  update(state, t, ctx) {
    const items = ctx.spec.items ?? [];
    if (ctx.spec.stamp) {
      // same physical hit as the document stamp: big and fast, then a tiny settle
      const at = ctx.at(ctx.spec.stamp.at ?? "end-0.8");
      const land = 0.11;
      const p = ease.inQuart(prog(t, at - land, at));
      const wobble = t > at ? Math.exp(-14 * (t - at)) * Math.sin((t - at) * 46) * 0.06 : 0;
      state.stamp.style.opacity = clamp(prog(t, at - land, at - land * 0.4)).toFixed(3);
      state.stamp.style.transform = `rotate(7deg) scale(${(lerp(2.4, 1, p) + wobble).toFixed(4)})`;
    }
    state.rows.forEach(({ row, fill, tick }, i) => {
      const at = ctx.at(items[i].at ?? 0.4 + i * 0.5);
      const p = ease.outCubic(prog(t, at, at + 0.2));
      fill.style.opacity = p.toFixed(3);
      tick.setAttribute(
        "stroke-dashoffset",
        (46 * (1 - ease.outCubic(prog(t, at + 0.04, at + 0.24)))).toFixed(2),
      );
      const pop = settle(t - at, 18);
      const prevAt = i > 0 ? ctx.at(items[i - 1].at ?? 0.4 + (i - 1) * 0.5) : -1;
      const waiting = t < at && t >= prevAt; // the box the voice has not reached yet
      const s = t >= at ? lerp(0.82, 1, pop) : waiting ? 1 + Math.sin(t * 7) * 0.05 : 1;
      fill.parentElement.style.transform = `scale(${s.toFixed(4)})`;
      // rows not yet reached sit back so the eye follows the voice down the list
      row.style.opacity = lerp(0.42, 1, clamp(prog(t, at - 0.12, at + 0.06))).toFixed(3);
    });
  },

  sfx(spec, ctx) {
    const cues = (spec.items ?? []).map((it, i) => ({
      t: ctx.at(it.at ?? 0.4 + i * 0.5),
      name: "tick",
      pitch: 0.9 + i * 0.14,
      gain: 1.3,
    }));
    if (spec.stamp) cues.push({ t: ctx.at(spec.stamp.at ?? "end-0.8"), name: "stamp", gain: 0.8 });
    return cues;
  },
};

export default prop;
