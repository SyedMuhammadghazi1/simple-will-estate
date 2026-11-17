// A paper receipt: a title, small print, a total that counts up on cue, notes and a barcode.
// The paper stays paper-coloured whatever the mood, so it reads as a real object.
//
// spec: { title, subtitle, total, prefix, totalAt, countDur, notes: ["incl. ...", ...], barcode }

import { clamp, commas, ease, prog, settle, lerp } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const W = 420;
const H = 500;

function barcode() {
  const bars = [];
  let x = 0;
  for (let i = 0; i < 58; i++) {
    const w = [2, 3, 2, 4, 2, 3][(i * 7) % 6];
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="44" fill="#1b1b1f"/>`);
    x += w + 1.6;
  }
  return `<svg viewBox="0 0 ${x} 44" width="300" height="44" preserveAspectRatio="none">${bars.join("")}</svg>`;
}

const prop = {
  build(el, spec) {
    box(el, W, H);
    // zig-zag torn bottom edge
    const zig = [];
    for (let i = 0; i <= W / 14; i++) zig.push(`${i * 14}px calc(100% - ${i % 2 ? 0 : 12}px)`);
    const paper = h("div", {
      style: `position:absolute;inset:0;background:#f2f0ea;color:#1b1b1f;padding:30px 34px;clip-path:polygon(0 0,100% 0,${zig.reverse().join(",")});filter:drop-shadow(0 18px 30px rgba(0,0,0,0.45))`,
      html: `
        <div style="text-align:center;font:500 30px var(--font-mono);letter-spacing:0.22em">${esc(spec.title ?? "")}</div>
        <div style="text-align:center;font:500 18px var(--font-mono);letter-spacing:0.14em;color:#77756e;margin-top:8px">${esc(spec.subtitle ?? "")}</div>
        <div style="border-top:2px dashed #b9b6ad;margin:26px 0 18px"></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font:500 22px var(--font-mono);letter-spacing:0.16em;color:#55534d">TOTAL</span>
          <span data-total class="serif" style="font-size:96px;line-height:1;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums"></span>
        </div>
        <div style="border-top:2px dashed #b9b6ad;margin:18px 0 14px"></div>
        <div data-notes style="font:500 18px/27px var(--font-mono);letter-spacing:0.06em;color:#55534d;text-align:center;opacity:0">${(spec.notes ?? []).map(esc).join("<br>")}</div>
        <div data-bar style="display:flex;justify-content:center;margin-top:18px;opacity:0">${spec.barcode === false ? "" : barcode()}</div>`,
    });
    el.appendChild(paper);
    return {
      paper,
      total: paper.querySelector("[data-total]"),
      notes: paper.querySelector("[data-notes]"),
      bar: paper.querySelector("[data-bar]"),
    };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.totalAt ?? 0.5);
    const dur = spec.countDur ?? 0.7;
    const v = (spec.total ?? 0) * ease.outCubic(prog(t, at, at + dur));
    setText(state.total, t < at ? "" : `${spec.prefix ?? "$"}${commas(Math.round(v))}`);
    const done = at + dur;
    state.notes.style.opacity = clamp(prog(t, done, done + 0.25)).toFixed(3);
    state.bar.style.opacity = clamp(prog(t, done + 0.15, done + 0.4)).toFixed(3);
    // the receipt prints: it slides up out of an imaginary slot as it arrives, then rests
    const p = settle(t, 12);
    state.paper.style.transform = `translateY(${lerp(30, 0, p).toFixed(2)}px) rotate(${(Math.sin(t * 1.6) * 0.5).toFixed(3)}deg)`;
  },
  sfx(spec, ctx) {
    return [{ t: ctx.at(spec.totalAt ?? 0.5), name: "counter", dur: spec.countDur ?? 0.7 }];
  },
};

export default prop;
