// A stopwatch whose ring sweeps while the readout races to a target time — "this takes N
// minutes" without a number just sitting there.
//
// spec: { seconds, label, note, runAt, runDur }

import { clamp, ease, prog } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const R = 104;
const C = 2 * Math.PI * R;

const prop = {
  build(el, spec) {
    box(el, 600, 360);
    const watch = h("div", {
      style: "position:absolute;left:0;top:0;width:290px;height:340px",
      html: `<svg viewBox="0 0 290 340" width="290" height="340" style="overflow:visible">
        <g stroke="var(--line)" stroke-width="4" stroke-linejoin="round">
          <circle cx="155" cy="200" r="126" fill="var(--shadow)" stroke="none"/>
          <rect x="124" y="20" width="42" height="34" rx="8" fill="var(--goldDeep)"/>
          <rect x="108" y="6" width="74" height="24" rx="10" fill="var(--gold)"/>
          <rect x="226" y="72" width="34" height="24" rx="7" fill="var(--goldDeep)" transform="rotate(42 243 84)"/>
          <circle cx="145" cy="190" r="126" fill="var(--card)"/>
          <circle cx="145" cy="190" r="${R}" fill="none" stroke="var(--cardAlt)" stroke-width="20"/>
          <circle data-ring cx="145" cy="190" r="${R}" fill="none" stroke="var(--green)" stroke-width="20" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 145 190)"/>
          <g data-hand><path d="M145 190 V108" fill="none" stroke-width="7" stroke-linecap="round"/></g>
          <circle cx="145" cy="190" r="11" fill="var(--gold)"/>
        </g>
      </svg>`,
    });
    const card = h("div", {
      class: "card",
      style:
        "position:absolute;left:286px;top:86px;width:314px;height:206px;padding:20px 26px;transform:rotate(3deg)",
      html: `<div class="mono" style="font-size:19px;color:var(--muted)">${esc(spec.label ?? "")}</div>
             <div class="serif" data-time style="font-size:96px;line-height:1.08;font-weight:640;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap">0:00</div>
             <div data-note style="font:650 25px var(--font-ui);color:var(--green);white-space:nowrap">${esc(spec.note ?? "")}</div>`,
    });
    el.append(watch, card);
    return {
      ring: watch.querySelector("[data-ring]"),
      hand: watch.querySelector("[data-hand]"),
      time: card.querySelector("[data-time]"),
      note: card.querySelector("[data-note]"),
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.runAt ?? 0.2);
    const dur = spec.runDur ?? Math.max(0.7, ctx.dur - at - 0.5);
    const p = ease.outCubic(prog(t, at, at + dur));
    const secs = Math.round((spec.seconds ?? 900) * p);
    setText(state.time, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    state.ring.setAttribute("stroke-dashoffset", (C * (1 - p)).toFixed(2));
    state.hand.setAttribute("transform", `rotate(${(p * 360).toFixed(2)} 145 190)`);
    state.note.style.opacity = clamp(prog(t, at + dur * 0.8, at + dur * 0.8 + 0.2)).toFixed(3);
  },

  sfx(spec, ctx) {
    const at = ctx.at(spec.runAt ?? 0.2);
    const dur = spec.runDur ?? Math.max(0.7, ctx.dur - at - 0.5);
    return [
      { t: at, name: "counter", dur },
      { t: at + dur, name: "ding", gain: 0.8 },
    ];
  },
};

export default prop;
