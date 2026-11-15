// Enter / exit choreography shared by every prop. A prop only describes what it looks like and
// how it behaves while it is on the pad; how it arrives and leaves is decided here, so the whole
// reel moves with one hand.
//
// The rules are measured from the reference (docs/TEMPLATE-SPEC.md, "Motion"):
//  - the caption cut ("swap frame") is the master clock of a beat;
//  - the outgoing prop leaves during the four frames BEFORE the swap: straight left at a
//    constant speed, blurring more each frame, still opaque, and is gone on the swap frame;
//  - the incoming prop arrives from the frame edge and settles like a critically damped spring:
//    fast, no overshoot, no bounce, about half a second to rest, with a few degrees of extra
//    tilt and its motion blur decaying on the same curve;
//  - the pad is never empty for more than the swap frame itself.
//
// One deliberate difference: the player starts a travelling prop two frames BEFORE the swap
// (main.js), so its first pixels are already on screen on the cut. For those two frames the new
// prop is entering at the right edge while the old one is clearing the left.

import { blurPop, clamp, ease, lerp, prog, settle } from "./timing.js";

export const FPS = 30;
export const ENTER_DUR = 0.5;
export const EXIT_FRAMES = 4;
export const EXIT_DUR = EXIT_FRAMES / FPS;

const TRAVEL = 760; // fallback distance an entering prop starts from (see spec.travel)
const EXIT_SPEED = 180 * FPS; // px per second: 180 px per frame at 1080 wide
const EXIT_BLUR = 4.5 * FPS; // blur gained per second: 4.5 px per frame
const OMEGA = 15; // spring stiffness; ~90% settled in 8 frames
const EPS = 1e-6;

const ENTERS = {
  // the default: slide in from a side, tilted, straightening as it lands
  right: (p) => ({ dx: p.left * p.travel, rot: p.left * 8, blur: p.left * 21 }),
  left: (p) => ({ dx: -p.left * p.travel, rot: -p.left * 8, blur: p.left * 21 }),
  // drop from above the pad (passes behind the caption, which is always the top layer)
  drop: (p) => ({ dy: -p.left * 520, rot: p.left * -4, blur: p.left * 12 }),
  // rise from behind the table
  rise: (p) => ({ dy: p.left * 520, blur: p.left * 10 }),
  // "blur-pop" for secondary elements: grows in place from ~half size, sharpening, no overshoot
  pop: (p) => ({ scale: p.pop.scale, opacity: p.pop.opacity, blur: p.pop.blur }),
  // a physical hit: arrives big and fast from the camera side
  stamp: (p) => ({ scale: lerp(2.2, 1, p.hard), opacity: clamp(p.t * 6), rot: (1 - p.hard) * 9 }),
  // full-width elements fade in place over five frames
  fade: (p) => ({ opacity: p.fade }),
  none: () => ({}),
};

const EXITS = {
  left: (q) => ({ dx: -q.dist, blur: q.blur }),
  right: (q) => ({ dx: q.dist, blur: q.blur }),
  up: (q) => ({ dy: -q.dist, blur: q.blur }),
  drop: (q) => ({ dy: q.dist, blur: q.blur }),
  fade: (q) => ({ opacity: 1 - q.t }),
  none: () => ({}),
};

/**
 * Wrapper state for a prop at time t.
 * @param spec  { x, y, rot, scale, enter, exit, enterDur, travel }
 *              `travel` is how far away the prop is on the swap frame; the player sets it so the
 *              prop's leading edge starts exactly at the frame edge (a sliver is already visible
 *              on the cut, as in the reference, instead of several empty frames).
 * @param tIn   time the prop starts arriving (normally the swap frame of its beat)
 * @param tOut  time the prop starts leaving (normally EXIT_DUR before the next swap);
 *              Infinity = never
 */
export function propPose(spec, t, tIn, tOut) {
  const enterDur = spec.enterDur ?? ENTER_DUR;
  // a hair of tolerance at both ends, so float error never shows a prop a frame late on its
  // arrival or for an extra frame after the swap
  const visible = t - tIn >= -EPS && t < tOut + EXIT_DUR - 1e-4;
  const local = Math.max(0, t - tIn);
  if (!visible) return { visible: false };

  const tn = prog(local, 0, enterDur);
  const s = settle(local, OMEGA);
  const enter = (ENTERS[spec.enter ?? "right"] ?? ENTERS.right)({
    t: tn,
    left: 1 - s, // share of the journey still to go
    travel: spec.travel ?? TRAVEL,
    pop: blurPop(local),
    hard: ease.outExpo(prog(local, 0, enterDur * 0.45)),
    fade: prog(local, 0, 5 / FPS),
  });

  let exit = {};
  if (t >= tOut - EPS) {
    const dt = Math.max(0, t - tOut);
    // the first exit frame has already moved one step, as in the reference
    exit = (EXITS[spec.exit ?? "left"] ?? EXITS.left)({
      dist: (dt + 1 / FPS) * EXIT_SPEED,
      blur: (dt + 1 / FPS) * EXIT_BLUR,
      t: prog(dt, 0, EXIT_DUR),
    });
  }

  return {
    visible: true,
    x: (spec.x ?? 0) + (enter.dx ?? 0) + (exit.dx ?? 0),
    y: (spec.y ?? 0) + (enter.dy ?? 0) + (exit.dy ?? 0),
    rot: (spec.rot ?? 0) + (enter.rot ?? 0),
    scale: (spec.scale ?? 1) * (enter.scale ?? 1),
    opacity: (enter.opacity ?? 1) * (exit.opacity ?? 1),
    blur: Math.max(enter.blur ?? 0, exit.blur ?? 0),
  };
}

export function applyPose(el, pose) {
  if (!pose.visible) {
    if (el._shown !== false) {
      el.style.display = "none";
      el._shown = false;
    }
    return;
  }
  if (el._shown !== true) {
    el.style.display = "";
    el._shown = true;
  }
  el.style.transform = `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px) rotate(${pose.rot.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
  el.style.opacity = pose.opacity.toFixed(3);
  el.style.filter = pose.blur > 0.4 ? `blur(${pose.blur.toFixed(1)}px)` : "";
}
