// The persistent set: wall, ruled pad (the "board" every prop is staged on), table, and dressing.
// It never cuts — only the caption and the prop on the pad change between beats — which is what
// makes a dozen beats read as one continuous shot.

import { LAYOUT } from "./theme.js";
import { clamp, mix } from "./timing.js";

const { W, H, pad: PAD, tableY } = LAYOUT;

function rules() {
  const lines = [];
  const first = PAD.y + PAD.binding + 58;
  for (let y = first; y < PAD.y + PAD.h - 20; y += 54) {
    lines.push(
      `<line x1="${PAD.x}" x2="${PAD.x + PAD.w}" y1="${y}" y2="${y}" style="stroke:var(--padRule)" stroke-width="2.5"/>`,
    );
  }
  return lines.join("");
}

/** The pad's binding strip. With fine print it doubles as the always-on disclosure line. */
function binding(fineprint) {
  if (fineprint) {
    // starts clear of the paperclip; sized so ~52 characters span the strip
    return `<text id="pad-fineprint" x="${PAD.x + 138}" y="${PAD.y + 33}" font-family="DM Mono, monospace" font-weight="500" font-size="20" letter-spacing="2" fill="#f6efe0" fill-opacity="0.94" textLength="${PAD.w - 138 - 34}" lengthAdjust="spacing">${fineprint}</text>`;
  }
  const out = [];
  for (let x = PAD.x + 40; x < PAD.x + PAD.w - 30; x += 44) {
    out.push(
      `<line x1="${x}" x2="${x + 20}" y1="${PAD.y + 25}" y2="${PAD.y + 25}" stroke="#f6efe0" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>`,
    );
  }
  return out.join("");
}

const backSvg = (fineprint) => `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--wallTop)"/>
      <stop offset="1" style="stop-color:var(--wallBottom)"/>
    </linearGradient>
    <radialGradient id="g-glow" cx="0.92" cy="0.8" r="0.75">
      <stop offset="0" style="stop-color:var(--wallGlow)" stop-opacity="0.85"/>
      <stop offset="1" style="stop-color:var(--wallGlow)" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="c-pad">
      <rect x="${PAD.x}" y="${PAD.y}" width="${PAD.w}" height="${PAD.h}" rx="${PAD.r}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${W}" height="${tableY + 4}" fill="url(#g-wall)"/>
  <rect x="0" y="0" width="${W}" height="${tableY + 4}" fill="url(#g-glow)"/>
  <g id="pad">
    <rect x="${PAD.x + 12}" y="${PAD.y + 12}" width="${PAD.w}" height="${PAD.h}" rx="${PAD.r}" style="fill:var(--padShadow)"/>
    <rect x="${PAD.x}" y="${PAD.y}" width="${PAD.w}" height="${PAD.h}" rx="${PAD.r}" style="fill:var(--pad)"/>
    <g clip-path="url(#c-pad)">
      ${rules()}
      <line x1="${PAD.x + 96}" x2="${PAD.x + 96}" y1="${PAD.y}" y2="${PAD.y + PAD.h}" style="stroke:var(--padMargin)" stroke-width="3"/>
      <line x1="${PAD.x + 105}" x2="${PAD.x + 105}" y1="${PAD.y}" y2="${PAD.y + PAD.h}" style="stroke:var(--padMargin)" stroke-width="3"/>
      <rect x="${PAD.x}" y="${PAD.y}" width="${PAD.w}" height="${PAD.binding}" style="fill:var(--padBinding)"/>
      ${binding(fineprint)}
      <line x1="${PAD.x}" x2="${PAD.x + PAD.w}" y1="${PAD.y + PAD.binding}" y2="${PAD.y + PAD.binding}" style="stroke:var(--line)" stroke-width="3"/>
    </g>
    <rect x="${PAD.x}" y="${PAD.y}" width="${PAD.w}" height="${PAD.h}" rx="${PAD.r}" fill="none" style="stroke:var(--line)" stroke-width="3.5"/>
  </g>
</svg>`;

// Pad dressing (under the props): a paperclip and a "sign here" flag.
const PAD_DRESSING_SVG = `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g id="clip" transform="translate(${PAD.x + 62} ${PAD.y - 30}) rotate(7)">
    <path d="M0 20 V92 a17 17 0 0 0 34 0 V14 a12 12 0 0 0 -24 0 V84 a5.5 5.5 0 0 0 11 0 V26"
      fill="none" stroke="#1c1917" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M0 20 V92 a17 17 0 0 0 34 0 V14 a12 12 0 0 0 -24 0 V84 a5.5 5.5 0 0 0 11 0 V26"
      fill="none" stroke="#c9d1da" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g id="flag" transform="translate(${PAD.x + PAD.w - 8} ${PAD.y + 150})">
    <g id="flag-inner">
      <path d="M-34 -24 H52 a8 8 0 0 1 8 8 V16 a8 8 0 0 1 -8 8 H-34 L-58 0 Z" fill="#1c1917" transform="translate(5 6)"/>
      <path d="M-34 -24 H52 a8 8 0 0 1 8 8 V16 a8 8 0 0 1 -8 8 H-34 L-58 0 Z" fill="#f4b942" stroke="#1c1917" stroke-width="3.5" stroke-linejoin="round"/>
      <text x="8" y="6" text-anchor="middle" font-family="DM Mono, monospace" font-weight="500" font-size="17" letter-spacing="1.5" fill="#1c1917">SIGN</text>
    </g>
  </g>
</svg>`;

// Table set (in front of the props, as in the reference: props pass behind whatever stands on
// the desk): two books and a family photo.
const TABLE_SET_SVG = `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g id="table-set" transform="translate(992 ${tableY}) scale(0.8) translate(-992 ${-tableY})">
  <g id="books">
    <g transform="translate(748 ${tableY - 40})">
      <rect x="6" y="6" width="236" height="40" rx="7" fill="#1c1917" opacity="0.25"/>
      <rect x="0" y="0" width="236" height="40" rx="7" fill="#c8742b" stroke="#1c1917" stroke-width="3.5"/>
      <rect x="178" y="6" width="52" height="28" rx="3" fill="#f6efe0" stroke="#1c1917" stroke-width="2.5"/>
      <line x1="186" x2="224" y1="15" y2="15" stroke="#1c1917" stroke-opacity="0.3" stroke-width="2"/>
      <line x1="186" x2="224" y1="25" y2="25" stroke="#1c1917" stroke-opacity="0.3" stroke-width="2"/>
      <rect x="22" y="12" width="74" height="7" rx="3.5" fill="#f6efe0" opacity="0.8"/>
    </g>
    <g transform="translate(772 ${tableY - 76})">
      <rect x="0" y="0" width="196" height="36" rx="7" fill="#efe3cf" stroke="#1c1917" stroke-width="3.5"/>
      <rect x="0" y="0" width="34" height="36" rx="7" fill="#2f7d4f" stroke="#1c1917" stroke-width="3.5"/>
      <rect x="50" y="14" width="96" height="7" rx="3.5" fill="#1c1917" opacity="0.25"/>
    </g>
  </g>
  <g id="frame" transform="translate(868 ${tableY - 76}) rotate(4)">
    <path d="M40 -4 L62 -4 L78 2 L70 2 Z" fill="#1c1917" opacity="0.5"/>
    <rect x="-55" y="-144" width="122" height="146" rx="9" fill="#1c1917" opacity="0.22" transform="translate(7 7)"/>
    <rect x="-55" y="-144" width="122" height="146" rx="9" fill="#f6efe0" stroke="#1c1917" stroke-width="3.5"/>
    <rect x="-42" y="-131" width="96" height="120" rx="4" fill="#bcd6ee" stroke="#1c1917" stroke-width="3"/>
    <circle cx="30" cy="-106" r="13" fill="#f9cf6a"/>
    <g stroke="#1c1917" stroke-width="2.5">
      <circle cx="-17" cy="-74" r="13" fill="#1e3a5f"/>
      <path d="M-40 -11 v-22 a23 23 0 0 1 46 0 v22 Z" fill="#1e3a5f"/>
      <circle cx="25" cy="-68" r="12" fill="#c8742b"/>
      <path d="M5 -11 v-18 a20 20 0 0 1 40 0 v18 Z" fill="#c8742b"/>
      <circle cx="5" cy="-42" r="9.5" fill="#f4b942"/>
      <path d="M-9 -11 v-8 a14 14 0 0 1 28 0 v8 Z" fill="#f4b942"/>
    </g>
  </g>
  </g>
</svg>`;

const TABLE_SVG = `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g-table" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--tableFront)"/>
      <stop offset="1" style="stop-color:var(--tableFrontLow)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${tableY}" width="${W}" height="${H - tableY}" fill="url(#g-table)"/>
  <rect x="0" y="${tableY}" width="${W}" height="20" style="fill:var(--tableTop)"/>
  <line x1="0" x2="${W}" y1="${tableY + 20}" y2="${tableY + 20}" stroke="#000" stroke-opacity="0.28" stroke-width="3"/>
  <line x1="0" x2="${W}" y1="${tableY}" y2="${tableY}" style="stroke:var(--line)" stroke-width="3.5"/>
</svg>`;

function layer(parent, id, html = "") {
  const el = document.createElement("div");
  el.id = id;
  el.className = "layer";
  el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

/**
 * Build the stage into `root` and return its layers plus a per-frame `update`.
 * Layer order (back to front): back, dressing (on the pad), props, set (on the table), table,
 * endback, mascot, caption, overlay.
 */
export function buildStage(root, theme, { disclaimer = "" } = {}) {
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const back = layer(root, "l-back", backSvg(disclaimer ? esc(disclaimer.toUpperCase()) : ""));
  const dressing = layer(root, "l-dressing", PAD_DRESSING_SVG);
  const props = layer(root, "l-props");
  const set = layer(root, "l-set", TABLE_SET_SVG);
  const table = layer(root, "l-table", TABLE_SVG);
  const endback = layer(root, "l-endback");
  const mascot = layer(root, "l-mascot");
  const caption = layer(root, "l-caption");
  const overlay = layer(root, "l-overlay");

  root.style.setProperty("--font-caption", theme.fonts.caption);
  root.style.setProperty("--font-ui", theme.fonts.ui);
  root.style.setProperty("--font-mono", theme.fonts.mono);

  const flag = dressing.querySelector("#flag-inner");
  let lastMood = -1;

  function setMood(d) {
    const m = clamp(d);
    if (Math.abs(m - lastMood) < 0.0005) return;
    lastMood = m;
    for (const [name, pair] of Object.entries(theme.colors)) {
      root.style.setProperty(`--${name}`, mix(pair[0], pair[1], m));
    }
    root.style.setProperty("--mood", m.toFixed(4));
    // Dressing is lit by the room: it sinks into the dark instead of being re-coloured.
    const dim = m > 0.001 ? `brightness(${(1 - 0.66 * m).toFixed(3)})` : "";
    dressing.style.filter = dim;
    set.style.filter = dim;
  }

  /** `flagWiggle` is 0..1 — used to draw the eye to the pad when a beat lands. */
  function update(t, { mood = 0, flagWiggle = 0 } = {}) {
    setMood(mood);
    const idle = Math.sin(t * 1.7) * 1.2;
    const wig = Math.sin(t * 26) * 9 * flagWiggle;
    flag.setAttribute("transform", `rotate(${(idle + wig).toFixed(2)} 60 0)`);
  }

  setMood(0);
  return {
    layers: { back, dressing, props, set, table, endback, mascot, caption, overlay },
    update,
    setMood,
  };
}
