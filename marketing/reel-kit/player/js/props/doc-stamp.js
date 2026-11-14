// An official-looking document that can be authored, stamped and annotated across several beats.
// Use `span` to keep it on the pad while the captions move on.
//
// spec: {
//   title, subtitle,
//   bylineLabel, byline, typeAt,       a "written by:" line whose value types itself in
//   stamp, stampAt, stampColor,        rubber stamp that slams down
//   chip, chipAt,                      small pill that pops in under the stamp (e.g. "opened: never")
//   w, h
// }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h, setText } from "./_util.js";

const prop = {
  build(el, spec) {
    const w = spec.w ?? 440;
    const hgt = spec.h ?? 520;
    box(el, w, hgt);
    const sheet = h("div", {
      style: `position:absolute;inset:0;background:var(--card);border:3.5px solid var(--line);border-radius:16px;box-shadow:10px 11px 0 var(--shadow);overflow:hidden;`,
      html: `
        <div style="height:16px;background:var(--navy);border-bottom:3.5px solid var(--line)"></div>
        <div style="padding:26px 34px 0">
          <div class="mono" style="font-size:19px;color:var(--muted)">${esc(spec.subtitle ?? "")}</div>
          <div class="serif" style="font-size:58px;line-height:1.04;font-weight:640;margin-top:8px;color:var(--ink)">${esc(spec.title ?? "")}</div>
          <div style="margin-top:22px;padding:14px 0 13px;border-top:3px solid var(--cardAlt);border-bottom:3px solid var(--cardAlt);white-space:nowrap">
            <span class="mono" style="font-size:19px;color:var(--muted)">${esc(spec.bylineLabel ?? "")}</span>
            <span data-byline style="font:650 30px var(--font-ui);color:var(--accent);margin-left:10px"></span><span data-caret style="display:inline-block;width:3.5px;height:29px;background:var(--ink);margin-left:3px;vertical-align:-5px"></span>
          </div>
          <div data-lines style="margin-top:24px"></div>
        </div>`,
    });
    const lines = sheet.querySelector("[data-lines]");
    const widths = [100, 92, 97, 64, 0, 100, 88, 95, 72];
    widths.forEach((pct) => {
      lines.appendChild(
        h("div", {
          style: `height:${pct ? 10 : 12}px;width:${pct}%;margin-bottom:15px;border-radius:5px;background:var(--line);opacity:${pct ? 0.15 : 0}`,
        }),
      );
    });
    const stamp = h(
      "div",
      {
        style: `position:absolute;left:50%;top:60%;padding:12px 26px 10px;border:6px solid ${spec.stampColor ?? "var(--red)"};border-radius:14px;color:${spec.stampColor ?? "var(--red)"};font:500 46px var(--font-mono);letter-spacing:0.1em;white-space:nowrap;text-transform:uppercase;background:color-mix(in srgb, var(--card) 86%, transparent);opacity:0;`,
      },
      spec.stamp ?? "",
    );
    const chip = h(
      "div",
      {
        class: "tag",
        style: "position:absolute;left:50%;top:86%;background:var(--gold);color:#1c1917;opacity:0",
      },
      spec.chip ?? "",
    );
    el.append(sheet, stamp, chip);
    return {
      sheet,
      stamp,
      chip,
      byline: sheet.querySelector("[data-byline]"),
      caret: sheet.querySelector("[data-caret]"),
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const text = spec.byline ?? "";
    const typeAt = ctx.at(spec.typeAt ?? 0.3);
    const step = 0.045;
    const n = t < typeAt ? 0 : clamp(Math.floor((t - typeAt) / step) + 1, 0, text.length);
    setText(state.byline, text.slice(0, n));
    const typing = n > 0 && n < text.length;
    state.caret.style.opacity = typing || Math.floor(t * 2.6) % 2 === 0 ? "1" : "0";

    // the stamp arrives big and fast, lands, and the sheet takes the hit
    let shake = 0;
    if (spec.stamp) {
      const st = ctx.at(spec.stampAt ?? 1);
      const land = 0.11;
      const p = ease.inQuart(prog(t, st - land, st));
      state.stamp.style.opacity = clamp(prog(t, st - land, st - land * 0.4)).toFixed(3);
      const settle = t > st ? Math.exp(-14 * (t - st)) * Math.sin((t - st) * 46) * 0.06 : 0;
      const s = lerp(2.5, 1, p) + settle;
      state.stamp.style.transform = `translate(-50%, -50%) rotate(${spec.stampRot ?? -11}deg) scale(${s.toFixed(4)})`;
      shake = t > st ? Math.exp(-16 * (t - st)) * Math.sin((t - st) * 70) * 9 : 0;
    }
    state.sheet.style.transform = `translate(${(shake * 0.5).toFixed(2)}px, ${shake.toFixed(2)}px)`;

    if (spec.chip) {
      const ct = ctx.at(spec.chipAt ?? 2);
      const p = settle(t - ct, 18);
      state.chip.style.opacity = clamp(prog(t, ct, ct + 0.08)).toFixed(3);
      state.chip.style.transform = `translate(-50%, -50%) rotate(${spec.chipRot ?? 4}deg) scale(${lerp(0.6, 1, p).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const cues = [];
    const text = spec.byline ?? "";
    const typeAt = ctx.at(spec.typeAt ?? 0.3);
    for (let i = 0; i < text.length; i += 2)
      cues.push({ t: typeAt + i * 0.045, name: "key", gain: 0.7 });
    if (spec.stamp) cues.push({ t: ctx.at(spec.stampAt ?? 1), name: "stamp" });
    if (spec.chip) cues.push({ t: ctx.at(spec.chipAt ?? 2), name: "pop" });
    return cues;
  },
};

export default prop;
