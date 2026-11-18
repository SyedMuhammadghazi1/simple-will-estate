// Design tokens. Each colour is a [light, dark] pair; the stage blends between them with the
// current "mood" (0 = light, 1 = dark) and publishes the result as CSS custom properties, so a
// whole-frame mood shift is one number on the timeline.
//
// To re-skin the template for another brand, copy a theme, change the values and reference it
// from reel.json ("theme": "your-theme"). Layout numbers live in LAYOUT below.
//
// A theme may also carry:
//   mascot   { body, light, deep, ribbon, ribbonDeep }   the mascot's own palette
//   set      "desk" (books + photo frame, the default) or "gaming" (game cases + a gamepad)
//   endcard  { top, bottom, glow: "r,g,b", accent }      the follow card's colours

export const THEMES = {
  plainwill: {
    fonts: {
      caption: '"Fraunces", Georgia, serif',
      ui: '"Inter", system-ui, sans-serif',
      mono: '"DM Mono", ui-monospace, monospace',
    },
    colors: {
      // wall behind the board
      wallTop: ["#f9f6f0", "#101d31"],
      wallBottom: ["#f1e6d3", "#0b1626"],
      wallGlow: ["#f6d9a8", "#17335a"],
      // table that fills the bottom third (sits under Instagram's own caption UI)
      tableTop: ["#2a4f80", "#12233b"],
      tableFront: ["#1e3a5f", "#0a1524"],
      tableFrontLow: ["#172e4d", "#070f1b"],
      // the ruled pad that props are staged on
      pad: ["#fffdf7", "#16273f"],
      padRule: ["#c9d9ec", "#213a5c"],
      padMargin: ["#efb1a2", "#3a3247"],
      padBinding: ["#1e3a5f", "#0d1a2d"],
      padShadow: ["#d9cdb8", "#070f1b"],
      // text
      ink: ["#1c1917", "#f6efe0"],
      ghost: ["#a69e93", "#4a5a74"],
      accent: ["#b45309", "#f4b942"],
      eyebrow: ["#55634a", "#8ea0bd"],
      // prop palette (props read these so they follow the mood too)
      line: ["#1c1917", "#f6efe0"],
      card: ["#ffffff", "#1b2f4b"],
      cardAlt: ["#f4efe6", "#223a5c"],
      navy: ["#1e3a5f", "#3d6aa3"],
      navySoft: ["#e8eef6", "#223a5c"],
      gold: ["#f4b942", "#f4b942"],
      goldDeep: ["#d9962b", "#d9962b"],
      amber: ["#b45309", "#f4b942"],
      red: ["#c2412d", "#e2664f"],
      green: ["#2f7d4f", "#57b17c"],
      greenSoft: ["#e3f3e8", "#1d3d33"],
      sky: ["#bcd6ee", "#2b4a73"],
      muted: ["#7b746b", "#93a3bd"],
      shadow: ["#1c1917", "#050b14"],
    },
  },

  // Sunset city: an animated retro-sunset backdrop (scene.js) with palms, skyline and traffic;
  // poster captions; mood "dark" is neon night. For gaming and pop-culture explainers.
  "sunset-city": {
    fonts: {
      caption: '"Anton", Impact, sans-serif',
      ui: '"Inter", system-ui, sans-serif',
      mono: '"DM Mono", ui-monospace, monospace',
    },
    stage: "scene",
    mascot: false,
    float: 7,
    moodFade: 0.9,
    caption: {
      align: "center",
      size: 80,
      line: 86,
      y: 352,
      left: 80,
      width: 920,
      className: "poster",
    },
    mark: `<svg viewBox="0 0 40 34" width="40" height="34"><rect x="0" y="22" width="11" height="12" rx="2" fill="currentColor" opacity="0.6"/><rect x="14" y="12" width="11" height="22" rx="2" fill="currentColor" opacity="0.85"/><rect x="28" y="0" width="12" height="34" rx="2" fill="#7c5cff"/></svg>`,
    // translucent, so the city keeps moving behind the follow card
    endcard: {
      top: "rgba(26,9,52,0.62)",
      bottom: "rgba(8,4,22,0.86)",
      glow: "255,79,168",
      accent: "#ff6fc0",
    },
    colors: {
      wallTop: ["#1b0b3f", "#04030d"],
      wallBottom: ["#ffb35c", "#4a1a6e"],
      wallGlow: ["#ff6a74", "#341565"],
      tableTop: ["#12071f", "#12071f"],
      tableFront: ["#12071f", "#12071f"],
      tableFrontLow: ["#12071f", "#12071f"],
      pad: ["#12071f", "#12071f"],
      padRule: ["#12071f", "#12071f"],
      padMargin: ["#12071f", "#12071f"],
      padBinding: ["#12071f", "#12071f"],
      padShadow: ["#12071f", "#12071f"],
      ink: ["#fff6e8", "#fff6e8"],
      ghost: ["#e9a6d2", "#8a78c2"],
      accent: ["#ffe45c", "#ff4fd8"],
      eyebrow: ["#fff6e8", "#fff6e8"],
      line: ["#ff7ac8", "#3ef2ff"],
      card: ["#1d0c33", "#120a2e"],
      cardAlt: ["#33174f", "#241552"],
      navy: ["#7c5cff", "#7c5cff"],
      navySoft: ["#33174f", "#241552"],
      gold: ["#ffd24a", "#ffd24a"],
      goldDeep: ["#ff9a3c", "#ff9a3c"],
      amber: ["#ff4fa8", "#ff4fd8"],
      red: ["#ff5d6c", "#ff5d6c"],
      green: ["#7dffa8", "#5dffb0"],
      greenSoft: ["#16402c", "#16402c"],
      sky: ["#3a1d5c", "#241552"],
      muted: ["#d8b4e2", "#a99ad8"],
      shadow: ["#0b0516", "#03020a"],
    },
  },

  // Minimal dark: no pad, table or mascot; centred captions; props float on near-black. Mood
  // "dark" flips to a pale paper page instead (used for the beat where the maths lands).
  noir: {
    fonts: {
      caption: '"Fraunces", Georgia, serif',
      ui: '"Inter", system-ui, sans-serif',
      mono: '"DM Mono", ui-monospace, monospace',
    },
    stage: "bare",
    mascot: false,
    caption: { align: "center", size: 58, line: 74, y: 362, left: 90, width: 900 },
    // Echelons AI mark: three rising steps, the last one lit
    mark: `<svg viewBox="0 0 40 34" width="40" height="34"><rect x="0" y="22" width="11" height="12" rx="2" fill="currentColor" opacity="0.55"/><rect x="14" y="12" width="11" height="22" rx="2" fill="currentColor" opacity="0.8"/><rect x="28" y="0" width="12" height="34" rx="2" fill="#7c5cff"/></svg>`,
    endcard: { top: "#121117", bottom: "#07070a", glow: "124,92,255", accent: "#a991ff" },
    colors: {
      wallTop: ["#121216", "#ecebe6"],
      wallBottom: ["#08080a", "#dddbd4"],
      wallGlow: ["#1c1a2b", "#f6f5f1"],
      tableTop: ["#121216", "#ecebe6"],
      tableFront: ["#121216", "#ecebe6"],
      tableFrontLow: ["#121216", "#ecebe6"],
      pad: ["#121216", "#ecebe6"],
      padRule: ["#121216", "#ecebe6"],
      padMargin: ["#121216", "#ecebe6"],
      padBinding: ["#121216", "#ecebe6"],
      padShadow: ["#121216", "#ecebe6"],
      ink: ["#f4f3ef", "#16161a"],
      ghost: ["#5b5a63", "#a9a7a0"],
      accent: ["#3ee08f", "#13945a"],
      eyebrow: ["#f4f3ef", "#16161a"],
      line: ["#3a3942", "#c9c6bd"],
      card: ["#17171c", "#f7f6f2"],
      cardAlt: ["#24232b", "#e4e2dc"],
      navy: ["#7c5cff", "#5b3fe0"],
      navySoft: ["#24232b", "#e4e2dc"],
      gold: ["#f6c445", "#e0a923"],
      goldDeep: ["#e09a23", "#c47f12"],
      amber: ["#7c5cff", "#5b3fe0"],
      red: ["#ff5d5d", "#d23b3b"],
      green: ["#3ee08f", "#13945a"],
      greenSoft: ["#163326", "#dff3e8"],
      sky: ["#2a2840", "#d9d6f2"],
      muted: ["#8a8893", "#6b6962"],
      shadow: ["#000000", "#c9c6bd"],
    },
  },

  // A warm evening palette for entertainment and gaming explainers: peach wall, plum table,
  // magenta accent, teal as the second colour. Dark mood is a neon night.
  sunset: {
    fonts: {
      caption: '"Fraunces", Georgia, serif',
      ui: '"Inter", system-ui, sans-serif',
      mono: '"DM Mono", ui-monospace, monospace',
    },
    set: "gaming",
    mascot: {
      body: "#3fd0c4",
      light: "#a6f1e8",
      deep: "#149a90",
      ribbon: "#d6246e",
      ribbonDeep: "#a3154f",
    },
    endcard: { top: "#3a1c63", bottom: "#1c0d36", glow: "255,95,162", accent: "#ffb347" },
    colors: {
      wallTop: ["#fff6ee", "#1b1036"],
      wallBottom: ["#ffd9c7", "#120a26"],
      wallGlow: ["#ff9fb8", "#5a1f7a"],
      tableTop: ["#5b2a86", "#2a1447"],
      tableFront: ["#43206a", "#1a0c30"],
      tableFrontLow: ["#331850", "#100720"],
      pad: ["#fffdf9", "#23153f"],
      padRule: ["#f3d7e2", "#35215c"],
      padMargin: ["#9fded9", "#2c3f66"],
      padBinding: ["#43206a", "#150a2a"],
      padShadow: ["#e8bfae", "#0b0518"],
      ink: ["#1d1420", "#fdf3ea"],
      ghost: ["#b09f9c", "#57487a"],
      accent: ["#c2185b", "#ff6fa8"],
      eyebrow: ["#6d3d63", "#b6a3d6"],
      line: ["#1d1420", "#fdf3ea"],
      card: ["#ffffff", "#2b1a4c"],
      cardAlt: ["#f7ecf2", "#39245f"],
      navy: ["#43206a", "#8a5fd0"],
      navySoft: ["#efe6fb", "#39245f"],
      gold: ["#f6c445", "#f6c445"],
      goldDeep: ["#e09a23", "#e09a23"],
      amber: ["#c2185b", "#ff6fa8"],
      red: ["#d33a2c", "#ff6b5a"],
      green: ["#12877f", "#3ecfc4"],
      greenSoft: ["#dff5f2", "#17403f"],
      sky: ["#b9ebe6", "#2d4a73"],
      muted: ["#7d6b78", "#a797c4"],
      shadow: ["#1d1420", "#07030f"],
    },
  },
};

// Geometry in the 1080x1920 design space. The vertical bands are the template's safe-zone logic.
// Meta's published Reels safe zone (for ads; the only official numbers) keeps text and logos out
// of the top 14%, the bottom 35% and 6% at each side: y 269-1248, x 65-1015. Everything that
// must be read (eyebrow, caption, prop text, the pad's fine print) lives inside that box. The
// table, the mascot's feet and the set dressing may sit lower: they are scenery, and the bottom
// 30% is deliberately empty so the platform's own caption and audio UI land on nothing.
export const LAYOUT = {
  W: 1080,
  H: 1920,
  SAFE: { top: 269, bottom: 1248, left: 65, right: 1015 },
  SIDE: 72,
  eyebrowY: 270,
  captionY: 308,
  captionMaxW: 936,
  captionSize: 68,
  captionLine: 86,
  // the pad runs 28px below the table line so its bottom corners hide behind the table
  pad: { x: 90, y: 712, w: 900, h: 654, r: 26, binding: 60 },
  tableY: 1338,
  mascot: { x: 212, baseY: 1340 },
};
