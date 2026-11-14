// Design tokens. Each colour is a [light, dark] pair; the stage blends between them with the
// current "mood" (0 = light, 1 = dark) and publishes the result as CSS custom properties, so a
// whole-frame mood shift is one number on the timeline.
//
// To re-skin the template for another brand, copy a theme, change the values and reference it
// from reel.json ("theme": "your-theme"). Layout numbers live in LAYOUT below.

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
      ghost: ["#bdb6ab", "#4a5a74"],
      accent: ["#b45309", "#f4b942"],
      accentGhost: ["#e3bf9c", "#6b5a38"],
      eyebrow: ["#6b7a5e", "#8ea0bd"],
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
  pad: { x: 90, y: 712, w: 900, h: 654, r: 26, binding: 50 },
  tableY: 1338,
  mascot: { x: 212, baseY: 1340 },
};
