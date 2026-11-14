// A gavel that strikes on cue, in front of a small "hearing" card. Used for "someone else
// decides" beats.
//
// spec: { title, lines: ["Guardian:", "decided by the court"], hits: ["w:judge", ...], tag, tagAt }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { person } from "./_art.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    box(el, 620, 400);
    const card = h("div", {
      class: "card",
      style:
        "position:absolute;left:0;top:26px;width:400px;height:300px;padding:24px 28px;transform:rotate(-3deg)",
      html: `<div class="mono" style="font-size:20px;color:var(--muted)">${esc(spec.title ?? "")}</div>
        <div style="display:flex;align-items:center;gap:20px;margin-top:22px">
          <div style="width:104px;height:104px">${person(104, "var(--gold)", { bg: "var(--sky)" })}</div>
          <div>
            <div style="font:650 30px var(--font-ui);color:var(--ink)">${esc(spec.lines?.[0] ?? "")}</div>
            <div data-who class="serif" style="font-size:42px;font-style:italic;font-weight:600;color:var(--accent);line-height:1.1;margin-top:4px">?</div>
          </div>
        </div>
        <div style="margin-top:24px;height:10px;width:92%;border-radius:5px;background:var(--line);opacity:0.15"></div>
        <div style="margin-top:14px;height:10px;width:70%;border-radius:5px;background:var(--line);opacity:0.15"></div>`,
    });
    // The gavel is drawn lying flat with its grip at the origin; rotating the group about the
    // grip raises the head (positive angle) and 0deg is the strike.
    const gav = h("div", {
      style: "position:absolute;left:330px;top:70px;width:300px;height:330px",
      html: `<svg viewBox="0 0 300 330" width="300" height="330" style="overflow:visible">
        <g stroke="var(--line)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
          <g data-burst opacity="0" stroke-width="7" stroke="var(--gold)">
            <path d="M-6 250 l-34 -12 M6 214 l-26 -26 M40 196 l-10 -34 M166 214 l26 -26 M178 250 l34 -12"/>
          </g>
          <rect x="2" y="290" width="172" height="30" rx="9" fill="var(--amber)"/>
          <rect x="22" y="268" width="132" height="24" rx="8" fill="var(--goldDeep)"/>
          <g data-arm transform="translate(262 206)">
            <rect x="-176" y="-11" width="190" height="22" rx="10" fill="var(--goldDeep)"/>
            <rect x="-20" y="-15" width="40" height="30" rx="10" fill="var(--amber)"/>
            <rect x="-212" y="-62" width="76" height="124" rx="14" fill="var(--amber)"/>
            <rect x="-218" y="-66" width="88" height="22" rx="8" fill="var(--gold)"/>
            <rect x="-218" y="44" width="88" height="22" rx="8" fill="var(--gold)"/>
          </g>
        </g>
      </svg>`,
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style: "position:absolute;left:150px;top:300px;background:var(--red);color:#fff;opacity:0",
      },
      spec.tag ?? "",
    );
    el.append(card, gav, tag);
    return {
      arm: gav.querySelector("[data-arm]"),
      burst: gav.querySelector("[data-burst]"),
      who: card.querySelector("[data-who]"),
      card,
      tag,
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const hits = (spec.hits ?? [0.6]).map((c) => ctx.at(c));
    // rest raised, wind up a little further before each hit, snap down, rebound back up
    const REST = 30;
    let angle = REST;
    let flash = 0;
    let jolt = 0;
    for (const hit of hits) {
      if (t >= hit - 0.36 && t < hit) {
        const up = ease.outCubic(prog(t, hit - 0.36, hit - 0.11));
        const down = ease.inQuart(prog(t, hit - 0.11, hit));
        angle = lerp(lerp(REST, 54, up), 0, down);
      } else if (t >= hit && t < hit + 0.55) {
        const back = ease.outCubic(prog(t, hit + 0.04, hit + 0.5));
        angle = REST * back + Math.exp(-16 * (t - hit)) * Math.sin((t - hit) * 38) * 6;
      }
      if (t >= hit) {
        flash = Math.max(flash, 1 - prog(t, hit, hit + 0.24));
        jolt += Math.exp(-18 * (t - hit)) * Math.sin((t - hit) * 60) * 7;
      }
    }
    // a slow idle sway keeps the prop alive between strikes
    angle += Math.sin(t * 2.6) * 1.6;
    state.arm.setAttribute("transform", `translate(262 206) rotate(${angle.toFixed(2)})`);
    state.burst.setAttribute("opacity", flash.toFixed(3));
    state.card.style.transform = `rotate(-3deg) translateY(${jolt.toFixed(2)}px)`;

    const first = hits[0];
    const answered = t >= first;
    const text = answered ? (spec.lines?.[1] ?? "") : "?";
    if (state.who._t !== text) {
      state.who.textContent = text;
      state.who._t = text;
    }
    const pop = answered ? 1 + Math.exp(-10 * (t - first)) * 0.25 : 1;
    state.who.style.transform = `scale(${pop.toFixed(4)})`;
    state.who.style.transformOrigin = "0 50%";

    if (spec.tag) {
      const at = ctx.at(spec.tagAt ?? hits[hits.length - 1] + 0.15);
      const p = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(-12, -4, p).toFixed(2)}deg) scale(${lerp(0.5, 1, p).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    return (spec.hits ?? [0.6]).map((c) => ({ t: ctx.at(c), name: "thud", gain: 0.9 }));
  },
};

export default prop;
