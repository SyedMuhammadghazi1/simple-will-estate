// Two people and what passes between them. The link snaps on cue and a value lands under the
// second person. Used for "your partner gets nothing" style beats.
//
// spec: { left: { label, color }, right: { label, color }, breakAt, valueLabel, value, valueAt,
//         valueLabelAt   the card and its label may arrive before the value lands in it, so a
//                        scope line ("no will, most states") has time to be read,
//         tag, tagAt }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { person } from "./_art.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec) {
    box(el, 620, 380);
    const mk = (side, cfg, x) =>
      h("div", {
        style: `position:absolute;left:${x}px;top:0;width:190px;text-align:center`,
        html: `<div data-av="${side}" style="width:170px;height:170px;margin:0 auto;filter:drop-shadow(7px 8px 0 var(--shadow))">${person(170, cfg?.color ?? "var(--navy)", { bg: cfg?.bg ?? "var(--navySoft)" })}</div>
               <div class="mono" style="font-size:22px;color:var(--ink);margin:14px -30px 0;white-space:nowrap">${esc(cfg?.label ?? "")}</div>`,
      });
    const left = mk("l", spec.left, 10);
    const right = mk("r", spec.right, 420);
    const link = h("div", {
      style: "position:absolute;left:192px;top:50px;width:236px;height:80px",
      html: `<svg viewBox="0 0 236 80" width="236" height="80" style="overflow:visible">
        <path data-a d="M6 40 H92" fill="none" stroke="var(--line)" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>
        <path data-b d="M144 40 H230" fill="none" stroke="var(--line)" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>
        <g data-heart transform="translate(118 40)">
          <path data-hl d="M0 22 C-22 6 -28 -6 -28 -13 A14 14 0 0 1 0 -17 Z" fill="var(--red)" stroke="var(--line)" stroke-width="3.6" stroke-linejoin="round"/>
          <path data-hr d="M0 22 C22 6 28 -6 28 -13 A14 14 0 0 0 0 -17 Z" fill="var(--red)" stroke="var(--line)" stroke-width="3.6" stroke-linejoin="round"/>
        </g>
      </svg>`,
    });
    const value = h("div", {
      class: "card",
      style:
        "position:absolute;left:420px;top:232px;width:220px;min-height:128px;padding:16px 24px;transform-origin:50% 0;opacity:0",
      // "\n" in valueLabel breaks the line, so the number can carry its own scope
      html: `<div class="mono" style="font-size:21px;line-height:25px;letter-spacing:0.08em;color:var(--muted);white-space:nowrap">${esc(spec.valueLabel ?? "").replace(/\n/g, "<br>")}</div>
             <div data-num class="serif" style="display:inline-block;transform-origin:0 70%;font-size:66px;line-height:1.05;font-weight:640;color:var(--red)">${esc(spec.value ?? "")}</div>`,
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style:
          "position:absolute;left:8px;top:262px;background:var(--gold);color:#1c1917;opacity:0;font-size:21px;padding:9px 14px 8px",
      },
      spec.tag ?? "",
    );
    el.append(left, right, link, value, tag);
    return {
      a: link.querySelector("[data-a]"),
      b: link.querySelector("[data-b]"),
      hl: link.querySelector("[data-hl]"),
      hr: link.querySelector("[data-hr]"),
      heart: link.querySelector("[data-heart]"),
      rightAv: right.querySelector("[data-av]"),
      value,
      num: value.querySelector("[data-num]"),
      tag,
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const brk = ctx.at(spec.breakAt ?? 0.9);
    const beat = 1 + Math.max(0, Math.sin(t * 9)) * 0.08 * (t < brk ? 1 : 0);
    const split = ease.outCubic(prog(t, brk, brk + 0.3));
    state.heart.setAttribute("transform", `translate(118 40) scale(${beat.toFixed(4)})`);
    state.hl.setAttribute(
      "transform",
      `translate(${(-split * 16).toFixed(2)} ${(split * 10).toFixed(2)}) rotate(${(-split * 18).toFixed(2)})`,
    );
    state.hr.setAttribute(
      "transform",
      `translate(${(split * 16).toFixed(2)} ${(split * 10).toFixed(2)}) rotate(${(split * 18).toFixed(2)})`,
    );
    const grey = clamp(split);
    for (const half of [state.hl, state.hr])
      half.style.fill = grey > 0.5 ? "var(--muted)" : "var(--red)";
    state.b.style.opacity = (1 - split * 0.85).toFixed(3);
    state.a.setAttribute("stroke-dashoffset", (-t * 30).toFixed(1));
    state.b.setAttribute("stroke-dashoffset", (-Math.min(t, brk) * 30).toFixed(1));
    state.rightAv.style.filter = `drop-shadow(7px 8px 0 var(--shadow)) saturate(${(1 - grey * 0.75).toFixed(3)})`;

    const vAt = spec.valueAt != null ? ctx.at(spec.valueAt) : brk + 0.12;
    const cAt = spec.valueLabelAt != null ? Math.min(vAt, ctx.at(spec.valueLabelAt)) : vAt;
    const cp = settle(t - cAt, 18);
    state.value.style.opacity = clamp(prog(t, cAt, cAt + 0.08)).toFixed(3);
    state.value.style.transform = `rotate(${lerp(8, 3, cp).toFixed(2)}deg) scale(${lerp(0.6, 1, cp).toFixed(4)})`;
    const np = settle(t - vAt, 22);
    state.num.style.opacity = clamp(prog(t, vAt, vAt + 0.06)).toFixed(3);
    state.num.style.transform = `scale(${lerp(cAt < vAt ? 1.8 : 1, 1, np).toFixed(4)})`;
    if (spec.tag) {
      const at = ctx.at(spec.tagAt ?? 0.25);
      const p = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(-12, -5, p).toFixed(2)}deg) scale(${lerp(0.5, 1, p).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const brk = ctx.at(spec.breakAt ?? 0.9);
    const cues = [{ t: brk, name: "buzz", gain: 0.8 }];
    const vAt = spec.valueAt != null ? ctx.at(spec.valueAt) : brk + 0.12;
    cues.push({ t: vAt, name: "pop" });
    if (spec.valueLabelAt != null && ctx.at(spec.valueLabelAt) < vAt) {
      cues.push({ t: ctx.at(spec.valueLabelAt), name: "tick", gain: 0.8 });
    }
    return cues;
  },
};

export default prop;
