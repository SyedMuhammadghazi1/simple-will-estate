// "Goldie", the gold-seal mascot: a certificate seal standing on its two ribbon tails.
// Original character for this kit. Every feature is a number so expressions blend instead of
// popping, and the whole thing is a pure function of time (idle bob, blinks and lip-flap included).

import { clamp, ease, lerp, prog } from "./timing.js";

const INK = "#1c1917";
const GOLD = "#f4b942";
const GOLD_LIGHT = "#fbd77b";
const GOLD_DEEP = "#d9962b";
const NAVY = "#1e3a5f";
const NAVY_DEEP = "#142a45";

const CY = -168; // body centre above the table line
const R_OUT = 116;
const R_IN = 104;
const LOBES = 16;
const HOP_DUR = 1 / 3;

function scallop() {
  const step = (Math.PI * 2) / LOBES;
  let d = "";
  for (let i = 0; i < LOBES; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const am = (a0 + a1) / 2;
    const p0 = [Math.cos(a0) * R_IN, CY + Math.sin(a0) * R_IN];
    const p1 = [Math.cos(a1) * R_IN, CY + Math.sin(a1) * R_IN];
    const c = [Math.cos(am) * (R_OUT + 14), CY + Math.sin(am) * (R_OUT + 14)];
    if (i === 0) d += `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`;
    d += ` Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  }
  return d + "Z";
}

/**
 * Faces are full parameter sets. Fields:
 *  look [x,y] -1..1 · blink 0..1 · happy 0..1 (eyes become ∩ arcs) · eye (scale)
 *  browY (px, negative = raised) · browTilt -1 worried .. +1 stern
 *  mw mouth half-width · mo mouth open 0..1 · mc mouth curve -1 frown .. +1 smile
 *  talk 0..1 how much the voice drives the mouth
 */
export const FACES = {
  idle: {
    look: [0.25, -0.1],
    blink: 0,
    happy: 0,
    eye: 1,
    browY: 0,
    browTilt: 0,
    mw: 17,
    mo: 0,
    mc: 0.7,
    talk: 0,
  },
  talk: {
    look: [0.3, -0.2],
    blink: 0,
    happy: 0,
    eye: 1,
    browY: -2,
    browTilt: 0,
    mw: 15,
    mo: 0.25,
    mc: 0.35,
    talk: 1,
  },
  look: {
    look: [0.85, -0.55],
    blink: 0,
    happy: 0,
    eye: 1.04,
    browY: -5,
    browTilt: 0,
    mw: 13,
    mo: 0.2,
    mc: 0.3,
    talk: 1,
  },
  shock: {
    look: [0.5, -0.35],
    blink: 0,
    happy: 0,
    eye: 1.2,
    browY: -16,
    browTilt: -0.25,
    mw: 12,
    mo: 1,
    mc: 0,
    talk: 0,
  },
  worried: {
    look: [0.35, 0.25],
    blink: 0,
    happy: 0,
    eye: 1.02,
    browY: -6,
    browTilt: -0.9,
    mw: 15,
    mo: 0.12,
    mc: -0.75,
    talk: 0.6,
  },
  stern: {
    look: [0.5, -0.15],
    blink: 0.22,
    happy: 0,
    eye: 0.96,
    browY: 5,
    browTilt: 0.75,
    mw: 15,
    mo: 0.08,
    mc: -0.3,
    talk: 0.7,
  },
  // heavy-lidded and flat: the reference's pose for its one dark beat (serious, not scolding)
  deadpan: {
    look: [0.45, 0.05],
    blink: 0.4,
    happy: 0,
    eye: 0.96,
    browY: 3,
    browTilt: 0.12,
    mw: 14,
    mo: 0.05,
    mc: -0.08,
    talk: 0.7,
  },
  think: {
    look: [-0.55, -0.8],
    blink: 0,
    happy: 0,
    eye: 1,
    browY: -8,
    browTilt: 0.2,
    mw: 11,
    mo: 0,
    mc: 0.1,
    talk: 0.5,
  },
  happy: {
    look: [0.2, -0.1],
    blink: 0,
    happy: 1,
    eye: 1,
    browY: -9,
    browTilt: 0,
    mw: 22,
    mo: 0.75,
    mc: 1,
    talk: 0,
  },
  smile: {
    look: [0.45, -0.2],
    blink: 0,
    happy: 0,
    eye: 1,
    browY: -4,
    browTilt: 0,
    mw: 20,
    mo: 0.3,
    mc: 1,
    talk: 0.5,
  },
  proud: {
    look: [0.6, -0.3],
    blink: 0.3,
    happy: 0,
    eye: 1,
    browY: -3,
    browTilt: 0.15,
    mw: 19,
    mo: 0,
    mc: 1,
    talk: 0.4,
  },
};

/** Arm poses: [left, right] angles in degrees. 0 = hanging down, 90 = straight out, 180 = up. */
export const POSES = {
  rest: [22, 22],
  point: [26, 128],
  pointUp: [26, 160],
  cheer: [158, 158],
  shrug: [100, 100],
  gasp: [140, 140],
  chin: [22, 196],
  wave: [22, 150],
  hips: [58, 58],
};

const FACE_KEYS = ["blink", "happy", "eye", "browY", "browTilt", "mw", "mo", "mc", "talk"];

function blendFace(a, b, p) {
  const out = { look: [lerp(a.look[0], b.look[0], p), lerp(a.look[1], b.look[1], p)] };
  for (const k of FACE_KEYS) out[k] = lerp(a[k], b[k], p);
  return out;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function buildMascot(parent, { x, baseY, scale = 1 }, palette = {}) {
  // a theme can re-colour the mascot (body and ribbons); the face stays the same
  const P = {
    body: GOLD,
    light: GOLD_LIGHT,
    deep: GOLD_DEEP,
    ribbon: NAVY,
    ribbonDeep: NAVY_DEEP,
    ...palette,
  };
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "layer");
  svg.setAttribute("viewBox", "0 0 1080 1920");
  svg.setAttribute("width", "1080");
  svg.setAttribute("height", "1920");
  svg.innerHTML = `
    <g id="m-root">
      <ellipse id="m-shadow" cx="0" cy="9" rx="104" ry="8" fill="#0b1626" opacity="0.5"/>
      <g id="m-body">
        <g id="m-ribbons" stroke="${INK}" stroke-width="5" stroke-linejoin="round">
          <path id="m-rib-l" fill="${P.ribbon}"/>
          <path id="m-rib-r" fill="${P.ribbonDeep}"/>
        </g>
        <g id="m-arms" fill="none" stroke-linecap="round">
          <path id="m-arm-l-o" stroke="${INK}" stroke-width="21"/>
          <path id="m-arm-r-o" stroke="${INK}" stroke-width="21"/>
          <path id="m-arm-l" stroke="${P.deep}" stroke-width="12"/>
          <path id="m-arm-r" stroke="${P.deep}" stroke-width="12"/>
          <circle id="m-hand-l" r="13" fill="${P.body}" stroke="${INK}" stroke-width="4.5"/>
          <circle id="m-hand-r" r="13" fill="${P.body}" stroke="${INK}" stroke-width="4.5"/>
        </g>
        <path d="${scallop()}" fill="${P.deep}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="0" cy="${CY}" r="96" fill="${P.body}" stroke="${INK}" stroke-opacity="0.2" stroke-width="3"/>
        <circle cx="0" cy="${CY}" r="85" fill="none" stroke="${P.deep}" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>
        <path d="M-66 ${CY - 44} A80 80 0 0 1 -14 ${CY - 78}" fill="none" stroke="${P.light}" stroke-width="9" stroke-linecap="round"/>
        <circle cx="-62" cy="${CY + 22}" r="13" fill="#f08a5d" opacity="0.42"/>
        <circle cx="62" cy="${CY + 22}" r="13" fill="#f08a5d" opacity="0.42"/>
        <g id="m-face">
          <g id="m-eyes">
            <ellipse id="m-eye-l" cx="-34" cy="${CY - 14}" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
            <ellipse id="m-eye-r" cx="34" cy="${CY - 14}" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
            <circle id="m-pup-l" r="10.5" fill="${INK}"/>
            <circle id="m-pup-r" r="10.5" fill="${INK}"/>
            <circle id="m-glint-l" r="3.6" fill="#fff"/>
            <circle id="m-glint-r" r="3.6" fill="#fff"/>
          </g>
          <g id="m-arcs" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round">
            <path d="M-52 ${CY - 8} Q-34 ${CY - 34} -16 ${CY - 8}"/>
            <path d="M16 ${CY - 8} Q34 ${CY - 34} 52 ${CY - 8}"/>
          </g>
          <path id="m-brow-l" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/>
          <path id="m-brow-r" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/>
          <path id="m-mouth" fill="#7a2416" stroke="${INK}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
        </g>
      </g>
    </g>`;
  parent.appendChild(svg);
  const $ = (id) => svg.querySelector(`#${id}`);
  const el = {
    root: $("m-root"),
    body: $("m-body"),
    shadow: $("m-shadow"),
    ribL: $("m-rib-l"),
    ribR: $("m-rib-r"),
    armL: $("m-arm-l"),
    armR: $("m-arm-r"),
    armLo: $("m-arm-l-o"),
    armRo: $("m-arm-r-o"),
    handL: $("m-hand-l"),
    handR: $("m-hand-r"),
    eyes: $("m-eyes"),
    arcs: $("m-arcs"),
    eyeL: $("m-eye-l"),
    eyeR: $("m-eye-r"),
    pupL: $("m-pup-l"),
    pupR: $("m-pup-r"),
    glL: $("m-glint-l"),
    glR: $("m-glint-r"),
    browL: $("m-brow-l"),
    browR: $("m-brow-r"),
    mouth: $("m-mouth"),
  };

  function arm(side, deg, pathEl, outlineEl, handEl) {
    const s = side === "l" ? -1 : 1;
    const sx = s * 100;
    const sy = CY + 12;
    const len = 70;
    const rad = (deg * Math.PI) / 180;
    const hx = sx + s * Math.sin(rad) * len;
    const hy = sy + Math.cos(rad) * len;
    // elbow bows outward a little so the arm reads as soft rather than a stick
    const mx = (sx + hx) / 2 + s * Math.cos(rad) * 10;
    const my = (sy + hy) / 2 - Math.sin(rad) * 6 + 6;
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
    pathEl.setAttribute("d", d);
    outlineEl.setAttribute("d", d);
    handEl.setAttribute("cx", hx.toFixed(1));
    handEl.setAttribute("cy", hy.toFixed(1));
  }

  function ribbons(sway, lift) {
    // The tails are anchored to the table (y = 0) and to the body, so they stretch as it bobs.
    const top = CY + 70 + lift;
    const l = `M${-58 + sway} ${top} L${-8 + sway} ${top + 6} L${-30} -2 L${-58} -24 L${-86} -2 Z`;
    const r = `M${58 + sway} ${top} L${8 + sway} ${top + 6} L${30} -2 L${58} -24 L${86} -2 Z`;
    el.ribL.setAttribute("d", l);
    el.ribR.setAttribute("d", r);
  }

  /**
   * Resolve the cue list into a face/pose at time t. Each cue: { t, face, pose, dur }.
   * Returns blended params plus the time since the last cue (drives the squash "pop").
   */
  function resolve(t, cues) {
    let i = -1;
    for (let k = 0; k < cues.length; k++) {
      if (cues[k].t <= t) i = k;
      else break;
    }
    const cur = i >= 0 ? cues[i] : { t: -10, face: "idle", pose: "rest" };
    const prev = i > 0 ? cues[i - 1] : { face: "idle", pose: "rest" };
    const dur = cur.dur ?? 0.2;
    const p = ease.outCubic(prog(t, cur.t, cur.t + dur));
    const face = blendFace(FACES[prev.face] ?? FACES.idle, FACES[cur.face] ?? FACES.idle, p);
    const a = POSES[prev.pose] ?? POSES.rest;
    const b = POSES[cur.pose] ?? POSES.rest;
    const pp = ease.outBack(prog(t, cur.t, cur.t + dur * 1.5), 2.2);
    // the hop belongs to whichever cue last asked for one, not to the current face
    let hop = 0;
    let hopAge = Infinity;
    for (let k = i; k >= 0 && t - cues[k].t < HOP_DUR; k--) {
      if (cues[k].hop) {
        hop = cues[k].hop;
        hopAge = t - cues[k].t;
        break;
      }
    }
    return {
      face,
      arms: [lerp(a[0], b[0], pp), lerp(a[1], b[1], pp)],
      since: t - cur.t,
      hop,
      hopAge,
    };
  }

  /**
   * @param t      absolute time in seconds
   * @param cues   sorted [{ t, face, pose, dur, hop }]
   * @param voice  0..1 speech envelope at t (drives the lip-flap)
   * @param place  optional { x, baseY, scale, opacity } override (the end card moves the mascot)
   */
  function update(t, cues, voice = 0, place = {}) {
    const { face, arms, since, hop, hopAge } = resolve(t, cues);

    // idle life: slow bob, breathing, periodic blink
    const bob = Math.sin((t * Math.PI * 2) / 2.2) * 7;
    const breathe = Math.sin((t * Math.PI * 2) / 2.6 + 1.1) * 0.012;
    // a three-frame blink on a fixed 97-frame timer, as measured
    const blinkPhase = (t + 1.3) % (97 / 30);
    const autoBlink = blinkPhase < 0.1 ? Math.sin((blinkPhase / 0.1) * Math.PI) : 0;

    // five frames up, five down, as measured
    const hopY = hop && hopAge < HOP_DUR ? -Math.sin((hopAge / HOP_DUR) * Math.PI) * hop : 0;
    // squash on LANDING (a few px, decaying); a smaller settle when only the face changes
    const landed = hop ? hopAge - HOP_DUR : -1;
    const squash =
      landed >= 0 && landed < 0.4 ? -Math.exp(-11 * landed) * Math.cos(landed * 24) * 0.05 : 0;
    const settleFace =
      !hop && since >= 0 && since < 0.5 ? Math.exp(-9 * since) * Math.sin(since * 26) * 0.035 : 0;
    const pop = squash + settleFace;
    const sy = 1 + breathe + pop;
    const sx = 1 - (breathe + pop) * 0.7;
    const lift = bob + hopY;

    const px = place.x ?? x;
    const py = place.baseY ?? baseY;
    const sc = (place.scale ?? 1) * scale;
    el.root.setAttribute(
      "transform",
      `translate(${px.toFixed(2)} ${py.toFixed(2)}) scale(${sc.toFixed(4)})`,
    );
    el.root.style.opacity = place.opacity ?? 1;
    el.body.setAttribute(
      "transform",
      `translate(0 ${lift.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`,
    );
    el.shadow.setAttribute("rx", (104 - Math.abs(lift) * 1.2).toFixed(1));
    el.shadow.style.opacity = place.shadow ?? 1;
    // ribbons live outside the squashed body transform so their feet stay planted
    ribbons(Math.sin(t * 2.1) * 1.5, 0);

    arm("l", arms[0] + Math.sin(t * 2.4) * 2, el.armL, el.armLo, el.handL);
    arm("r", arms[1] + Math.sin(t * 2.4 + 1) * 2, el.armR, el.armRo, el.handR);

    // eyes
    const blink = clamp(Math.max(face.blink, autoBlink));
    const open = 1 - blink;
    const ry = Math.max(2.2, 24 * face.eye * open);
    const rx = 20 * face.eye;
    for (const [eye, pup, gl, cx] of [
      [el.eyeL, el.pupL, el.glL, -34],
      [el.eyeR, el.pupR, el.glR, 34],
    ]) {
      eye.setAttribute("rx", rx.toFixed(2));
      eye.setAttribute("ry", ry.toFixed(2));
      const ox = cx + face.look[0] * 8.5;
      const oy = CY - 14 + face.look[1] * 9 * open;
      pup.setAttribute("cx", ox.toFixed(2));
      pup.setAttribute("cy", oy.toFixed(2));
      pup.setAttribute("r", (10.5 * Math.min(1, open * 1.6)).toFixed(2));
      gl.setAttribute("cx", (ox + 3.6).toFixed(2));
      gl.setAttribute("cy", (oy - 4).toFixed(2));
      gl.setAttribute("r", (3.6 * Math.min(1, open * 1.6)).toFixed(2));
    }
    el.eyes.style.opacity = (1 - face.happy).toFixed(3);
    el.arcs.style.opacity = face.happy.toFixed(3);

    // brows: tilt > 0 pulls the inner ends down (stern), < 0 pushes them up (worried)
    const by = CY - 50 + face.browY - 24 * (face.eye - 1);
    const tilt = face.browTilt * 9;
    el.browL.setAttribute(
      "d",
      `M-53 ${(by - tilt).toFixed(1)} Q-36 ${(by - 5).toFixed(1)} -19 ${(by + tilt).toFixed(1)}`,
    );
    el.browR.setAttribute(
      "d",
      `M19 ${(by + tilt).toFixed(1)} Q36 ${(by - 5).toFixed(1)} 53 ${(by - tilt).toFixed(1)}`,
    );

    // mouth: a lens whose top and bottom edges bend with the curve and part with openness
    const mo = clamp(Math.max(face.mo, voice * face.talk * 0.85));
    const w = face.mw * (1 - 0.18 * voice * face.talk);
    const myc = CY + 34;
    const bend = face.mc * 11;
    const cornerY = myc - bend * 0.25;
    const topY = myc + bend * 0.9 - mo * 4;
    // cubic bottom edge so an open mouth is a rounded "D"/"O" rather than a pointed "V"
    const botY = myc + bend * 0.9 + mo * 40 + 0.5;
    el.mouth.setAttribute(
      "d",
      `M${(-w).toFixed(1)} ${cornerY.toFixed(1)} Q0 ${topY.toFixed(1)} ${w.toFixed(1)} ${cornerY.toFixed(1)} C${(w * 0.95).toFixed(1)} ${botY.toFixed(1)} ${(-w * 0.95).toFixed(1)} ${botY.toFixed(1)} ${(-w).toFixed(1)} ${cornerY.toFixed(1)}Z`,
    );
    el.mouth.setAttribute("fill", mo > 0.06 ? "#7a2416" : "none");
  }

  return { update, el: svg };
}

/** Speech envelope from word timings: open on each word, flapping at a syllable-ish rate. */
export function voiceLevel(t, words) {
  for (const w of words) {
    if (t < w.t0 - 0.02) break;
    if (t <= w.t1) {
      const local = t - w.t0;
      const len = Math.max(0.08, w.t1 - w.t0);
      const env = Math.sin(clamp(local / len) * Math.PI);
      return clamp(0.35 + 0.65 * Math.abs(Math.sin(local * Math.PI * 5.2))) * Math.pow(env, 0.35);
    }
  }
  return 0;
}
