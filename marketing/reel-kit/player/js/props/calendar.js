// A desk-calendar page showing one date, with optional earlier dates on slips beside it that get
// crossed out on cue ("it moved twice, this is the one"). A rubber stamp can land on the page.
//
// spec: {
//   month, day, weekday, year,          the date on the page ("NOV", 19, "Thursday", 2026)
//   struck: [{ text, at }],             earlier dates: each slip pops in and is struck through
//   stamp, stampAt, stampColor, stampRot,
//   stampX, stampY                      stamp centre in % of the page (default 22, 102: across
//                                       the bottom-left corner, clear of the date)
// }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const PAGE_W = 310;
const PAGE_H = 380;

const prop = {
  // the slips on the left pop in later, so the page is the leading edge
  leadInset: (spec) => ((spec.struck ?? []).length ? 290 : 0),

  build(el, spec) {
    const struck = spec.struck ?? [];
    const left = struck.length ? 290 : 0;
    box(el, left + PAGE_W, PAGE_H + 30);
    const page = h("div", {
      style: `position:absolute;left:${left}px;top:30px;width:${PAGE_W}px;height:${PAGE_H}px;background:var(--card);border:3.5px solid var(--line);border-radius:20px;box-shadow:10px 11px 0 var(--shadow);overflow:hidden;text-align:center`,
      html: `
        <div style="height:86px;background:var(--amber);border-bottom:3.5px solid var(--line);display:flex;align-items:center;justify-content:center">
          <span class="mono" style="font-size:40px;letter-spacing:0.22em;color:#fff;margin-right:-0.22em">${esc(spec.month ?? "")}</span>
        </div>
        <div data-day class="serif" style="font-size:186px;line-height:1.02;font-weight:600;letter-spacing:-0.03em;color:var(--ink);margin-top:6px">${esc(spec.day ?? "")}</div>
        <div class="mono" style="font-size:27px;color:var(--ink);margin-top:2px">${esc(spec.weekday ?? "")}</div>
        <div class="mono" style="font-size:21px;color:var(--muted);margin-top:6px">${esc(spec.year ?? "")}</div>`,
    });
    // two binder rings over the top edge
    const rings = [78, PAGE_W - 78].map((x) =>
      h("div", {
        style: `position:absolute;left:${left + x - 13}px;top:6px;width:26px;height:58px;border-radius:13px;background:var(--cardAlt);border:3.5px solid var(--line)`,
      }),
    );
    const slips = struck.map((s, i) => {
      const slip = h("div", {
        class: "card",
        style: `position:absolute;left:${i % 2 ? 24 : 0}px;top:${78 + i * 112}px;width:252px;height:88px;border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:6px 7px 0 var(--shadow);opacity:0`,
        html: `<span data-t style="font:650 31px var(--font-ui);color:var(--ink);white-space:nowrap">${esc(s.text ?? "")}</span>
               <div data-line style="position:absolute;left:18px;right:18px;top:50%;height:5px;margin-top:-2.5px;opacity:0.85;border-radius:3px;background:var(--red);transform-origin:0 50%;transform:scaleX(0)"></div>`,
      });
      return {
        slip,
        text: slip.querySelector("[data-t]"),
        line: slip.querySelector("[data-line]"),
      };
    });
    const stamp = h(
      "div",
      {
        style: `position:absolute;left:${left + (PAGE_W * (spec.stampX ?? 22)) / 100}px;top:${30 + (PAGE_H * (spec.stampY ?? 102)) / 100}px;padding:10px 22px 8px;border:6px solid ${spec.stampColor ?? "var(--green)"};border-radius:14px;color:${spec.stampColor ?? "var(--green)"};font:500 ${(spec.stamp ?? "").length > 9 ? 31 : 40}px var(--font-mono);letter-spacing:0.1em;white-space:nowrap;text-transform:uppercase;background:var(--card);opacity:0`,
      },
      spec.stamp ?? "",
    );
    el.append(...slips.map((s) => s.slip), page, ...rings, stamp);
    return { page, slips, stamp, day: page.querySelector("[data-day]") };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    (spec.struck ?? []).forEach((s, i) => {
      const at = ctx.at(s.at ?? 0.3 + i * 0.5);
      const { slip, text, line } = state.slips[i];
      const p = settle(t - at, 18);
      slip.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      slip.style.transform = `rotate(${(i % 2 ? 4 : -5) * (2 - p)}deg) scale(${lerp(0.5, 1, p).toFixed(4)})`;
      // the strike follows the slip in, like a pen crossing it out
      const cut = ease.outCubic(prog(t, at + 0.4, at + 0.58));
      line.style.transform = `scaleX(${cut.toFixed(4)})`;
      text.style.opacity = lerp(1, 0.8, cut).toFixed(3);
    });

    let shake = 0;
    if (spec.stamp) {
      const st = ctx.at(spec.stampAt ?? 1);
      const land = 0.11;
      const p = ease.inQuart(prog(t, st - land, st));
      state.stamp.style.opacity = clamp(prog(t, st - land, st - land * 0.4)).toFixed(3);
      const wobble = t > st ? Math.exp(-14 * (t - st)) * Math.sin((t - st) * 46) * 0.06 : 0;
      state.stamp.style.transform = `translate(-50%, -50%) rotate(${spec.stampRot ?? -9}deg) scale(${(lerp(2.5, 1, p) + wobble).toFixed(4)})`;
      shake = t > st ? Math.exp(-16 * (t - st)) * Math.sin((t - st) * 70) * 8 : 0;
    }
    // a slow rock keeps the page alive between the things that happen to it
    const rock = Math.sin(t * 1.8 + (ctx.seed ?? 0)) * 0.6;
    state.page.style.transform = `translate(${(shake * 0.5).toFixed(2)}px, ${shake.toFixed(2)}px) rotate(${rock.toFixed(3)}deg)`;
  },

  sfx(spec, ctx) {
    const cues = [];
    (spec.struck ?? []).forEach((s, i) => {
      const at = ctx.at(s.at ?? 0.3 + i * 0.5);
      cues.push({ t: at, name: "pop", gain: 0.8 }, { t: at + 0.4, name: "tick", pitch: 0.7 });
    });
    if (spec.stamp) cues.push({ t: ctx.at(spec.stampAt ?? 1), name: "stamp" });
    return cues;
  },
};

export default prop;
