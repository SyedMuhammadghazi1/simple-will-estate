// Deterministic timing helpers. Every visual in the kit is a pure function of time, so a frame
// rendered at t is identical no matter when or in what order it is drawn. Nothing here may read
// the wall clock or Math.random().

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Progress of x through [a, b], clamped to 0..1. */
export const prog = (x, a, b) => (b === a ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a)));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inQuart: (t) => t * t * t * t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  /** Overshoots past 1 then settles. `s` controls how far (1.70158 ≈ 10%). */
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
};

/**
 * Under-damped spring step response: starts at 0, overshoots, settles on 1.
 * `t` is in seconds. Higher `damping` settles faster; `freq` is oscillations per second.
 */
export function spring(t, { damping = 9, freq = 3.2 } = {}) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-damping * t) * Math.cos(2 * Math.PI * freq * t);
}

/**
 * Critically damped step response: goes 0 -> 1 as fast as possible with no overshoot. This is the
 * curve every main prop arrives on (`w` = 15 fits the reference: ~90% in 8 frames, rest by 15).
 */
export function settle(t, w = 15) {
  if (t <= 0) return 0;
  return 1 - (1 + w * t) * Math.exp(-w * t);
}

/**
 * "Blur-pop": how secondary elements (tags, chips, badges) appear, `t` seconds after their
 * trigger. Grows from `from` to full size while fading in and sharpening; ten frames, no
 * overshoot. Returns { p, scale, opacity, blur }.
 */
export function blurPop(t, from = 0.55, dur = 1 / 3) {
  const p = ease.outCubic(prog(t, 0, dur));
  return { p, scale: lerp(from, 1, p), opacity: p, blur: (1 - p) * 12 };
}

/** Eased progress of `t` through a window that starts at `t0` and lasts `dur` seconds. */
export function tween(t, t0, dur, fn = ease.outCubic) {
  return fn(prog(t, t0, t0 + dur));
}

/**
 * Keyframe interpolation. `frames` is [[time, value, easeIntoThisFrame?], ...] sorted by time.
 * Values may be numbers or equal-length number arrays.
 */
export function kf(t, frames, defaultEase = ease.inOutCubic) {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, e1] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      const p = (e1 ?? defaultEase)(prog(t, t0, t1));
      if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], p));
      return lerp(v0, v1, p);
    }
  }
  return last[1];
}

/** Seeded PRNG (mulberry32) so "random" scatter is the same on every render. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse "#rrggbb" into [r, g, b]. */
export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix two "#rrggbb" colours; returns an "rgb(...)" string. */
export function mix(c0, c1, t) {
  const a = hex(c0);
  const b = hex(c1);
  const p = clamp(t);
  return `rgb(${Math.round(lerp(a[0], b[0], p))}, ${Math.round(lerp(a[1], b[1], p))}, ${Math.round(lerp(a[2], b[2], p))})`;
}

/** Format an integer with thousands separators without relying on the host locale. */
export function commas(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
