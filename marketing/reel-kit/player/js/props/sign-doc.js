// A document being signed: the main signature writes itself on cue, then each witness signs.
//
// spec: { title, subtitle, signAt, signer, witnesses: [{ label, at }], tag, tagAt }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { person } from "./_art.js";
import { box, esc, h } from "./_util.js";

// hand-drawn signature strokes (original scribbles, not anyone's name)
const SIG_MAIN =
  "M6 46 C18 8 30 6 28 34 C26 58 16 60 24 40 C34 14 48 14 46 36 C45 50 54 44 60 30 C66 16 74 22 70 36 C68 46 78 46 86 30 C92 18 100 22 98 34 C97 44 108 42 118 28 C128 14 140 20 134 34 C130 44 150 42 176 30 C198 20 214 22 232 26";
const SIG_W = [
  "M4 30 C12 6 22 8 20 24 C18 38 28 34 34 20 C40 8 48 14 46 24 C45 32 56 30 64 18 C72 8 82 14 80 24 C79 32 96 28 118 20",
  "M4 22 C10 34 18 34 22 18 C26 4 34 8 32 22 C31 32 42 32 48 18 C52 8 62 12 60 22 C59 30 70 30 80 16 C88 6 98 20 122 18",
];

const prop = {
  build(el, spec) {
    box(el, 600, 440);
    const witnesses = spec.witnesses ?? [];
    const sheet = h("div", {
      style:
        "position:absolute;left:0;top:0;width:392px;height:440px;background:var(--card);border:3.5px solid var(--line);border-radius:16px;box-shadow:10px 11px 0 var(--shadow);padding:26px 30px;transform:rotate(-2.5deg)",
      html: `<div class="mono" style="font-size:18px;color:var(--muted)">${esc(spec.subtitle ?? "")}</div>
        <div class="serif" style="font-size:50px;line-height:1.05;font-weight:640;color:var(--ink);margin-top:6px">${esc(spec.title ?? "")}</div>
        ${[96, 88, 93, 60].map((p) => `<div style="height:10px;width:${p}%;margin-top:15px;border-radius:5px;background:var(--line);opacity:0.15"></div>`).join("")}
        <div style="position:absolute;left:30px;right:30px;bottom:34px">
          <svg viewBox="0 0 240 64" width="250" height="66" style="overflow:visible;display:block"><path data-sig d="${SIG_MAIN}" fill="none" stroke="var(--navy)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div style="border-top:3.5px solid var(--line);margin-top:2px;padding-top:7px" class="mono"><span style="font-size:17px;color:var(--muted)">${esc(spec.signer ?? "")}</span></div>
        </div>`,
    });
    const sig = sheet.querySelector("[data-sig]");
    const side = h("div", { style: "position:absolute;left:418px;top:66px;width:210px" });
    const wEls = witnesses.map((w, i) => {
      const card = h("div", {
        class: "card",
        style: `width:204px;height:150px;margin-bottom:22px;padding:14px 16px;transform:rotate(${i % 2 ? -3 : 3}deg);opacity:0;box-shadow:7px 8px 0 var(--shadow)`,
        html: `<div style="display:flex;align-items:center;gap:10px">
                 <div style="width:46px;height:46px">${person(46, i % 2 ? "var(--amber)" : "var(--green)", { bg: "var(--cardAlt)" })}</div>
                 <div class="mono" style="font-size:17px;color:var(--ink)">${esc(w.label ?? `witness ${i + 1}`)}</div>
               </div>
               <svg viewBox="0 0 124 40" width="160" height="50" style="overflow:visible;display:block;margin-top:6px"><path data-w d="${SIG_W[i % 2]}" fill="none" stroke="var(--navy)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
               <div style="border-top:3px solid var(--line);margin-top:0"></div>`,
      });
      side.appendChild(card);
      return { card, path: card.querySelector("[data-w]") };
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style:
          "position:absolute;left:120px;top:-34px;background:var(--gold);color:#1c1917;opacity:0",
      },
      spec.tag ?? "",
    );
    el.append(sheet, side, tag);
    // measure once so the stroke can be revealed by dash offset
    const len = sig.getTotalLength();
    sig.setAttribute("stroke-dasharray", `${len}`);
    wEls.forEach((w) => {
      w.len = w.path.getTotalLength();
      w.path.setAttribute("stroke-dasharray", `${w.len}`);
    });
    return { sig, len, wEls, tag };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const signAt = ctx.at(spec.signAt ?? 0.3);
    const sp = ease.inOutQuad(prog(t, signAt, signAt + (spec.signDur ?? 0.55)));
    state.sig.setAttribute("stroke-dashoffset", (state.len * (1 - sp)).toFixed(2));
    (spec.witnesses ?? []).forEach((w, i) => {
      const at = ctx.at(w.at ?? 1 + i * 0.3);
      const el = state.wEls[i];
      const p = settle(t - at, 18);
      el.card.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      el.card.style.transform = `translateX(${((1 - p) * 60).toFixed(2)}px) rotate(${i % 2 ? -3 : 3}deg) scale(${lerp(0.7, 1, p).toFixed(4)})`;
      const wp = ease.inOutQuad(prog(t, at + 0.12, at + 0.45));
      el.path.setAttribute("stroke-dashoffset", (el.len * (1 - wp)).toFixed(2));
    });
    if (spec.tag) {
      const at = ctx.at(spec.tagAt ?? "end-0.8");
      const p = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(-12, -6, p).toFixed(2)}deg) scale(${lerp(0.5, 1, p).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const cues = [{ t: ctx.at(spec.signAt ?? 0.3), name: "scribble", dur: spec.signDur ?? 0.55 }];
    (spec.witnesses ?? []).forEach((w, i) => {
      const at = ctx.at(w.at ?? 1 + i * 0.3);
      cues.push({ t: at, name: "pop", pitch: 1 + i * 0.15 });
      cues.push({ t: at + 0.12, name: "scribble", dur: 0.32, gain: 0.7 });
    });
    return cues;
  },
};

export default prop;
