// "Who gets what" as decided by a rulebook: a few belongings on the left feed a ranked list on
// the right. Rows show an ORDER (1st, 2nd, ...) and a question mark, never bars or fractions:
// anything that reads as a share would be wrong somewhere, because shares depend on the state
// and on who survives. One row can be spotlighted on cue.
//
// spec: { title, items: ["home","car","savings"], rows: [{ label }], rowsAt,
//         highlight: { row, at }, tag, tagAt }

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { box, esc, h } from "./_util.js";

const ICONS = {
  home: `<path d="M8 32 L32 10 L56 32 V56 H8 Z" fill="var(--gold)" stroke="var(--line)" stroke-width="3.4" stroke-linejoin="round"/><rect x="26" y="38" width="12" height="18" fill="var(--navy)" stroke="var(--line)" stroke-width="3"/>`,
  car: `<path d="M6 44 V34 l8 -3 6 -13 h24 l6 13 8 3 v10 Z" fill="var(--red)" stroke="var(--line)" stroke-width="3.4" stroke-linejoin="round"/><circle cx="19" cy="46" r="7" fill="var(--card)" stroke="var(--line)" stroke-width="3.2"/><circle cx="45" cy="46" r="7" fill="var(--card)" stroke="var(--line)" stroke-width="3.2"/><path d="M22 30 l4 -9 h12 l4 9 Z" fill="var(--sky)" stroke="var(--line)" stroke-width="2.6" stroke-linejoin="round"/>`,
  savings: `<ellipse cx="32" cy="46" rx="20" ry="8" fill="var(--goldDeep)" stroke="var(--line)" stroke-width="3.2"/><ellipse cx="32" cy="38" rx="20" ry="8" fill="var(--gold)" stroke="var(--line)" stroke-width="3.2"/><ellipse cx="32" cy="29" rx="20" ry="8" fill="var(--gold)" stroke="var(--line)" stroke-width="3.2"/><path d="M32 23 v12 M27.5 26.5 h7 a2.6 2.6 0 0 1 0 5.2 h-5 " fill="none" stroke="var(--line)" stroke-width="2.6" stroke-linecap="round"/>`,
  ring: `<circle cx="32" cy="40" r="15" fill="none" stroke="var(--gold)" stroke-width="7"/><circle cx="32" cy="40" r="15" fill="none" stroke="var(--line)" stroke-width="2" /><path d="M24 18 l8 -8 8 8 -8 8 Z" fill="var(--sky)" stroke="var(--line)" stroke-width="3" stroke-linejoin="round"/>`,
  pet: `<circle cx="32" cy="38" r="16" fill="var(--goldDeep)" stroke="var(--line)" stroke-width="3.4"/><path d="M17 30 l-5 -15 13 6 Z M47 30 l5 -15 -13 6 Z" fill="var(--goldDeep)" stroke="var(--line)" stroke-width="3.2" stroke-linejoin="round"/><circle cx="26" cy="36" r="2.6" fill="var(--line)"/><circle cx="38" cy="36" r="2.6" fill="var(--line)"/><path d="M29 43 q3 3 6 0" fill="none" stroke="var(--line)" stroke-width="2.6" stroke-linecap="round"/>`,
};

const prop = {
  // the belongings on the left pop in after arrival, so the card is the leading edge
  leadInset: () => 222,

  build(el, spec) {
    const w = spec.w ?? 640;
    const hgt = spec.h ?? 400;
    box(el, w, hgt);
    const items = spec.items ?? ["home", "car", "savings"];
    const rows = spec.rows ?? [];
    const left = h("div", { style: "position:absolute;left:0;top:34px;width:150px" });
    const itemEls = items.map((name, i) => {
      const it = h("div", {
        class: "card",
        style: `position:absolute;left:${i % 2 ? 26 : 0}px;top:${i * 112}px;width:104px;height:104px;border-radius:20px;display:flex;align-items:center;justify-content:center;box-shadow:6px 7px 0 var(--shadow)`,
        html: `<svg viewBox="0 0 64 64" width="70" height="70">${ICONS[name] ?? ICONS.savings}</svg>`,
      });
      left.appendChild(it);
      return it;
    });
    const arrow = h("div", {
      style: "position:absolute;left:150px;top:172px;width:60px;height:40px",
      html: `<svg viewBox="0 0 60 40" width="60" height="40" style="overflow:visible"><path d="M4 20 H44 M32 7 L48 20 L32 33" fill="none" stroke="var(--line)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    });
    const card = h("div", {
      class: "card",
      style: `position:absolute;left:222px;top:0;width:${w - 222}px;height:${hgt}px;padding:32px 26px 22px;`,
      html: `<div class="mono" style="font-size:22px;color:var(--muted);white-space:nowrap">${esc(spec.title ?? "")}</div>
             <div data-rows style="margin-top:14px"></div>`,
    });
    const rowWrap = card.querySelector("[data-rows]");
    const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
    const rowEls = rows.map((r, i) => {
      const row = h("div", {
        style:
          "position:relative;display:flex;align-items:center;gap:14px;height:62px;padding:0 10px;margin:0 -10px;border-radius:14px;",
        html: `<div data-glow style="position:absolute;inset:3px 0;border-radius:14px;background:var(--gold);border:3px solid var(--line);opacity:0"></div>
               <div class="mono" style="position:relative;width:62px;font-size:23px;letter-spacing:0.04em;color:var(--accent)">${ORDINALS[i] ?? i + 1}</div>
               <div style="position:relative;font:650 30px var(--font-ui);color:var(--ink);white-space:nowrap">${esc(r.label)}</div>
               <div data-lead style="position:relative;flex:1;height:0;border-top:4px dotted var(--line);opacity:0.28;transform-origin:0 50%"></div>
               <div data-q style="position:relative;width:22px;font:700 30px var(--font-ui);color:var(--muted)">?</div>`,
      });
      rowWrap.appendChild(row);
      return {
        row,
        glow: row.querySelector("[data-glow]"),
        lead: row.querySelector("[data-lead]"),
        q: row.querySelector("[data-q]"),
      };
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style: `position:absolute;right:-24px;top:-28px;background:var(--red);color:#fff;opacity:0`,
      },
      spec.tag ?? "",
    );
    el.append(left, arrow, card, tag);
    return { itemEls, arrow, rowEls, tag };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    state.itemEls.forEach((it, i) => {
      const p = settle(t - 0.12 - i * 0.11, 18);
      it.style.transform = `scale(${lerp(0.4, 1, p).toFixed(4)}) rotate(${(i % 2 ? 5 : -6) * (2 - p)}deg)`;
      it.style.opacity = clamp(prog(t, 0.12 + i * 0.11, 0.2 + i * 0.11)).toFixed(3);
    });
    const rowsAt = ctx.at(spec.rowsAt ?? 0.5);
    state.arrow.style.opacity = clamp(prog(t, rowsAt - 0.18, rowsAt)).toFixed(3);
    state.arrow.style.transform = `translateX(${(Math.sin(t * 7) * 3).toFixed(2)}px)`;
    const hi = spec.highlight;
    const hiAt = hi ? ctx.at(hi.at ?? "end-0.8") : Infinity;
    state.rowEls.forEach(({ row, glow, lead, q }, i) => {
      const at = rowsAt + i * 0.17;
      row.style.opacity = clamp(prog(t, at - 0.08, at + 0.06)).toFixed(3);
      const slide = (1 - ease.outCubic(prog(t, at - 0.08, at + 0.2))) * 26;
      // the spotlighted row nudges forward when its word is spoken
      const on = hi && i === hi.row ? settle(t - hiAt, 18) : 0;
      row.style.transform = `translateX(${(slide + on * 8).toFixed(2)}px) scale(${(1 + on * 0.04).toFixed(4)})`;
      glow.style.opacity = on.toFixed(3);
      lead.style.transform = `scaleX(${ease.outCubic(prog(t, at, at + 0.4)).toFixed(4)})`;
      q.style.opacity = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 6 + i))).toFixed(3);
    });
    if (spec.tag) {
      const at = ctx.at(spec.tagAt ?? "end-0.9");
      const p = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(14, 5, p).toFixed(2)}deg) scale(${lerp(0.5, 1, p).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const rowsAt = ctx.at(spec.rowsAt ?? 0.5);
    const cues = (spec.rows ?? []).map((_, i) => ({
      t: rowsAt + i * 0.17,
      name: "tick",
      pitch: 0.8 + i * 0.12,
    }));
    if (spec.highlight) cues.push({ t: ctx.at(spec.highlight.at ?? "end-0.8"), name: "pop" });
    if (spec.tag) cues.push({ t: ctx.at(spec.tagAt ?? "end-0.9"), name: "pop" });
    return cues;
  },
};

export default prop;
