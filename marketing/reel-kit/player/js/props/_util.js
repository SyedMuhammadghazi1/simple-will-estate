// Small helpers shared by props. A prop is a module with:
//
//   build(el, spec, ctx) -> state      create DOM inside `el` (a box centred on the prop anchor)
//   update(state, t, ctx)              draw the prop at local time `t` (seconds since it arrived)
//   sfx(spec, ctx) -> [{ t, name }]    optional sound cues at local times (same clock as update)
//
// `spec` is the prop object from reel.json. `ctx` gives:
//   ctx.dur        seconds the prop stays on the pad before it starts leaving
//   ctx.at(cue)    local time of a cue: a number, "w:3" (4th word), "w:stroller" (first word that
//                  matches), "beat:1" (start of the 2nd beat the prop spans), "end"; any of them
//                  may carry an offset, e.g. "w:stroller+0.2"
//   ctx.seed       stable integer for seeded scatter
//
// Rules: update() must be a pure function of t (no timers, no Math.random, no CSS animations);
// colours come from the theme's CSS variables so props follow the mood; use the .card/.tag/.chip
// classes for the shared sticker look.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

/** Set the body size of a prop so the wrapper can centre it on its anchor. */
export function box(el, w, hgt) {
  el.style.width = `${w}px`;
  el.style.height = `${hgt}px`;
  return el;
}

/** Only touch the DOM when the value changed — keeps frame captures fast. */
export function setText(el, text) {
  if (el._t !== text) {
    el.textContent = text;
    el._t = text;
  }
}

export function setStyle(el, prop, value) {
  const key = `_s_${prop}`;
  if (el[key] !== value) {
    el.style[prop] = value;
    el[key] = value;
  }
}

/** Escape text that is interpolated into innerHTML templates (reel.json is author-controlled,
 *  but a stray "<" in a caption should not break the layout). */
export function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
