// "N in M people" as a row of avatars: on cue the first `filled` light up and the rest fade,
// with the headline number beside them and an optional source line (cite your statistic).
//
// spec: { total, filled, big, label, source, at }

import { clamp, lerp, prog, settle } from "../timing.js";
import { check, person } from "./_art.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const total = spec.total ?? 4;
    box(el, 660, 400);
    const card = h("div", {
      class: "card",
      style: "position:absolute;inset:0;padding:26px 30px;",
      html: `<div style="display:flex;align-items:baseline;gap:18px;white-space:nowrap">
               <div class="serif" data-big style="font-size:104px;line-height:1;font-weight:640;color:var(--ink)">${esc(spec.big ?? "")}</div>
               <div class="serif" style="font-size:46px;font-style:italic;font-weight:600;color:var(--accent)">${esc(spec.label ?? "")}</div>
             </div>
             <div data-row style="display:flex;gap:${total > 5 ? 10 : 20}px;margin-top:26px"></div>
             <div class="mono" style="position:absolute;right:28px;bottom:18px;font-size:17px;letter-spacing:0.08em;color:var(--muted)">${esc(spec.source ?? "")}</div>`,
    });
    const row = card.querySelector("[data-row]");
    const size = Math.min(132, Math.floor((600 - (total - 1) * (total > 5 ? 10 : 20)) / total));
    const people = [];
    for (let i = 0; i < total; i++) {
      const on = i < (spec.filled ?? 1);
      const p = h("div", {
        style: `position:relative;width:${size}px;height:${size}px`,
        html: `${person(size, on ? "var(--navy)" : "var(--muted)", { bg: on ? "var(--gold)" : "var(--cardAlt)" })}
               <div data-badge style="position:absolute;right:-8px;bottom:-6px;opacity:0">${on ? check(46) : ""}</div>`,
      });
      row.appendChild(p);
      people.push({ el: p, on, badge: p.querySelector("[data-badge]") });
    }
    el.appendChild(card);
    return { people, big: card.querySelector("[data-big]") };
  },

  update(state, t, ctx) {
    const at = ctx.at(ctx.spec.at ?? 0.4);
    state.people.forEach((p, i) => {
      const inP = settle(t - 0.1 - i * 0.07, 18);
      const decided = prog(t, at, at + 0.25);
      const scale = lerp(0.4, 1, inP) * (p.on ? 1 + decided * 0.06 : 1 - decided * 0.1);
      p.el.style.transform = `scale(${scale.toFixed(4)})`;
      p.el.style.opacity = (
        clamp(prog(t, 0.1 + i * 0.07, 0.2 + i * 0.07)) * (p.on ? 1 : 1 - decided * 0.5)
      ).toFixed(3);
      if (p.on) {
        const bp = settle(t - at - 0.1, 18);
        p.badge.style.opacity = clamp(prog(t, at + 0.1, at + 0.16)).toFixed(3);
        p.badge.style.transform = `scale(${lerp(0.3, 1, bp).toFixed(4)})`;
      }
    });
    const pop = t >= at ? 1 + Math.exp(-9 * (t - at)) * 0.16 : 1;
    state.big.style.transform = `scale(${pop.toFixed(4)})`;
    state.big.style.transformOrigin = "0 80%";
  },

  sfx(spec, ctx) {
    const at = ctx.at(spec.at ?? 0.4);
    return [{ t: at + 0.1, name: "ding", gain: 0.8 }];
  },
};

export default prop;
