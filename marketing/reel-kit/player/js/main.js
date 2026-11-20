// Player entry point. Loads a reel, builds the scene once, then exposes window.reel.seek(t):
// a pure "draw the frame at time t" function. The renderer calls it once per frame; the preview
// calls it from requestAnimationFrame. Same code path, so what you scrub is what you export.

import { buildCaptions } from "./captions.js";
import { buildEndcard } from "./endcard.js";
import { buildMascot, voiceLevel } from "./mascot.js";
import { applyPose, EXIT_DUR, FPS, propPose } from "./motion.js";
import { PROPS } from "./props/index.js";
import { h } from "./props/_util.js";
import { buildStage } from "./stage.js";
import { LAYOUT, THEMES } from "./theme.js";
import { buildTimeline, resolveAt } from "./timeline.js";
import { clamp, commas, prog } from "./timing.js";

const params = new URLSearchParams(location.search);
const reelDir = (params.get("reel") ?? "").replace(/\/$/, "");
const renderMode = params.get("mode") === "render";
let MOOD_IN = 4 / 30;
let MOOD_OUT = 3 / 30;
const HOP = 36; // mascot hop on every caption cut (px)
const EPS = 1e-6;

async function getJson(url, optional = false) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`could not load ${url} (${res.status})`);
  }
  return res.json();
}

async function boot() {
  if (!reelDir) throw new Error("no reel selected: open the player with ?reel=../reels/<slug>");
  const reel = await getJson(`${reelDir}/reel.json`);
  const timing = params.get("estimate") ? null : await getJson(`${reelDir}/timeline.json`, true);
  const theme = THEMES[reel.theme ?? "plainwill"];
  if (!theme) throw new Error(`unknown theme "${reel.theme}"`);
  // a scenic theme fades between moods slowly (sunset to night) instead of the reference's snap
  if (theme.moodFade) MOOD_IN = MOOD_OUT = theme.moodFade;
  const tl = buildTimeline(reel, timing);
  // The motion rules in motion.js are measured in frames of a 30 fps reel.
  if (tl.fps !== FPS) throw new Error(`reel.fps must be ${FPS} (got ${tl.fps})`);
  const warnings = [];

  const root = document.getElementById("root");
  const stage = buildStage(root, theme, { disclaimer: reel.disclaimer ?? "" });
  const { layers } = stage;

  // fonts must be resolved before captions are measured, or auto-fit lies
  await Promise.all(
    [
      '560 68px "Fraunces"',
      'italic 600 68px "Fraunces"',
      '500 23px "DM Mono"',
      '400 23px "DM Mono"',
      '600 27px "Inter"',
      '400 68px "Anton"',
    ].map((f) => document.fonts.load(f)),
  );
  await document.fonts.ready;

  const captions = buildCaptions(layers.caption, tl.beats, {
    eyebrow: reel.eyebrow ?? "",
    style: theme.caption,
    mark: theme.mark,
  });
  warnings.push(...captions.fit(reel.maxCaptionLines ?? 3));

  // ---- props -------------------------------------------------------------------------------
  // default prop anchor: the pad's centre, or the middle of the safe zone on a bare stage
  const bare = theme.stage === "bare" || theme.stage === "scene";
  const padCx = bare ? LAYOUT.W / 2 : LAYOUT.pad.x + LAYOUT.pad.w / 2;
  const padCy = bare ? 900 : (LAYOUT.pad.y + LAYOUT.pad.binding + LAYOUT.tableY) / 2;
  const instances = [];
  const sfx = [];
  tl.beats.forEach((beat, i) => {
    const specs = beat.props ?? (beat.prop ? [beat.prop] : []);
    specs.forEach((raw, k) => {
      const mod = PROPS[raw.type];
      if (!mod) throw new Error(`beat "${beat.id}": unknown prop type "${raw.type}"`);
      const spec = { x: padCx, y: padCy, ...raw };
      const spanned = tl.beats.slice(i, i + (spec.span ?? 1));
      const last = spanned[spanned.length - 1];
      // A travelling prop starts two frames before the cut, while the old one is still clearing
      // the left edge, so that its first pixels are on screen right after the swap frame.
      const travels = ["right", "left", "drop", "rise"].includes(spec.enter ?? "right");
      // (a hero prop that pops in on the cut gets the same head start, so the pad is not empty)
      const early = travels || spec.enter === "pop";
      const preroll = early && spec.delay == null && i > 0 ? 2 / tl.fps : 0;
      const tIn = resolveAt(spec.delay ?? 0, beat, spanned) - preroll;
      // leave during the four frames before the next caption cut, so old and new never overlap
      // ...except a prop on the final beat: it stays put and the end card rises over it, so the
      // pad is never empty while the last caption is still up
      const intoEndcard = tl.endcard && last.index === tl.beats.length - 1;
      // a solid end card rises over the last prop; over a see-through card (artwork or scene
      // themes) the last prop fades out as the card arrives, so the two never overlap
      const seeThrough = bare;
      if (intoEndcard) spec.exit = seeThrough ? "fade" : "none";
      const tOut = intoEndcard
        ? tl.endcard.start + (seeThrough ? 0 : 0.7)
        : last.end - EXIT_DUR + (spec.linger ?? 0);
      const ctx = {
        spec,
        beat,
        dur: tOut - tIn,
        at: (cue) => resolveAt(cue, beat, spanned) - tIn,
        asset: (file) => `${reelDir}/${file}`,
        seed: (i + 1) * 1000 + k * 37,
      };
      const wrap = h("div", { class: "prop", style: `z-index:${spec.z ?? 10 + i}` });
      const body = h("div", { class: raw.plate ? "prop-body plate" : "prop-body" });
      wrap.appendChild(body);
      layers.props.appendChild(wrap);
      const state = mod.build(body, spec, ctx);
      // start with the leading edge on the frame edge, so the prop is already arriving on the cut
      if (spec.travel == null) {
        const scale = spec.scale ?? 1;
        const half = (body.offsetWidth * scale) / 2;
        // a prop whose left part pops in later reports where its first visible pixels are
        const inset = (mod.leadInset?.(spec) ?? 0) * scale;
        spec.travel =
          spec.enter === "left"
            ? spec.x + half + 8
            : Math.max(200, LAYOUT.W - (spec.x - half + inset) + 8);
      }
      instances.push({ mod, spec, ctx, wrap, body, state, tIn, tOut, seed: ctx.seed });

      // Default sounds follow the motion: a travelling prop whooshes, a blur-pop pops quietly,
      // anything that appears in place is silent.
      const enterSound = travels ? "whoosh-in" : spec.enter === "pop" ? "pop" : null;
      if (spec.enterSfx !== false && (spec.enterSfx ?? enterSound)) {
        sfx.push({ t: tIn, name: spec.enterSfx ?? enterSound, gain: travels ? 1 : 0.6 });
      }
      const slidesOut = ["left", "right", "up", "drop"].includes(spec.exit ?? "left");
      if (spec.exitSfx !== false && (spec.exitSfx ?? slidesOut) && tOut < tl.duration - 0.05) {
        sfx.push({ t: tOut, name: spec.exitSfx ?? "whoosh-out" });
      }
      // a prop is only heard while it is on screen
      for (const cue of mod.sfx?.(spec, ctx) ?? []) {
        if (cue.t < 0 || tIn + cue.t > tOut + EXIT_DUR) continue;
        sfx.push({ ...cue, t: tIn + cue.t });
      }
    });
    for (const cue of beat.sfx ?? []) {
      sfx.push({ ...cue, t: resolveAt(cue.at ?? 0, beat), at: undefined });
    }
    // every caption cut gets the same soft low swell; a turn to dark gets the one big hit
    if (i > 0) sfx.push({ t: beat.start, name: "cut" });
    const wasDark = i > 0 && tl.beats[i - 1].mood === "dark";
    if (beat.mood === "dark" && !wasDark && beat.moodSfx !== false) {
      sfx.push({ t: beat.start, name: "sub" });
      sfx.push({ t: beat.start, name: "drone", dur: beat.end - beat.start });
    }
  });

  // ---- mascot ------------------------------------------------------------------------------
  const mascot = buildMascot(layers.mascot, LAYOUT.mascot, theme.mascot);
  // a theme without a mascot (theme.mascot === false) keeps the timing code but hides it
  if (theme.mascot === false) layers.mascot.style.display = "none";
  // One pose per beat, swapped on the cut with a small hop; extra cues inside a beat (reacting
  // to a word) change the face without hopping unless they ask to.
  const cues = [];
  let prevCue = { face: "talk", pose: "rest" };
  for (const beat of tl.beats) {
    const own = (beat.mascot ?? []).map((cue) => ({ ...cue, t: resolveAt(cue.at ?? 0, beat) }));
    const opener = own.find((cue) => cue.t <= beat.start + 1e-6);
    if (opener) {
      opener.hop ??= HOP;
      opener.dur ??= 0.1;
    } else {
      own.unshift({ t: beat.start, face: prevCue.face, pose: prevCue.pose, hop: HOP, dur: 0.1 });
    }
    for (const cue of own) {
      cue.face ??= prevCue.face;
      cue.pose ??= prevCue.pose;
      prevCue = cue;
      cues.push(cue);
    }
  }
  const endcard = buildEndcard(layers.endback, layers.overlay, reel.endcard, tl, theme.endcard);
  const hud = reel.hud ? buildHud(layers.caption, reel.hud, tl) : null;
  const backdrops = reel.backdrops ? buildBackdrops(layers.back, reel.backdrops, tl) : null;
  if (hud) sfx.push(...hud.sfx);
  if (tl.endcard) {
    const said = tl.endcard.words;
    if (said.length) {
      // a spoken card: the mascot says the line, then settles into the wave
      cues.push({ t: tl.endcard.start + 0.04, face: "talk", pose: "cheer", dur: 0.25 });
      cues.push({ t: tl.endcard.start + 1.05, face: "talk", pose: "wave", dur: 0.3 });
      cues.push({
        t: said[said.length - 1].t1 + 0.05,
        face: "happy",
        pose: "wave",
        dur: 0.2,
        hop: 18,
      });
    } else {
      cues.push({ t: tl.endcard.start + 0.04, face: "happy", pose: "cheer", dur: 0.25 });
      cues.push({ t: tl.endcard.start + 1.05, face: "smile", pose: "wave", dur: 0.3 });
    }
    sfx.push(...endcard.sfx());
  }
  cues.sort((a, b) => a.t - b.t);
  const allWords = [...tl.beats.flatMap((b) => b.words), ...(tl.endcard?.words ?? [])];

  // ---- per-frame ----------------------------------------------------------------------------
  // Mood follows the reference: the frame darkens over ~4 frames starting ON the cut into a dark
  // beat, and lightens over the last 3 frames BEFORE the cut out of it, so the next beat opens
  // fully lit.
  const moodOf = (beat) => (beat?.mood === "dark" ? 1 : 0);
  function moodAt(t, active) {
    if (active < 0) return 0;
    const beat = tl.beats[active];
    const here = moodOf(beat);
    const before = active > 0 ? moodOf(tl.beats[active - 1]) : 0;
    const after = moodOf(tl.beats[active + 1]);
    let m = here;
    if (here > before) m = before + (here - before) * prog(t, beat.start, beat.start + MOOD_IN);
    if (here > after)
      m = Math.min(m, after + (here - after) * (1 - prog(t, beat.end - MOOD_OUT, beat.end)));
    return m;
  }

  function seek(time) {
    const t = clamp(time, 0, tl.duration);
    let active = -1;
    // cuts sit exactly on frames; the epsilon keeps float error from delaying one by a frame
    for (let i = 0; i < tl.beats.length; i++) if (tl.beats[i].start <= t + EPS) active = i;
    const inEnd = tl.endcard && t >= tl.endcard.start - EPS;

    const place = endcard.update(t);
    let mood = moodAt(t, active);
    if (place) mood *= place.captionFade;
    stage.update(t, { mood });

    captions.update(t, inEnd && place.captionFade <= 0 ? -1 : active);
    if (place) {
      layers.caption.style.opacity = place.captionFade.toFixed(3);
    } else {
      layers.caption.style.opacity = "1";
    }

    for (const inst of instances) {
      const pose = propPose(inst.spec, t, inst.tIn, inst.tOut);
      applyPose(inst.wrap, pose);
      if (pose.visible) {
        inst.mod.update(inst.state, t - inst.tIn, inst.ctx);
        // a scenic theme lets every prop float gently, so nothing on screen is ever still
        if (theme.float) {
          const f = theme.float;
          const ph = inst.seed * 0.37;
          inst.body.style.transform = `translate(-50%, -50%) translateY(${(Math.sin(t * 1.4 + ph) * f).toFixed(2)}px) rotate(${(Math.sin(t * 0.9 + ph) * f * 0.06).toFixed(3)}deg)`;
        }
      }
    }

    mascot.update(t, cues, voiceLevel(t, allWords), place ?? {});
    hud?.update(t, place ? place.captionFade : 1);
    backdrops?.update(t);
    return t;
  }

  // images (artwork, sticker sheets) must be decoded before the first frame is captured
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  seek(0);
  window.reel = {
    id: reel.id,
    fps: tl.fps,
    duration: tl.duration,
    frames: tl.frames,
    timeline: tl,
    sfx: dedupe(sfx).sort((a, b) => a.t - b.t),
    warnings,
    seek,
    setLoopImage: endcard.setLoopImage ?? (() => {}),
    // default cover: the last frame of the hook beat before any prop starts to leave, when its
    // caption is fully inked
    coverTime:
      reel.cover?.at != null
        ? resolveAt(reel.cover.at, tl.beats[0], tl.beats)
        : tl.beats[0].end - EXIT_DUR - 1 / tl.fps,
    exitDur: EXIT_DUR,
  };

  if (renderMode) document.body.classList.add("render");
  else preview(reel, tl, seek);
  document.body.dataset.ready = "1";
}

/**
 * Full-frame artwork behind a reel: reel.json "backdrops": [{ beat, src, position, zoom, pan }].
 * Each image starts at its beat and stays until the next one, which cross-fades in over it.
 * Every image drifts slowly (Ken Burns); a fixed gradient keeps captions and numbers readable.
 */
function buildBackdrops(layer, list, tl) {
  const byId = Object.fromEntries(tl.beats.map((b) => [b.id, b]));
  const wrap = h("div", { style: "position:absolute;inset:0;overflow:hidden;background:#07040f" });
  const items = list.map((b) => {
    const beat = byId[b.beat];
    if (!beat) throw new Error(`backdrops: no beat "${b.beat}"`);
    const img = h("img", {
      src: `${reelDir}/${b.src}`,
      alt: "",
      style: `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${b.position ?? "50% 50%"};opacity:0;transform-origin:50% 45%`,
    });
    wrap.appendChild(img);
    return { img, t: beat.start, spec: b };
  });
  items.forEach((it, i) => (it.end = items[i + 1]?.t ?? tl.duration));
  // legibility: dark at the top (captions) and bottom (platform UI), clear in the middle
  wrap.appendChild(
    h("div", {
      style:
        "position:absolute;inset:0;background:linear-gradient(rgba(7,4,15,0.86) 0%, rgba(7,4,15,0.55) 22%, rgba(7,4,15,0.28) 42%, rgba(7,4,15,0.38) 62%, rgba(7,4,15,0.9) 100%)",
    }),
  );
  layer.appendChild(wrap);
  const FADE = 0.35;
  function update(t) {
    items.forEach((it, i) => {
      const fadeIn = i === 0 ? 1 : clamp(prog(t, it.t - FADE / 2, it.t + FADE / 2));
      // an image stays fully up under the next one until that one has finished fading in
      const gone = t > it.end + FADE;
      const op = gone ? 0 : fadeIn;
      it.img.style.opacity = op.toFixed(3);
      if (op <= 0) return;
      const [z0, z1] = it.spec.zoom ?? [1.06, 1.16];
      const [px, py] = it.spec.pan ?? [0, -40];
      const p = clamp(prog(t, it.t - FADE, it.end + FADE));
      const e = p * p * (3 - 2 * p);
      it.img.style.transform = `translate(${(px * e).toFixed(2)}px, ${(py * e).toFixed(2)}px) scale(${(z0 + (z1 - z0) * e).toFixed(4)})`;
    });
  }
  return { update };
}

/**
 * Game-style cash counter in the top-right corner. reel.json "hud": { "money": [{ beat, at,
 * value }] }: at each step the counter rolls to the new value and a "+$x" / "-$x" change
 * pops under it, green or red.
 */
function buildHud(layer, spec, tl) {
  const byId = Object.fromEntries(tl.beats.map((b) => [b.id, b]));
  const steps = (spec.money ?? []).map((s) => {
    const beat = byId[s.beat];
    if (!beat) throw new Error(`hud: no beat "${s.beat}"`);
    return { t: resolveAt(s.at ?? 0, beat), value: s.value };
  });
  steps.sort((a, b) => a.t - b.t);
  const box = h("div", {
    style:
      "position:absolute;right:72px;top:290px;text-align:right;font-family:Anton, Impact, sans-serif;opacity:0",
    html: `<div data-v style="font-size:64px;line-height:1;color:#7dffa8;letter-spacing:0.01em;-webkit-text-stroke:3px #0b0516;paint-order:stroke fill;font-variant-numeric:tabular-nums"></div>
           <div data-d style="font-size:38px;line-height:1.1;margin-top:6px;-webkit-text-stroke:2.5px #0b0516;paint-order:stroke fill;opacity:0"></div>`,
  });
  layer.appendChild(box);
  const v = box.querySelector("[data-v]");
  const d = box.querySelector("[data-d]");
  const fmt = (n) => `$${commas(Math.abs(n))}`;
  function update(t, fade = 1) {
    let val = 0;
    let prev = 0;
    let last = null;
    for (const s of steps) {
      if (t < s.t) break;
      prev = val;
      val = s.value;
      last = s;
    }
    const first = steps[0]?.t ?? Infinity;
    box.style.opacity = (clamp(prog(t, first - 0.2, first)) * fade).toFixed(3);
    let shown = val;
    if (last) {
      const p = prog(t, last.t, last.t + 0.6);
      shown = prev + (val - prev) * (1 - Math.pow(1 - p, 3));
      const delta = val - prev;
      const age = t - last.t;
      d.textContent = delta ? `${delta > 0 ? "+" : "−"}${fmt(delta)}` : "";
      d.style.color = delta >= 0 ? "#7dffa8" : "#ff5d6c";
      d.style.opacity =
        age < 1.6 ? clamp(prog(age, 0, 0.1) * (1 - prog(age, 1.2, 1.6))).toFixed(3) : "0";
      const bump = age < 0.3 ? 1 + 0.12 * Math.sin((age / 0.3) * Math.PI) : 1;
      v.style.transform = `scale(${bump.toFixed(4)})`;
      v.style.transformOrigin = "100% 50%";
    }
    const txt = fmt(shown);
    if (v._t !== txt) {
      v.textContent = txt;
      v._t = txt;
    }
  }
  const sfx = steps.map((s) => ({ t: s.t, name: "coin" }));
  return { update, sfx };
}

/** Two props leaving on the same cut should make one whoosh, not a louder one. */
function dedupe(cues) {
  const seen = new Set();
  return cues.filter((cue) => {
    const key = `${cue.name}@${cue.t.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- preview: scale to the window, play with audio, scrub, show safe zones ---------------------
function preview(reel, tl, seek) {
  const root = document.getElementById("root");
  const hud = h("div", { id: "hud" });
  const play = h("button", {}, "play");
  const range = h("input", {
    type: "range",
    min: "0",
    max: String(tl.duration),
    step: String(1 / tl.fps),
    value: "0",
  });
  const label = h("span", {}, "0.00");
  const guides = h("button", {}, "safe zones");
  hud.append(play, range, label, guides);
  document.body.appendChild(hud);

  const fit = () => {
    const s = Math.min(innerWidth / LAYOUT.W, (innerHeight - 48) / LAYOUT.H);
    root.style.transform = `translate(${(innerWidth - LAYOUT.W * s) / 2}px, 0) scale(${s})`;
  };
  addEventListener("resize", fit);
  fit();

  // Meta's published Reels safe zone (see theme.js): nothing that must be read may sit in red.
  const { SAFE } = LAYOUT;
  const guide = (css) => h("div", { class: "safe-guide", style: `${css};display:none` });
  const top = guide(`top:0;height:${SAFE.top}px`);
  const bottom = guide(`top:${SAFE.bottom}px;height:${LAYOUT.H - SAFE.bottom}px`);
  const left = guide(`top:0;height:${LAYOUT.H}px;width:${SAFE.left}px`);
  const right = guide(
    `top:0;height:${LAYOUT.H}px;left:${SAFE.right}px;width:${LAYOUT.W - SAFE.right}px`,
  );
  root.append(top, bottom, left, right);
  guides.onclick = () => {
    for (const g of [top, bottom, left, right]) {
      g.style.display = g.style.display === "none" ? "" : "none";
    }
  };

  const audio = new Audio(`${reelDir}/mix.wav`);
  let playing = false;
  let t = 0;
  let last = 0;
  const draw = () => {
    seek(t);
    range.value = String(t);
    label.textContent = `${t.toFixed(2)} / ${tl.duration.toFixed(2)}s${tl.measured ? "" : " (estimated timing)"}`;
  };
  const tick = (now) => {
    if (!playing) return;
    t = audio.readyState >= 2 && !audio.paused ? audio.currentTime : t + (now - last) / 1000;
    last = now;
    if (t >= tl.duration) {
      t = 0;
      audio.currentTime = 0;
    }
    draw();
    requestAnimationFrame(tick);
  };
  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "pause" : "play";
    if (playing) {
      audio.currentTime = t;
      audio.play().catch(() => {});
      last = performance.now();
      requestAnimationFrame(tick);
    } else audio.pause();
  };
  range.oninput = () => {
    t = parseFloat(range.value);
    audio.currentTime = t;
    draw();
  };
  draw();
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err?.message ?? err);
});
