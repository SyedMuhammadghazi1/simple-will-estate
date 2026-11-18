// The persistent set: wall, ruled pad (the "board" every prop is staged on), table, and dressing.
// It never cuts — only the caption and the prop on the pad change between beats — which is what
// makes a dozen beats read as one continuous shot.

import { LAYOUT } from "./theme.js";
import { buildScene } from "./scene.js";
import { clamp, mix } from "./timing.js";

const { W, H, pad: PAD, tableY } = LAYOUT;

// tokens used for text and outlines (see setMood)
const FLIP = new Set(["ink", "ghost", "accent", "eyebrow", "line", "muted", "amber"]);

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
    // 28px, the size the reference sets its own footnotes in: fine print nobody can read on a
    // phone does not count as a disclosure. Starts clear of the paperclip.
    return `<text id="pad-fineprint" x="${PAD.x + 132}" y="${PAD.y + 41}" font-family="DM Mono, monospace" font-weight="500" font-size="28" fill="#f6efe0" textLength="${PAD.w - 132 - 36}" lengthAdjust="spacing">${fineprint}</text>`;
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

// Pad dressing (under the props): a paperclip. Keep this layer sparse: props are staged over
// it, and anything here that pokes out from behind a prop reads as part of that prop.
const PAD_DRESSING_SVG = `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g id="clip" transform="translate(${PAD.x + 62} ${PAD.y - 30}) rotate(7)">
    <path d="M0 20 V92 a17 17 0 0 0 34 0 V14 a12 12 0 0 0 -24 0 V84 a5.5 5.5 0 0 0 11 0 V26"
      fill="none" stroke="#1c1917" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M0 20 V92 a17 17 0 0 0 34 0 V14 a12 12 0 0 0 -24 0 V84 a5.5 5.5 0 0 0 11 0 V26"
      fill="none" stroke="#c9d1da" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
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

// Alternative table set for gaming and entertainment themes: two game cases and a gamepad. The
// pad is a generic two-stick shape with plain dots for buttons (no console maker's markings).
const GAMING_SET_SVG = `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g id="table-set" transform="translate(992 ${tableY}) scale(0.7) translate(-992 ${-tableY})">
  <g id="cases">
    <g transform="translate(748 ${tableY - 34})">
      <rect x="6" y="6" width="236" height="34" rx="6" fill="#1d1420" opacity="0.25"/>
      <rect x="0" y="0" width="236" height="34" rx="6" fill="#12877f" stroke="#1d1420" stroke-width="3.5"/>
      <rect x="14" y="9" width="46" height="16" rx="3" fill="#fdf3ea" stroke="#1d1420" stroke-width="2.5"/>
      <rect x="74" y="13" width="92" height="7" rx="3.5" fill="#fdf3ea" opacity="0.8"/>
    </g>
    <g transform="translate(770 ${tableY - 66})">
      <rect x="0" y="0" width="200" height="32" rx="6" fill="#d6246e" stroke="#1d1420" stroke-width="3.5"/>
      <rect x="14" y="8" width="42" height="16" rx="3" fill="#fdf3ea" stroke="#1d1420" stroke-width="2.5"/>
      <rect x="70" y="12" width="78" height="7" rx="3.5" fill="#fdf3ea" opacity="0.8"/>
    </g>
  </g>
  <g id="gamepad" transform="translate(880 ${tableY - 70}) rotate(-7)">
    <path d="M-78 -100 H78 Q104 -100 107 -74 L117 -22 Q119 0 100 2 Q86 4 78 -10 L62 -38 H-62 L-78 -10 Q-86 4 -100 2 Q-119 0 -117 -22 L-107 -74 Q-104 -100 -78 -100 Z"
      fill="#1d1420" opacity="0.22" transform="translate(7 7)"/>
    <path d="M-78 -100 H78 Q104 -100 107 -74 L117 -22 Q119 0 100 2 Q86 4 78 -10 L62 -38 H-62 L-78 -10 Q-86 4 -100 2 Q-119 0 -117 -22 L-107 -74 Q-104 -100 -78 -100 Z"
      fill="#fdf3ea" stroke="#1d1420" stroke-width="3.5" stroke-linejoin="round"/>
    <g fill="#1d1420">
      <rect x="-70" y="-72" width="30" height="10" rx="3"/>
      <rect x="-60" y="-82" width="10" height="30" rx="3"/>
    </g>
    <circle cx="56" cy="-82" r="6.5" fill="#f6c445" stroke="#1d1420" stroke-width="2.5"/>
    <circle cx="56" cy="-52" r="6.5" fill="#12877f" stroke="#1d1420" stroke-width="2.5"/>
    <circle cx="41" cy="-67" r="6.5" fill="#d6246e" stroke="#1d1420" stroke-width="2.5"/>
    <circle cx="71" cy="-67" r="6.5" fill="#8a5fd0" stroke="#1d1420" stroke-width="2.5"/>
    <circle cx="-24" cy="-50" r="13" fill="#43206a" stroke="#1d1420" stroke-width="3"/>
    <circle cx="24" cy="-50" r="13" fill="#43206a" stroke="#1d1420" stroke-width="3"/>
    <circle cx="-24" cy="-52" r="6" fill="#8a5fd0"/>
    <circle cx="24" cy="-52" r="6" fill="#8a5fd0"/>
    <rect x="-12" y="-84" width="24" height="8" rx="4" fill="#1d1420" opacity="0.35"/>
  </g>
  </g>
</svg>`;

const TABLE_SETS = { desk: TABLE_SET_SVG, gaming: GAMING_SET_SVG };

// "Bare" stage: just the wall, no pad, table or set. Props float on the background and the
// fine print sits at the foot of the safe zone. Used by minimal themes (e.g. noir).
const bareSvg = (fineprint) => `
<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--wallTop)"/>
      <stop offset="1" style="stop-color:var(--wallBottom)"/>
    </linearGradient>
    <radialGradient id="g-glow" cx="0.5" cy="0.45" r="0.7">
      <stop offset="0" style="stop-color:var(--wallGlow)" stop-opacity="0.9"/>
      <stop offset="1" style="stop-color:var(--wallGlow)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-wall)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-glow)"/>
  ${fineprint ? `<text id="pad-fineprint" x="${W / 2}" y="1236" text-anchor="middle" font-family="DM Mono, monospace" font-weight="500" font-size="24" letter-spacing="2" style="fill:var(--muted)">${fineprint}</text>` : ""}
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
  // "scene" is a bare stage with an animated backdrop (scene.js) behind the props
  const scenic = theme.stage === "scene";
  const bare = theme.stage === "bare" || scenic;
  const fine = disclaimer ? esc(disclaimer.toUpperCase()) : "";
  const back = layer(root, "l-back", bare ? (scenic ? "" : bareSvg(fine)) : backSvg(fine));
  const scene = scenic ? buildScene(back) : null;
  const finePending = scenic && fine;
  const dressing = layer(root, "l-dressing", bare ? "" : PAD_DRESSING_SVG);
  const props = layer(root, "l-props");
  const set = layer(root, "l-set", bare ? "" : (TABLE_SETS[theme.set ?? "desk"] ?? TABLE_SET_SVG));
  const table = layer(root, "l-table", bare ? "" : TABLE_SVG);
  const endback = layer(root, "l-endback");
  const mascot = layer(root, "l-mascot");
  const caption = layer(root, "l-caption");
  // on a scene stage the fine print sits above the props, so full-bleed artwork can't hide it
  if (finePending) {
    caption.insertAdjacentHTML(
      "beforeend",
      `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><text x="${W / 2}" y="1236" text-anchor="middle" font-family="DM Mono, monospace" font-weight="500" font-size="24" letter-spacing="2" fill="#fff6e8" opacity="0.9" style="paint-order:stroke;stroke:#12071f;stroke-width:6px">${fine}</text></svg>`,
    );
  }
  const overlay = layer(root, "l-overlay");

  root.style.setProperty("--font-caption", theme.fonts.caption);
  root.style.setProperty("--font-ui", theme.fonts.ui);
  root.style.setProperty("--font-mono", theme.fonts.mono);

  let lastMood = -1;

  function setMood(d) {
    const m = clamp(d);
    if (Math.abs(m - lastMood) < 0.0005) return;
    lastMood = m;
    // Surfaces fade; text and outlines flip at the midpoint. If they faded too, ink would pass
    // through the same grey as the wall and the caption would vanish for a frame mid-fade.
    const hard = m >= 0.5 ? 1 : 0;
    for (const [name, pair] of Object.entries(theme.colors)) {
      root.style.setProperty(`--${name}`, mix(pair[0], pair[1], FLIP.has(name) ? hard : m));
    }
    // Mid-fade the wall passes through the unlit-word grey, so for those few frames the unlit
    // words lean toward the ink colour and stay readable.
    const mid = 1 - Math.abs(2 * m - 1);
    if (mid > 0.001) {
      const { ghost, ink } = theme.colors;
      root.style.setProperty("--ghost", mix(ghost[hard], ink[hard], 0.7 * mid));
    }
    root.style.setProperty("--mood", m.toFixed(4));
    // Dressing is lit by the room: it sinks into the dark instead of being re-coloured.
    const dim = m > 0.001 ? `brightness(${(1 - 0.66 * m).toFixed(3)})` : "";
    dressing.style.filter = dim;
    set.style.filter = dim;
  }

  function update(t, { mood = 0 } = {}) {
    setMood(mood);
    scene?.update(t, mood);
  }

  setMood(0);
  return {
    layers: { back, dressing, props, set, table, endback, mascot, caption, overlay },
    update,
    setMood,
  };
}
