// jack-youtube Short library, part 2 of 3: real footage windows (data from edit.json "footage"; enter "rise" or the default blur-in).
// ============================================================ footage windows (real Claude Motion launch footage)
const FOOT = D.foot || [];
FOOT.forEach(f => { const e = document.getElementById(f.id); if (!e) return; e.style.zIndex = 5; tag(e, f.sc, !!f.hero); e.dataset.in = '0,0,1080,1920';
  if (f.cls) e.classList.add(f.cls); e.style.visibility = 'visible'; e.style.opacity = 0;
  if (f.enter === 'rise') tl.fromTo(e, { opacity: 0.55, y: 24 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', immediateRender: false }, f.a);   // rises with its player card
  else tl.fromTo(e, { opacity: 0.55, scale: 0.97, filter: 'blur(6px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.34, ease: 'expo.out', immediateRender: false }, f.a);
  tl.set(e, { opacity: 0 }, f.b); ev(f.a, 'footage ' + f.id); });
function overlay(id, wins, z) { const o = el(root, box(0, 0, 1080, 1920, { zIndex: z || 6 })); o.id = id; showWindows(o, wins); o.dataset.panel = '0,0,1080,1920'; return o; }


// ============================================================ worlds, camera, transitions (26 Oct 2026 rework)
// The creator, on test-11: "a sharp, weird, odd thing ... where the frame just changes straight away", "a zoom ... you can barely
// see", "we whip through things way too quickly", "the animations ... don't really link in with each other".
// So: a WORLD is one object that lives across several layout windows. Its panel GROWS from the split top to the full frame over
// 0.45 s ending on the switch (his picture is covered while it is still continuous), and SHRINKS back over 0.45 s from the switch
// (revealing him after the cut). Entering from his full shot, a world slides in over 0.45 s ending on the switch; leaving to his
// full shot, it slides away over 0.45 s from the switch. The camera glides (never under 0.6 s inside a window). No hard snaps.
const TR = 0.45, TR_SHRINK = 0.3, TW = 0.34, PUNCH = 0.05, CAM_MIN = 0.6, E3 = ease('power3.inOut');   // shrink is quicker: the graphic clears his face fast
// 28 Oct (creator, on the Draw Short: "the transition is getting very repetitive where it keeps scrolling up and scrolling down ...
// vary up the transitions to make it look crisper"). Each split <-> full switch inside a world now picks ONE of a small kit:
//   cut    hard cut on the switch, then the camera settles from a 5 % punch-in over 0.5 s (crisp; high-baseline creators cut, BL05)
//   wipe   the full frame wipes in sideways over the speaker (0.34 s, ending on the switch), or wipes off him after it
//   wipeR  the same from the right
//   grow   the panel grows up / down (the old move; the accent, not the rule)
// Order: edit.json "transitions": ["grow", "cut", "wipe", ...], one per split <-> full switch in time order, else the rotation TKIT. Never the same move twice in a
// row except cut; the sound follows the move (sound.py: grow -> whoosh, wipe -> swoosh, cut -> nothing).
const TKIT = ['cut', 'wipe', 'cut', 'grow', 'cut', 'wipeR'];
const TSW = []; LAY.forEach((x, i) => { if (i && LAY[i - 1][3] === x[3] && (LAY[i - 1][2] === 'split') !== (x[2] === 'split')) TSW.push(x[0]); });
function transAt(a) { const o = D.trans || {}, k = TSW.findIndex(s => Math.abs(s - a) < 0.01);
  return (Array.isArray(o) ? o[k] : o[a.toFixed(2)]) || (k === 0 && a < 1 ? 'grow' : TKIT[k % TKIT.length]); }
function world(id) {
  const wins = LAY.filter(x => x[3] === id).map(x => [x[0], x[1], x[2]]);
  const ph = ty => ty === 'split' ? 960 : 1920, A = wins[0][0], B = wins[wins.length - 1][1];
  const iPrev = LAY.findIndex(x => x[3] === id) - 1, prev = iPrev >= 0 ? LAY[iPrev] : null;
  const next = LAY[iPrev + 1 + wins.length] || null;
  // 27 Oct (creator: "a bit of a weird transition at 15 seconds"): a world sliding over his full shot, then his crop changing, is two
  // changes in a row. Around his full shot the switch is a clean cut; the world's first object lands after it. Slides only if asked.
  const enterSlide = false && prev && prev[3] !== id && A > 0.01, exitSlide = false && next && next[2] === 'jack';
  const vis = [[enterSlide ? A - TR : A, exitSlide ? Math.min(T, B + TR) : B]];
  const P = scene(id, vis, ph(wins[0][2])); const S = P.parentElement; S.style.zIndex = 3;
  // one segment per split <-> full switch: [t0, t1, h0, h1, kind]; h is the CAMERA height (where the world is centred)
  const segs = [], punches = [];
  wins.forEach(([a, b, ty], i) => { if (!i) return; const h0 = ph(wins[i - 1][2]), h1 = ph(ty); if (h0 === h1) return;
    const kind = transAt(a), up = h1 > h0; ev(a, 'trans:' + kind + (up ? ' to full' : ' to split'));
    if (kind === 'cut') { segs.push([a, a, h0, h1, kind]); punches.push(a); }
    else if (kind === 'grow') segs.push(up ? [a - TR, a, h0, h1, kind] : [a, a + TR_SHRINK, h0, h1, kind]);
    else segs.push(up ? [a - TW, a, h0, h1, kind] : [a, a + TW, h0, h1, kind]); });
  const segAt = t => segs.find(([t0, t1]) => t > t0 && t < t1);
  const H = t => { let h = ph(wins[0][2]); for (const [t0, t1, h0, h1] of segs) { if (t >= t1) h = h1; else if (t > t0) { h = lerp(h0, h1, E3((t - t0) / (t1 - t0))); break; } else break; } return h; };
  const moving = t => segs.some(([t0, t1]) => t > t0 - 0.05 && t < t1 + 0.05) || punches.some(p => t > p - 0.05 && t < p + 0.5);
  FR.push(t => { const h = H(t), sg = segAt(t);
    if (sg && sg[4] !== 'grow') {   // a wipe: the panel is full height, the bottom half is revealed (or cleared) sideways
      const [t0, t1, h0, h1, kind] = sg, u = E3((t - t0) / (t1 - t0)), w = 1080 * (h1 > h0 ? u : 1 - u), L = kind === 'wipe';
      P.style.height = px(1920);
      P.style.clipPath = L ? `polygon(0 0,1080px 0,1080px 960px,${w.toFixed(1)}px 960px,${w.toFixed(1)}px 1920px,0 1920px)`
                           : `polygon(0 0,1080px 0,1080px 1920px,${(1080 - w).toFixed(1)}px 1920px,${(1080 - w).toFixed(1)}px 960px,0 960px)`;
    } else { P.style.height = px(h); P.style.clipPath = ''; }
    P.dataset.panel = `0,0,1080,${Math.round(h)}`; S.dataset.moving = moving(t) ? '1' : '0'; });
  // slide in / out at the world's edges
  FR.push(t => { let y = 0; const dir = ph(wins[0][2]) === 960 ? -1 : 1;
    if (enterSlide && t < A) y = dir * (1 - E3(clamp((t - (A - TR)) / TR, 0, 1))) * 1920;
    if (exitSlide && t > B) y = -E3(clamp((t - B) / TR, 0, 1)) * 1920;
    S.style.transform = y ? `translateY(${y.toFixed(1)}px)` : ''; });
  ground(P, 1920);
  const W = el(P, box(0, 0, 1080, 1920, { transformOrigin: '0 0' }));
  return { P, S, W, wins, A, B, H, segs, punches, at: k => wins[k][0], end: k => wins[k][1] };
}
// frames: one framing per window [k, cx, cy] (world point at the panel centre); moves: extra glides inside a window [t, k, cx, cy, d>=0.6]
function camera(Wd, frames, moves) {
  const keys = [];   // {t, d, k, cx, cy}
  Wd.wins.forEach(([a, b, ty], i) => { const f = frames[i] || frames[frames.length - 1];
    if (!i) { keys.push({ t: -1, d: 0.001, k: f[0], cx: f[1], cy: f[2] }); return; }
    const sg = Wd.segs.find(s => Math.abs(s[0] - a) < 0.001 || Math.abs(s[1] - a) < 0.001);   // the switch at a starts or ends its segment
    if (!sg) { keys.push({ t: a, d: CAM_MIN, k: f[0], cx: f[1], cy: f[2] }); return; }
    if (sg[4] === 'cut') keys.push({ t: a, d: 0.001, k: f[0], cx: f[1], cy: f[2] });   // the cut reframes at once; the punch settles it
    else keys.push({ t: sg[0], d: sg[1] - sg[0], k: f[0], cx: f[1], cy: f[2] }); });
  (moves || []).forEach(m => keys.push({ t: m[0], d: Math.max(CAM_MIN, m[4] || CAM_MIN), k: m[1], cx: m[2], cy: m[3] }));
  keys.sort((p, q) => p.t - q.t);
  const pose = t => { let c = keys[0]; for (let i = 1; i < keys.length; i++) { const s = keys[i]; if (t < s.t) break;
      const u = E3(clamp((t - s.t) / s.d, 0, 1)); c = { k: lerp(c.k, s.k, u), cx: lerp(c.cx, s.cx, u), cy: lerp(c.cy, s.cy, u) }; } return c; };
  const punch = t => { let m = 1; for (const p of Wd.punches) if (t >= p && t < p + 0.5) m = 1 + PUNCH * (1 - ease('power2.out')((t - p) / 0.5)); return m; };
  FR.push(t => { const c = pose(t), h = Wd.H(t), k = c.k * punch(t);
    Wd.W.style.transform = `translate(${(540 - c.cx * k).toFixed(2)}px, ${(h / 2 - c.cy * k).toFixed(2)}px) scale(${k.toFixed(4)})`; });
}
// sound with a cause: every effect names the visible action (click, type, land, slide, draw, pop, tick, press, ping) and its element
function sfx(t, role, cause) { ev(t, 'sfx:' + role + ' ' + (cause || '')); }
// calm entrances: the opacity comes up in 0.12 s (never a grey half-faded frame), the move eases on its own
function land(e, t, dy, d) { tl.fromTo(e, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none', immediateRender: true }, t);
  tl.fromTo(e, { y: -(dy || 100) }, { y: 0, duration: d || 0.55, ease: 'back.out(1.2)', immediateRender: true }, t); }
function fadeUp(e, t, dy) { tl.fromTo(e, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none', immediateRender: true }, t);
  tl.fromTo(e, { y: dy || 40 }, { y: 0, duration: 0.5, ease: 'expo.out', immediateRender: true }, t); }
// hand-drawn strokes (seeded wobble), drawn on by the clock: a path that "draws itself" like a pen
function sketchPath(svg, pts, o) { o = o || {}; const r = mulberry32(o.seed || 7), j = o.jit == null ? 3 : o.jit;
  let d = `M ${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2 + (r() - 0.5) * j * 2, my = (y0 + y1) / 2 + (r() - 0.5) * j * 2; d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1 + (r() - 0.5) * j} ${y1 + (r() - 0.5) * j}`; }
  const p = mk('path', { d, fill: 'none', stroke: o.color || INK, 'stroke-width': o.w || 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  const L = p.getTotalLength(); p.setAttribute('stroke-dasharray', `${L} ${L}`); p.setAttribute('stroke-dashoffset', L); return { p, L }; }
function drawOn(sp, t, d) { tl.to(sp.p, { attr: { 'stroke-dashoffset': 0 }, duration: d || 0.6, ease: 'power1.inOut' }, t); }
function sketchRect(svg, x, y, w, h, o) { return sketchPath(svg, [[x, y], [x + w, y + 1], [x + w - 1, y + h], [x + 1, y + h - 1], [x, y + 2]], o); }
function sketchCircle(svg, cx, cy, rr, o) { const pts = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2.08; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return sketchPath(svg, pts, o); }
function sketchArrow(svg, a, b, o) { o = o || {}; const mid = [(a[0] + b[0]) / 2 + (o.bend || 0), (a[1] + b[1]) / 2 - (o.bend || 0) * 0.5];
  const s1 = sketchPath(svg, [a, mid, b], o); const ang = Math.atan2(b[1] - mid[1], b[0] - mid[0]), L = 22;
  const s2 = sketchPath(svg, [[b[0] - L * Math.cos(ang - 0.5), b[1] - L * Math.sin(ang - 0.5)], b, [b[0] - L * Math.cos(ang + 0.5), b[1] - L * Math.sin(ang + 0.5)]], Object.assign({}, o, { jit: 1 }));
  return [s1, s2]; }
// default ground (a scene file may define its own; the later declaration wins)
function ground(P, h) { el(P, box(0, 0, 1080, h, { background: GROUND })); }
// enter: a world's first object settles in (rises 30 px in a split top, drops 30 px in a full frame), opacity up in 0.12 s
function enter(e, t) { const pn = e.closest('[data-panel]'), full = pn && +pn.dataset.panel.split(',')[3] > 1000;
  tl.fromTo(e, { opacity: 0.35 }, { opacity: 1, duration: 0.12, ease: 'none', immediateRender: true }, t);
  tl.fromTo(e, { y: full ? -30 : 30, scale: 0.97 }, { y: 0, scale: 1, duration: 0.5, ease: 'expo.out', immediateRender: true }, t); }
