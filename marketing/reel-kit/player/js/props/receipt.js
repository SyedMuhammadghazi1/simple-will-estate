// A paper receipt: a title, line items that print one by one, a total that counts up to land on
// a cue, a source line and a barcode. The paper is sized to its content and stays paper-coloured
// whatever the mood, so it reads as a real object.
//
// spec: { title, subtitle, items: [{ label, value }], itemsAt, total, prefix, totalAt, totalEnd,
//         countDur, source, barcode }
//   items     printed 0.22 s apart from itemsAt; `value` is free text ("incl.")
//   totalEnd  a cue the total finishes counting on (the word that says it)

import { clamp, commas, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const W = 440;
const ROW = 44;

function barcode() {
  const bars = [];
  let x = 0;
  for (let i = 0; i < 58; i++) {
    const w = [2, 3, 2, 4, 2, 3][(i * 7) % 6];
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="40" fill="#1b1b1f"/>`);
    x += w + 1.6;
  }
  return `<svg viewBox="0 0 ${x} 40" width="300" height="40" preserveAspectRatio="none">${bars.join("")}</svg>`;
}

const prop = {
  build(el, spec) {
    const items = spec.items ?? [];
    const hasBar = spec.barcode !== false;
    const H =
      150 +
      items.length * ROW +
      (items.length ? 30 : 0) +
      130 +
      (spec.source ? 44 : 0) +
      (hasBar ? 64 : 0) +
      30;
    box(el, W, H);
    const zig = [];
    for (let i = 0; i <= W / 14; i++) zig.push(`${i * 14}px calc(100% - ${i % 2 ? 0 : 12}px)`);
    const paper = h("div", {
      style: `position:absolute;inset:0;background:#f2f0ea;color:#1b1b1f;padding:30px 34px;clip-path:polygon(0 0,100% 0,${zig.reverse().join(",")});`,
      html: `
        <div style="text-align:center;font:500 32px/38px var(--font-mono);letter-spacing:0.22em;margin-right:-0.22em">${esc(spec.title ?? "")}</div>
        <div style="text-align:center;font:500 20px/26px var(--font-mono);letter-spacing:0.12em;color:#77756e;margin-top:8px">${esc(spec.subtitle ?? "")}</div>
        <div style="border-top:2px dashed #b9b6ad;margin:22px 0 14px"></div>
        ${items
          .map(
            (it) =>
              `<div data-row style="display:flex;justify-content:space-between;height:${ROW}px;align-items:center;font:500 23px var(--font-mono);letter-spacing:0.04em;opacity:0"><span>${esc(it.label ?? "")}</span><span style="color:#77756e">${esc(it.value ?? "")}</span></div>`,
          )
          .join("")}
        ${items.length ? `<div style="border-top:2px dashed #b9b6ad;margin:14px 0 14px"></div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:baseline;height:110px">
          <span style="font:500 24px var(--font-mono);letter-spacing:0.16em;color:#55534d">TOTAL</span>
          <span data-total class="serif" style="font-size:98px;line-height:110px;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums"></span>
        </div>
        ${spec.source ? `<div style="font:500 21px/28px var(--font-mono);letter-spacing:0.04em;color:#55534d;text-align:center;margin-top:16px">${esc(spec.source)}</div>` : ""}
        ${hasBar ? `<div style="display:flex;justify-content:center;margin-top:20px">${barcode()}</div>` : ""}`,
    });
    const shadow = h("div", {
      style: "position:absolute;inset:0;filter:drop-shadow(0 18px 30px rgba(0,0,0,0.5))",
    });
    shadow.appendChild(paper);
    el.appendChild(shadow);
    return {
      shadow,
      total: paper.querySelector("[data-total]"),
      rows: [...paper.querySelectorAll("[data-row]")],
    };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const itemsAt = ctx.at(spec.itemsAt ?? 0.25);
    state.rows.forEach((row, i) => {
      const at = itemsAt + i * 0.22;
      const p = ease.outCubic(prog(t, at, at + 0.18));
      row.style.opacity = p.toFixed(3);
      row.style.transform = `translateX(${lerp(-14, 0, p).toFixed(2)}px)`;
    });
    const at = ctx.at(spec.totalAt ?? 0.3);
    const end = spec.totalEnd != null ? ctx.at(spec.totalEnd) : at + (spec.countDur ?? 0.7);
    const v = (spec.total ?? 0) * ease.outCubic(prog(t, at, Math.max(at + 0.2, end)));
    setText(state.total, `${spec.prefix ?? "$"}${commas(Math.round(v))}`);
    const p = settle(t, 12);
    state.shadow.style.transform = `translateY(${lerp(30, 0, p).toFixed(2)}px) rotate(${(Math.sin(t * 1.6) * 0.5).toFixed(3)}deg)`;
    state.shadow.style.opacity = clamp(prog(t, 0, 0.1)).toFixed(3);
  },
  sfx(spec, ctx) {
    const cues = (spec.items ?? []).map((_, i) => ({
      t: ctx.at(spec.itemsAt ?? 0.25) + i * 0.22,
      name: "tick",
      pitch: 0.8 + i * 0.1,
      gain: 0.8,
    }));
    const at = ctx.at(spec.totalAt ?? 0.3);
    const end = spec.totalEnd != null ? ctx.at(spec.totalEnd) : at + (spec.countDur ?? 0.7);
    cues.push({ t: at, name: "counter", dur: Math.max(0.2, end - at) });
    return cues;
  },
};

export default prop;
