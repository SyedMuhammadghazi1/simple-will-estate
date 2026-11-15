// A "send to" sheet: a row of contacts, one gets picked on cue and a paper plane flies to them.
// Shows the viewer the exact action a share prompt is asking for.
//
// spec: { title, people: [{ label, color }], pick, pickAt, sentLabel }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { check, person, plane } from "./_art.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    const people = spec.people ?? [{}, {}, {}];
    box(el, 640, 380);
    const card = h("div", {
      class: "card",
      style: "position:absolute;inset:0;padding:22px 30px;",
      html: `<div style="width:76px;height:8px;border-radius:4px;background:var(--line);opacity:0.2;margin:0 auto 14px"></div>
             <div class="mono" style="font-size:21px;color:var(--muted)">${esc(spec.title ?? "Send to")}</div>
             <div data-row style="display:flex;justify-content:space-between;margin-top:20px"></div>
             <div data-btn style="margin-top:22px;height:74px;border:3.5px solid var(--line);border-radius:18px;background:var(--navy);display:flex;align-items:center;justify-content:center;font:700 31px var(--font-ui);color:#fff;letter-spacing:0.02em"><span data-btn-label>Send</span></div>`,
    });
    const row = card.querySelector("[data-row]");
    const slots = people.map((p, i) => {
      const slot = h("div", {
        style: "position:relative;width:150px;text-align:center",
        html: `<div data-av style="width:128px;height:128px;margin:0 auto;position:relative">
                 ${person(128, p.color ?? ["var(--amber)", "var(--navy)", "var(--green)"][i % 3], { bg: "var(--cardAlt)" })}
                 <div data-ring style="position:absolute;inset:-9px;border:6px solid var(--gold);border-radius:50%;opacity:0"></div>
                 <div data-badge style="position:absolute;right:-8px;bottom:-6px;opacity:0">${check(46)}</div>
               </div>
               <div style="font:600 23px var(--font-ui);color:var(--ink);margin-top:10px;white-space:nowrap">${esc(p.label ?? "")}</div>`,
      });
      row.appendChild(slot);
      return {
        slot,
        ring: slot.querySelector("[data-ring]"),
        badge: slot.querySelector("[data-badge]"),
      };
    });
    const flyer = h("div", {
      style: "position:absolute;left:0;top:0;width:64px;height:64px;opacity:0",
      html: plane(64, "var(--gold)"),
    });
    el.append(card, flyer);
    return {
      slots,
      flyer,
      btn: card.querySelector("[data-btn]"),
      btnLabel: card.querySelector("[data-btn-label]"),
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const pick = spec.pick ?? 1;
    const at = ctx.at(spec.pickAt ?? 0.6);
    const sendAt = at + 0.34;
    state.slots.forEach(({ slot, ring, badge }, i) => {
      const inP = settle(t - 0.12 - i * 0.07, 18);
      slot.style.transform = `scale(${lerp(0.5, 1, inP).toFixed(4)})`;
      slot.style.opacity = (
        clamp(prog(t, 0.12 + i * 0.07, 0.2 + i * 0.07)) *
        (i === pick ? 1 : 1 - 0.45 * prog(t, at, at + 0.2))
      ).toFixed(3);
      if (i === pick) {
        const rp = settle(t - at, 18);
        ring.style.opacity = clamp(prog(t, at, at + 0.06)).toFixed(3);
        ring.style.transform = `scale(${lerp(1.3, 1, rp).toFixed(4)})`;
        const bp = settle(t - sendAt - 0.3, 18);
        badge.style.opacity = clamp(prog(t, sendAt + 0.3, sendAt + 0.36)).toFixed(3);
        badge.style.transform = `scale(${lerp(0.3, 1, bp).toFixed(4)})`;
      }
    });
    // the button is pressed, then the plane arcs from it up to the chosen contact
    const press = t >= sendAt ? Math.exp(-12 * (t - sendAt)) * 0.06 : 0;
    state.btn.style.transform = `scale(${(1 - press).toFixed(4)})`;
    const sent = t >= sendAt + 0.3;
    const label = sent ? (spec.sentLabel ?? "Sent") : "Send";
    if (state.btnLabel._t !== label) {
      state.btnLabel.textContent = label;
      state.btnLabel._t = label;
    }
    state.btn.style.background = sent ? "var(--green)" : "var(--navy)";
    const fp = prog(t, sendAt, sendAt + 0.34);
    const e = ease.inOutCubic(fp);
    const tx = 104 + pick * 196;
    const x = lerp(288, tx, e);
    const y = lerp(286, 96, e) - Math.sin(fp * Math.PI) * 60;
    state.flyer.style.opacity = fp > 0 && fp < 1 ? "1" : "0";
    state.flyer.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${lerp(-10, -40, e).toFixed(2)}deg) scale(${lerp(1, 0.6, e).toFixed(3)})`;
  },

  sfx(spec, ctx) {
    const at = ctx.at(spec.pickAt ?? 0.6);
    // This prop sits under the reel's spoken ask, so it stays quiet: a click on the pick and a
    // soft chime once the line has been said.
    return [
      { t: at, name: "click" },
      { t: Math.max(at + 0.9, ctx.at("end") - 0.25), name: "chime", gain: 0.45 },
    ];
  },
};

export default prop;
