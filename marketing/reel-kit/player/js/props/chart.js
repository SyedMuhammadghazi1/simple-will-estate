// What an amount of money would have become in a stock, drawn as a line through real closing
// prices. Phase A draws the investment from the first date to the last; phase B can start a
// second investment of the same amount at a later date, drawn in red over the dimmed first one.
//
// spec: {
//   data: [["2023-12-04", 157.56], ...],   closing prices, oldest first (price only)
//   amount,                                 the money invested at each start
//   title, foot,                            small labels above and below the plot
//   drawAt, drawDur,                        phase A
//   second: { from: "2025-12-31", label, at, dur }   phase B (optional)
//   startLabel, w, h
// }

import { clamp, commas, ease, lerp, prog } from "../timing.js";
import { box, h, setText } from "./_util.js";

const money = (v) => `$${commas(Math.round(v))}`;

const prop = {
  build(el, spec) {
    const W = spec.w ?? 860;
    const H = spec.h ?? 470;
    const PL = 20;
    const PR = 190; // room for the value label at the right end
    const PT = 70;
    const PB = 70;
    box(el, W, H);
    const data = spec.data ?? [];
    const amt = spec.amount ?? 1000;
    const p0 = data[0][1];
    const valsA = data.map(([, c]) => (amt * c) / p0);
    const j = spec.second ? data.findIndex(([d]) => d >= spec.second.from) : -1;
    const valsB = j >= 0 ? data.map(([, c], i) => (i < j ? null : (amt * c) / data[j][1])) : [];
    const all = [...valsA, ...valsB.filter((v) => v != null)];
    const lo = Math.min(...all) * 0.92;
    const hi = Math.max(...all) * 1.04;
    const X = (i) => PL + ((W - PL - PR) * i) / (data.length - 1);
    const Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
    const path = (vals, from = 0) =>
      vals
        .map((v, i) =>
          i < from || v == null
            ? null
            : `${i === from ? "M" : "L"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`,
        )
        .filter(Boolean)
        .join(" ");
    // year ticks
    const ticks = [];
    data.forEach(([d], i) => {
      if (i > 0 && d.slice(0, 4) !== data[i - 1][0].slice(0, 4)) ticks.push([i, d.slice(0, 4)]);
    });
    const svg = h("div", {
      style: "position:absolute;inset:0",
      html: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="overflow:visible">
        <line x1="${PL}" x2="${W - PR}" y1="${H - PB}" y2="${H - PB}" style="stroke:var(--line)" stroke-width="2"/>
        ${ticks.map(([i, y]) => `<line x1="${X(i)}" x2="${X(i)}" y1="${H - PB}" y2="${H - PB + 10}" style="stroke:var(--line)" stroke-width="2"/><text x="${X(i)}" y="${H - PB + 36}" text-anchor="middle" font-family="DM Mono, monospace" font-size="20" style="fill:var(--muted)">${y}</text>`).join("")}
        <line data-ref x1="${PL}" x2="${W - PR}" y1="${Y(amt)}" y2="${Y(amt)}" style="stroke:var(--muted)" stroke-width="2" stroke-dasharray="4 8" opacity="0.6"/>
        <path data-a d="${path(valsA)}" fill="none" style="stroke:var(--ink)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
        ${
          j >= 0
            ? `<line data-jl x1="${X(j)}" x2="${X(j)}" y1="${PT - 20}" y2="${H - PB}" style="stroke:var(--muted)" stroke-width="2" stroke-dasharray="3 7" opacity="0"/>
        <path data-b d="${path(valsB, j)}" fill="none" style="stroke:var(--red)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`
            : ""
        }
        <circle data-ha r="9" style="fill:var(--ink)"/>
        <circle data-hb r="10" style="fill:var(--red)" opacity="0"/>
      </svg>`,
    });
    const title = h(
      "div",
      {
        class: "mono",
        style: `position:absolute;left:${PL}px;top:0;font-size:22px;color:var(--muted);white-space:nowrap`,
      },
      spec.title ?? "",
    );
    const start = h(
      "div",
      {
        class: "mono",
        style: `position:absolute;left:${PL}px;top:${H - PB + 46}px;font-size:19px;color:var(--muted);white-space:nowrap`,
      },
      spec.startLabel ?? "",
    );
    const foot = h(
      "div",
      {
        class: "mono",
        style: `position:absolute;right:${PR - 150}px;top:${H - PB + 46}px;font-size:19px;color:var(--muted);white-space:nowrap`,
      },
      spec.foot ?? "",
    );
    const la = h("div", {
      class: "serif",
      style:
        "position:absolute;left:0;top:0;font-size:58px;font-weight:500;white-space:nowrap;color:var(--green);font-variant-numeric:tabular-nums",
    });
    const lb = h("div", {
      class: "serif",
      style:
        "position:absolute;left:0;top:0;font-size:58px;font-weight:500;white-space:nowrap;color:var(--red);opacity:0;font-variant-numeric:tabular-nums",
    });
    const jlab = h(
      "div",
      {
        class: "mono",
        style:
          "position:absolute;left:0;top:36px;font-size:19px;color:var(--ink);white-space:nowrap;opacity:0;transform:translateX(-50%)",
      },
      spec.second?.label ?? "",
    );
    el.append(svg, title, start, foot, la, lb, jlab);
    const pa = svg.querySelector("[data-a]");
    const pb = svg.querySelector("[data-b]");
    return {
      W,
      H,
      X,
      Y,
      j,
      valsA,
      valsB,
      pa,
      pb,
      la,
      lb,
      jlab,
      lenA: pa.getTotalLength(),
      lenB: pb ? pb.getTotalLength() : 0,
      ha: svg.querySelector("[data-ha]"),
      hb: svg.querySelector("[data-hb]"),
      jl: svg.querySelector("[data-jl]"),
    };
  },

  update(s, t, ctx) {
    const spec = ctx.spec;
    const n = s.valsA.length;
    // phase A: reveal the line by index so the head follows the data, not the path length
    const aAt = ctx.at(spec.drawAt ?? 0.3);
    const pA = ease.inOutCubic(prog(t, aAt, aAt + (spec.drawDur ?? 2)));
    const fa = pA * (n - 1);
    const ia = Math.floor(fa);
    const va = ia >= n - 1 ? s.valsA[n - 1] : lerp(s.valsA[ia], s.valsA[ia + 1], fa - ia);
    s.pa.setAttribute("stroke-dasharray", `${s.lenA}`);
    s.pa.setAttribute("stroke-dashoffset", `${(s.lenA * (1 - pA)).toFixed(1)}`);
    const xa = lerp(s.X(ia), s.X(Math.min(n - 1, ia + 1)), fa - ia);
    s.ha.setAttribute("cx", xa.toFixed(1));
    s.ha.setAttribute("cy", s.Y(va).toFixed(1));
    setText(s.la, money(va));
    s.la.style.transform = `translate(${(xa + 22).toFixed(1)}px, ${(s.Y(va) - 44).toFixed(1)}px)`;
    // phase B
    if (spec.second && s.pb) {
      const bAt = ctx.at(spec.second.at ?? 2);
      const pB = ease.inOutCubic(prog(t, bAt + 0.25, bAt + 0.25 + (spec.second.dur ?? 1.6)));
      const on = clamp(prog(t, bAt, bAt + 0.25));
      s.pa.setAttribute("opacity", lerp(1, 0.32, on).toFixed(3));
      s.ha.setAttribute("opacity", lerp(1, 0.32, on).toFixed(3));
      s.la.style.opacity = lerp(1, 0.4, on).toFixed(3);
      s.jl.setAttribute("opacity", on.toFixed(3));
      s.jlab.style.opacity = on.toFixed(3);
      s.jlab.style.left = `${s.X(s.j).toFixed(1)}px`;
      s.pb.setAttribute("stroke-dasharray", `${s.lenB}`);
      s.pb.setAttribute("stroke-dashoffset", `${(s.lenB * (1 - pB)).toFixed(1)}`);
      const fb = s.j + pB * (n - 1 - s.j);
      const ib = Math.floor(fb);
      const vb = ib >= n - 1 ? s.valsB[n - 1] : lerp(s.valsB[ib], s.valsB[ib + 1], fb - ib);
      const xb = lerp(s.X(ib), s.X(Math.min(n - 1, ib + 1)), fb - ib);
      s.hb.setAttribute("opacity", on.toFixed(3));
      s.hb.setAttribute("cx", xb.toFixed(1));
      s.hb.setAttribute("cy", s.Y(vb).toFixed(1));
      s.lb.style.opacity = on.toFixed(3);
      setText(s.lb, money(vb));
      s.lb.style.transform = `translate(${(xb + 22).toFixed(1)}px, ${(s.Y(vb) + 4).toFixed(1)}px)`;
    }
  },

  sfx(spec, ctx) {
    const cues = [{ t: ctx.at(spec.drawAt ?? 0.3), name: "counter", dur: spec.drawDur ?? 2 }];
    if (spec.second) {
      const at = ctx.at(spec.second.at ?? 2);
      cues.push(
        { t: at, name: "buzz", gain: 0.6 },
        { t: at + 0.25, name: "counter", dur: spec.second.dur ?? 1.6 },
      );
    }
    return cues;
  },
};

export default prop;
