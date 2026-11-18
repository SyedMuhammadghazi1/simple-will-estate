// "Sunset city" backdrop for the scene stage: a retro sun over a skyline and a bay, palms swaying
// in the foreground, traffic on a causeway, clouds, a plane. Mood 0 is sunset, mood 1 is neon
// night (stars, a moon, lit windows and signs). Everything is drawn here and is a pure function
// of time, like the rest of the player. Original artwork: no game's logos, art or screenshots.

import { clamp, mix, rng } from "./timing.js";

const W = 1080;
const H = 1920;
const HORIZON = 1330;
const ROAD = 1488;
const NS = "http://www.w3.org/2000/svg";

const SKY = [
  ["#1b0b3f", "#04030d"],
  ["#5a1a78", "#0f0930"],
  ["#c2307f", "#23104d"],
  ["#ff6a74", "#341565"],
  ["#ffb35c", "#4a1a6e"],
];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function palm(x, y, scale, flip) {
  // trunk: a slightly curved, tapering shape; fronds: long drooping leaves from the crown
  const s = scale;
  const dir = flip ? -1 : 1;
  const trunk = `M${x - 14 * s} ${y} C ${x - 10 * s} ${y - 260 * s}, ${x + dir * 40 * s} ${y - 520 * s}, ${x + dir * 70 * s} ${y - 700 * s} L ${x + dir * 92 * s} ${y - 694 * s} C ${x + dir * 62 * s} ${y - 520 * s}, ${x + 14 * s} ${y - 260 * s}, ${x + 18 * s} ${y} Z`;
  const cx = x + dir * 80 * s;
  const cy = y - 700 * s;
  const leaves = [];
  const angles = [-170, -140, -110, -70, -40, -10, 20, 200];
  angles.forEach((a, i) => {
    const r = (a * Math.PI) / 180;
    const len = (230 + (i % 3) * 40) * s;
    const ex = cx + Math.cos(r) * len;
    const ey = cy + Math.sin(r) * len * 0.55 + 90 * s;
    const mx = cx + Math.cos(r) * len * 0.5;
    const my = cy + Math.sin(r) * len * 0.5 - 40 * s;
    leaves.push(
      `M${cx} ${cy} Q ${mx} ${my - 30 * s} ${ex} ${ey} Q ${mx} ${my + 26 * s} ${cx} ${cy + 8 * s} Z`,
    );
  });
  return { trunk, leaves: leaves.join(" "), cx, cy };
}

export function buildScene(layer) {
  const svg = el("svg", { class: "layer", viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  layer.appendChild(svg);
  const defs = el("defs", {}, svg);
  const sky = el("linearGradient", { id: "sc-sky", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  const skyStops = SKY.map((_, i) => el("stop", { offset: [0, 0.32, 0.55, 0.78, 1][i] }, sky));
  const sunG = el("linearGradient", { id: "sc-sun", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": "#fff27a" }, sunG);
  el("stop", { offset: 0.55, "stop-color": "#ff9a5a" }, sunG);
  el("stop", { offset: 1, "stop-color": "#ff3f8e" }, sunG);
  const seaG = el("linearGradient", { id: "sc-sea", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  const seaStops = [el("stop", { offset: 0 }, seaG), el("stop", { offset: 1 }, seaG)];
  // the sun's retro stripes: a mask that cuts horizontal bars out of its lower half
  const mask = el("mask", { id: "sc-sunmask" }, defs);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "white" }, mask);
  const cuts = [];
  for (let i = 0; i < 7; i++) cuts.push(el("rect", { x: 0, width: W, fill: "black" }, mask));

  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#sc-sky)" }, svg);

  // stars and moon (night)
  const stars = el("g", { opacity: 0 }, svg);
  const r = rng(11);
  const starList = [];
  for (let i = 0; i < 90; i++) {
    const s = el("circle", { cx: r() * W, cy: r() * 1000, r: 1 + r() * 2.2, fill: "#fff" }, stars);
    starList.push({ s, ph: r() * 7, sp: 1 + r() * 3 });
  }
  const moon = el("g", { opacity: 0 }, svg);
  el("circle", { cx: 930, cy: 190, r: 44, fill: "#fff4d6" }, moon);
  el("circle", { cx: 949, cy: 177, r: 39, fill: "#0b0722" }, moon);

  // sun
  const sun = el(
    "circle",
    { cx: 540, cy: HORIZON - 80, r: 290, fill: "url(#sc-sun)", mask: "url(#sc-sunmask)" },
    svg,
  );
  const sunGlow = el(
    "circle",
    { cx: 540, cy: HORIZON - 80, r: 420, fill: "#ff7ab0", opacity: 0.22 },
    svg,
  );

  // clouds: soft long streaks lit pink from below
  const clouds = [];
  [
    [160, 640, 1.2],
    [760, 780, 0.9],
    [420, 930, 1.4],
    [980, 560, 0.8],
    [60, 1040, 1],
  ].forEach(([x, y, s], i) => {
    const g = el("g", {}, svg);
    el("ellipse", { cx: 0, cy: 0, rx: 230 * s, ry: 20 * s, fill: "#ffb0c8", opacity: 0.35 }, g);
    el(
      "ellipse",
      { cx: 60 * s, cy: -14 * s, rx: 150 * s, ry: 16 * s, fill: "#ffd0b0", opacity: 0.28 },
      g,
    );
    clouds.push({ g, x, y, sp: 6 + i * 3 });
  });

  // plane with blinking light
  const plane = el("g", {}, svg);
  el(
    "path",
    { d: "M0 0 L46 -4 L58 -12 L64 -10 L56 0 L64 10 L58 12 L46 4 Z", fill: "#2a1240" },
    plane,
  );
  el("rect", { x: 14, y: -22, width: 8, height: 44, rx: 3, fill: "#2a1240" }, plane);
  const blink = el("circle", { cx: 2, cy: 0, r: 4, fill: "#ff3b3b" }, plane);

  // skyline: buildings on the horizon, with windows that light up at night
  const city = el("g", {}, svg);
  const cr = rng(5);
  const windows = [];
  let x = -20;
  const signs = [];
  while (x < W + 20) {
    const bw = 50 + cr() * 90;
    const bh = 90 + cr() * (x > 300 && x < 760 ? 360 : 230);
    const top = HORIZON - bh;
    const b = el("rect", { x, y: top, width: bw, height: bh, fill: "#2b0f45" }, city);
    b._kind = "b";
    // art-deco step on some
    if (cr() > 0.6)
      el(
        "rect",
        { x: x + bw * 0.2, y: top - 26, width: bw * 0.6, height: 28, fill: "#2b0f45" },
        city,
      );
    if (cr() > 0.75) {
      el("rect", { x: x + bw / 2 - 2, y: top - 90, width: 4, height: 66, fill: "#2b0f45" }, city);
      const light = el("circle", { cx: x + bw / 2, cy: top - 92, r: 5, fill: "#ff3b3b" }, city);
      windows.push({ w: light, ph: cr() * 6, beacon: true });
    }
    for (let wy = top + 18; wy < HORIZON - 14; wy += 26) {
      for (let wx = x + 10; wx < x + bw - 12; wx += 18) {
        if (cr() < 0.55) continue;
        const w = el(
          "rect",
          { x: wx, y: wy, width: 8, height: 12, fill: "#ffd98a", opacity: 0 },
          city,
        );
        windows.push({ w, ph: cr() * 10, on: cr() });
      }
    }
    if (cr() > 0.82 && bh > 180) {
      const sg = el(
        "rect",
        {
          x: x + 8,
          y: top + 30,
          width: bw - 16,
          height: 16,
          rx: 6,
          fill: cr() > 0.5 ? "#ff4fd8" : "#3ef2ff",
          opacity: 0,
        },
        city,
      );
      signs.push(sg);
    }
    x += bw + 4 + cr() * 10;
  }
  const cityFill = [...city.querySelectorAll("rect")].filter(
    (n) => n.getAttribute("fill") === "#2b0f45",
  );

  // bay with the sun's reflection
  el("rect", { x: 0, y: HORIZON, width: W, height: ROAD - HORIZON, fill: "url(#sc-sea)" }, svg);
  const refl = [];
  for (let i = 0; i < 9; i++) {
    refl.push(
      el("rect", { x: 540, y: HORIZON + 10 + i * 16, height: 5, rx: 2.5, fill: "#ffb36e" }, svg),
    );
  }

  // causeway with traffic
  el("rect", { x: 0, y: ROAD - 10, width: W, height: 14, fill: "#1c0a2c" }, svg);
  el("rect", { x: 0, y: ROAD + 4, width: W, height: H - ROAD, fill: "#12071f" }, svg);
  const cars = [];
  const kr = rng(9);
  for (let i = 0; i < 9; i++) {
    const dir = i % 2 ? 1 : -1;
    const g = el("g", {}, svg);
    el("rect", { x: -28, y: -14, width: 56, height: 16, rx: 6, fill: "#2a1240" }, g);
    el("rect", { x: -16, y: -24, width: 32, height: 12, rx: 5, fill: "#2a1240" }, g);
    el("circle", { cx: dir * 26, cy: -6, r: 4, fill: dir > 0 ? "#fff6c8" : "#ff3b5c" }, g);
    cars.push({ g, dir, off: kr() * W, sp: 120 + kr() * 160, y: ROAD - 4 + (dir > 0 ? 0 : -2) });
  }

  // foreground palms, left and right, swaying
  const palms = [];
  [
    [40, 1900, 1.35, false],
    [1050, 1900, 1.25, true],
    [200, 1900, 0.85, false],
  ].forEach(([px, py, s, flip]) => {
    const g = el("g", {}, svg);
    const p = palm(px, py, s, flip);
    el("path", { d: p.trunk, fill: "#0e0518" }, g);
    const fr = el("path", { d: p.leaves, fill: "#0e0518" }, g);
    palms.push({ g, fr, cx: p.cx, cy: p.cy, ph: px * 0.01 });
  });

  // a soft vignette keeps the eye in the middle
  const vg = el("radialGradient", { id: "sc-vig", cx: 0.5, cy: 0.42, r: 0.75 }, defs);
  el("stop", { offset: 0.55, "stop-color": "#000", "stop-opacity": 0 }, vg);
  el("stop", { offset: 1, "stop-color": "#000", "stop-opacity": 0.55 }, vg);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#sc-vig)" }, svg);

  function update(t, mood) {
    const m = clamp(mood);
    SKY.forEach((pair, i) => skyStops[i].setAttribute("stop-color", mix(pair[0], pair[1], m)));
    seaStops[0].setAttribute("stop-color", mix("#ff7f7a", "#1a0b3a", m));
    seaStops[1].setAttribute("stop-color", mix("#5a1d6e", "#08051a", m));
    // the sun sinks a little over the reel, and sets for the night
    const sy = HORIZON - 80 + t * 0.9 + m * 260;
    sun.setAttribute("cy", sy.toFixed(1));
    sun.setAttribute("opacity", (1 - m * 0.95).toFixed(3));
    sunGlow.setAttribute("cy", sy.toFixed(1));
    sunGlow.setAttribute("opacity", (0.22 * (1 - m) + 0.04 * Math.sin(t * 1.3)).toFixed(3));
    // stripes slide down through the sun's lower half
    cuts.forEach((c, i) => {
      const k = (i + ((t * 0.35) % 1)) / 7;
      const y = sy - 20 + k * 300;
      c.setAttribute("y", y.toFixed(1));
      c.setAttribute("height", (4 + k * 18).toFixed(1));
    });
    stars.setAttribute("opacity", m.toFixed(3));
    for (const s of starList)
      s.s.setAttribute("opacity", (0.4 + 0.6 * Math.abs(Math.sin(t * s.sp + s.ph))).toFixed(2));
    moon.setAttribute("opacity", m.toFixed(3));
    for (const c of clouds) {
      const cx = ((c.x + t * c.sp + 300) % (W + 600)) - 300;
      c.g.setAttribute("transform", `translate(${cx.toFixed(1)} ${c.y})`);
      c.g.setAttribute("opacity", (1 - m * 0.75).toFixed(3));
    }
    const px = ((t * 70) % (W + 400)) - 200;
    plane.setAttribute("transform", `translate(${px.toFixed(1)} ${(470 - px * 0.08).toFixed(1)})`);
    blink.setAttribute("opacity", Math.floor(t * 2) % 2 ? "1" : "0.15");
    const bFill = mix("#3a1350", "#12082a", m);
    for (const b of cityFill) b.setAttribute("fill", bFill);
    for (const w of windows) {
      if (w.beacon) {
        w.w.setAttribute("opacity", Math.sin(t * 3 + w.ph) > 0 ? "1" : "0.2");
        continue;
      }
      const lit = w.on < 0.25 + m * 0.6 && Math.sin(t * 0.4 + w.ph) > -0.9;
      w.w.setAttribute("opacity", lit ? (0.35 + 0.6 * m).toFixed(2) : "0");
    }
    for (const sg of signs)
      sg.setAttribute("opacity", (m * (0.75 + 0.25 * Math.sin(t * 9))).toFixed(3));
    refl.forEach((rf, i) => {
      const wdt = (220 - i * 18) * (1 + 0.15 * Math.sin(t * 2.2 + i)) * (1 - m * 0.6);
      rf.setAttribute("x", (540 - wdt / 2 + Math.sin(t * 1.7 + i) * 10).toFixed(1));
      rf.setAttribute("width", Math.max(0, wdt).toFixed(1));
      rf.setAttribute("fill", mix("#ffb36e", "#ff4fd8", m));
      rf.setAttribute("opacity", (0.7 - i * 0.05).toFixed(2));
    });
    for (const c of cars) {
      const cx =
        c.dir > 0
          ? ((c.off + t * c.sp) % (W + 120)) - 60
          : W + 60 - ((c.off + t * c.sp) % (W + 120));
      c.g.setAttribute("transform", `translate(${cx.toFixed(1)} ${c.y})`);
    }
    for (const p of palms) {
      const a = Math.sin(t * 1.1 + p.ph) * 2.4;
      p.fr.setAttribute("transform", `rotate(${a.toFixed(2)} ${p.cx} ${p.cy})`);
      p.g.setAttribute("transform", `rotate(${(a * 0.25).toFixed(2)} ${p.cx} 1900)`);
    }
  }

  update(0, 0);
  return { update };
}
