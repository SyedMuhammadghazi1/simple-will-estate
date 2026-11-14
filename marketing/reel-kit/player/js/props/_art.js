// Reusable original line-art for props, as SVG strings. Everything follows the same recipe so
// props read as one family: flat fills from the theme, a 3–3.5px ink outline, rounded joins.
// Each function returns markup for an <svg> element sized to (w, h).

const INK = "var(--line)";

const svg = (w, h, vb, body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" style="overflow:visible;display:block;${extra}">${body}</svg>`;

/** Five-point star. `fill` may be a CSS colour or "none". */
export function star(size = 30, fill = "var(--gold)") {
  return svg(
    size,
    size,
    "0 0 32 32",
    `<path d="M16 2.5l4.1 8.6 9.4 1.3-6.8 6.6 1.7 9.4L16 23.9 7.6 28.4l1.7-9.4-6.8-6.6 9.4-1.3z" fill="${fill}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
  );
}

/** Head-and-shoulders avatar in a circle. */
export function person(
  size = 96,
  color = "var(--navy)",
  { bg = "var(--navySoft)", ring = true } = {},
) {
  return svg(
    size,
    size,
    "0 0 100 100",
    `<defs><clipPath id="pc-${size}-${color.replace(/[^a-z0-9]/gi, "")}"><circle cx="50" cy="50" r="46"/></clipPath></defs>
     <circle cx="50" cy="50" r="46" fill="${bg}"/>
     <g clip-path="url(#pc-${size}-${color.replace(/[^a-z0-9]/gi, "")})" stroke="${INK}" stroke-width="3.2">
       <circle cx="50" cy="40" r="17" fill="${color}"/>
       <path d="M17 100 v-12 a33 30 0 0 1 66 0 v12 Z" fill="${color}"/>
     </g>
     ${ring ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${INK}" stroke-width="3.6"/>` : ""}`,
  );
}

/** Check mark in a filled circle. */
export function check(size = 44, color = "var(--green)") {
  return svg(
    size,
    size,
    "0 0 44 44",
    `<circle cx="22" cy="22" r="19.5" fill="${color}" stroke="${INK}" stroke-width="3.2"/>
     <path d="M12.5 22.5l6.5 6.5 12.5-13" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function cross(size = 44, color = "var(--red)") {
  return svg(
    size,
    size,
    "0 0 44 44",
    `<circle cx="22" cy="22" r="19.5" fill="${color}" stroke="${INK}" stroke-width="3.2"/>
     <path d="M14.5 14.5l15 15M29.5 14.5l-15 15" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>`,
  );
}

/** Baby stroller, side view. */
export function stroller(size = 120, color = "var(--navy)") {
  return svg(
    size,
    size,
    "0 0 120 120",
    `<g stroke="${INK}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">
       <path d="M24 58 A40 40 0 0 1 64 18 V58 Z" fill="${color}"/>
       <path d="M22 58 H92 a0 0 0 0 1 0 0 c0 16 -12 26 -28 26 H46 C32 84 22 72 22 58 Z" fill="var(--card)"/>
       <path d="M92 58 L108 28" fill="none"/>
       <path d="M102 24 l12 8" fill="none" stroke-width="5"/>
       <path d="M40 84 L34 98 M72 84 L80 98" fill="none"/>
       <circle cx="32" cy="103" r="10" fill="var(--cardAlt)"/>
       <circle cx="82" cy="103" r="10" fill="var(--cardAlt)"/>
       <circle cx="32" cy="103" r="2.5" fill="${INK}" stroke="none"/>
       <circle cx="82" cy="103" r="2.5" fill="${INK}" stroke="none"/>
     </g>`,
  );
}

/** Judge's gavel on its block. */
export function gavel(size = 200) {
  return svg(
    size,
    size,
    "0 0 200 200",
    `<g stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
       <rect x="44" y="160" width="124" height="22" rx="7" fill="var(--amber)"/>
       <rect x="60" y="146" width="92" height="16" rx="6" fill="var(--goldDeep)"/>
       <g data-head>
         <rect x="92" y="60" width="16" height="96" rx="7" fill="var(--goldDeep)" transform="rotate(42 100 108)"/>
         <g transform="rotate(42 100 108) translate(100 60)">
           <rect x="-46" y="-26" width="92" height="46" rx="9" fill="var(--amber)"/>
           <rect x="-52" y="-30" width="16" height="54" rx="5" fill="var(--gold)"/>
           <rect x="36" y="-30" width="16" height="54" rx="5" fill="var(--gold)"/>
         </g>
       </g>
     </g>`,
  );
}

/** Mouse pointer. */
export function cursor(size = 40) {
  return svg(
    size,
    size,
    "0 0 40 40",
    `<path d="M8 4 L8 31 L15.5 24.5 L20.5 36 L25.5 33.8 L20.6 22.6 L30.5 22 Z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  );
}

/** Paper plane (send / share). */
export function plane(size = 60, color = "var(--card)") {
  return svg(
    size,
    size,
    "0 0 60 60",
    `<g stroke="${INK}" stroke-width="3.2" stroke-linejoin="round">
       <path d="M5 28 L55 6 L40 54 L27 36 Z" fill="${color}"/>
       <path d="M55 6 L27 36 L27 50 L33.5 43" fill="var(--cardAlt)"/>
     </g>`,
  );
}

/** A sheet of paper with ruled "text". Lines are returned separately so props can animate them. */
export function sheet(w, h, { title = "", lines = 6, fold = true } = {}) {
  const rows = [];
  const top = title ? 96 : 52;
  const gap = Math.min(34, (h - top - 40) / Math.max(1, lines));
  for (let i = 0; i < lines; i++) {
    const y = top + i * gap;
    const len = (i % 3 === 2 ? 0.55 : i % 3 === 1 ? 0.82 : 0.92) * (w - 76);
    rows.push(
      `<rect data-line="${i}" x="38" y="${y}" width="${len.toFixed(0)}" height="9" rx="4.5" fill="${INK}" opacity="0.16"/>`,
    );
  }
  const f = fold ? 44 : 0;
  return svg(
    w,
    h,
    `0 0 ${w} ${h}`,
    `<path d="M0 14 a14 14 0 0 1 14 -14 H${w - f} L${w} ${f} V${h - 14} a14 14 0 0 1 -14 14 H14 a14 14 0 0 1 -14 -14 Z" fill="var(--shadow)" transform="translate(9 10)"/>
     <path d="M0 14 a14 14 0 0 1 14 -14 H${w - f} L${w} ${f} V${h - 14} a14 14 0 0 1 -14 14 H14 a14 14 0 0 1 -14 -14 Z" fill="var(--card)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
     ${fold ? `<path d="M${w - f} 0 V${f - 10} a10 10 0 0 0 10 10 H${w} Z" fill="var(--cardAlt)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` : ""}
     ${title ? `<text x="38" y="62" font-family="Fraunces, serif" font-weight="640" font-size="33" fill="${INK}" style="font-variation-settings:'SOFT' 60">${title}</text>` : ""}
     ${rows.join("")}`,
  );
}

export { svg };
