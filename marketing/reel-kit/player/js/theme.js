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
