// "The maths": lines of arithmetic that type themselves out in mono, one per cue, with a
// blinking block cursor. Results can be green, and the last line can be a big figure.
//
// spec: { label, w, lines: [{ text, at, kind: "line" | "result" | "rule" | "big" }] }
//   line    ink, typed
//   result  green, typed
//   rule    a thin line that draws across
//   big     a large green serif figure that appears in one go

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, h, setText } from "./_util.js";

const STEP = 0.032; // seconds per typed character

const prop = {
  build(el, spec) {
    const lines = spec.lines ?? [];
    const w = spec.w ?? 640;
    const heights = lines.map((l) => (l.kind === "rule" ? 26 : l.kind === "big" ? 150 : 72));
    const hgt = 56 + heights.reduce((a, b) => a + b, 0);
    box(el, w, hgt);
    const tops = [];
    let acc = 56;
    for (const hh of heights) {
      acc += hh;
      tops.push(acc);
    }
    const label = h(
      "div",
      {
        class: "mono",
        style: "font-size:26px;line-height:34px;color:var(--muted);text-align:center;height:56px",
      },
      spec.label ?? "The maths",
    );
    el.appendChild(label);
    let y = 56;
    const rows = lines.map((l, i) => {
      const kind = l.kind ?? "line";
      let row;
      if (kind === "rule") {
        row = h("div", {
          style: `position:absolute;left:0;top:${y + 10}px;width:100%;height:3px;background:var(--line);transform-origin:0 50%;transform:scaleX(0)`,
        });
      } else if (kind === "big") {
        row = h(
          "div",
          {
            class: "serif",
            style: `position:absolute;left:0;top:${y}px;width:100%;text-align:center;font-size:132px;line-height:150px;font-weight:500;letter-spacing:-0.02em;color:var(--green);white-space:nowrap;opacity:0`,
          },
          l.text,
        );
      } else {
        row = h("div", {
          style: `position:absolute;left:0;top:${y}px;width:100%;font:500 54px/72px var(--font-mono);letter-spacing:0;white-space:pre;color:${kind === "result" ? "var(--green)" : "var(--ink)"}`,
          html: `<span data-t></span><span data-c style="display:inline-block;width:26px;height:50px;margin-left:4px;vertical-align:-7px;background:var(--green);opacity:0"></span>`,
        });
      }
      y += heights[i];
      el.appendChild(row);
      return {
        row,
        kind,
        text: row.querySelector?.("[data-t]"),
        caret: row.querySelector?.("[data-c]"),
      };
    });
    // centre the block of typed lines on the widest one (mono: every character is 0.6em)
    const longest = Math.max(
      1,
      ...lines.filter((l) => !["rule", "big"].includes(l.kind)).map((l) => l.text.length),
    );
    const textW = longest * 54 * 0.6;
    const pad = Math.max(0, (w - textW) / 2);
    for (const r of rows)
      if (r.kind === "line" || r.kind === "result") r.row.style.paddingLeft = `${pad}px`;
    return { rows, el, tops };
  },

  update(state, t, ctx) {
    const lines = ctx.spec.lines ?? [];
    // the card is as tall as the lines shown so far, and grows as each one arrives
    let hNow = state.tops[0] ?? 56;
    let bigAt = Infinity;
    lines.forEach((l, i) => {
      const at = ctx.at(l.at ?? 0.2 + i * 0.6);
      const prev = i > 0 ? state.tops[i - 1] : 56;
      hNow = Math.max(
        hNow,
        lerp(prev, state.tops[i], ease.outCubic(prog(t, at - 0.12, at + 0.12))),
      );
      if (l.kind === "big") bigAt = Math.min(bigAt, at);
    });
    state.el.style.height = `${hNow.toFixed(1)}px`;
    let lastTyping = -1;
    state.rows.forEach((r, i) => {
      const at = ctx.at(lines[i].at ?? 0.2 + i * 0.6);
      if (r.kind === "rule") {
        r.row.style.transform = `scaleX(${ease.outCubic(prog(t, at, at + 0.3)).toFixed(4)})`;
      } else if (r.kind === "big") {
        const p = settle(t - at, 16);
        r.row.style.opacity = clamp(prog(t, at, at + 0.08)).toFixed(3);
        r.row.style.transform = `scale(${lerp(0.82, 1, p).toFixed(4)})`;
      } else {
        const full = lines[i].text ?? "";
        const n = t < at ? 0 : Math.min(full.length, Math.floor((t - at) / STEP) + 1);
        setText(r.text, full.slice(0, n));
        if (t >= at) lastTyping = i;
      }
    });
    // one cursor, after the latest line that has started typing; it blinks once that line is done
    state.rows.forEach((r, i) => {
      if (!r.caret) return;
      const at = ctx.at(lines[i].at ?? 0.2 + i * 0.6);
      const done = t >= at + (lines[i].text ?? "").length * STEP;
      const on = t < bigAt && i === lastTyping && (!done || Math.floor(t * 2.4) % 2 === 0);
      r.caret.style.opacity = on ? "1" : "0";
    });
  },

  sfx(spec, ctx) {
    const cues = [];
    (spec.lines ?? []).forEach((l, i) => {
      const at = ctx.at(l.at ?? 0.2 + i * 0.6);
      if (l.kind === "big") cues.push({ t: at, name: "pop" });
      else if (l.kind !== "rule") {
        for (let k = 0; k < (l.text ?? "").length; k += 3)
          cues.push({ t: at + k * STEP, name: "key", gain: 0.45 });
      }
    });
    return cues;
  },
};

export default prop;
