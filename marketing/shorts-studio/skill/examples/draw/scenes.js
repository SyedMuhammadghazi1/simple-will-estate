// Draw Short r1 (27 Oct 2026). The first Short built on the reworked skill:
// - worlds (5 objects that carry across cuts), panels that GROW and SHRINK, a camera that glides (library: world(), camera())
// - shots 1.7 s+, one idea per shot, the speaker full screen on the two turns
// - less text (the high-baseline creators: text in about half the frames, 1 to 2 overlay words), the motion IS the thing
// - every sound names its cause (a key, a click, a card landing, a message arriving)
// Story: you built it but cannot explain it (a knot) -> ask your agent (the terminal) -> the skill draws it (the diagram)
//        -> it reads your project, labels each part -> share it with a teammate -> comment DRAW.
const SH = '0 1px 2px rgba(28,27,25,0.06), 0 18px 36px -12px rgba(28,27,25,0.18), 0 50px 90px -40px rgba(28,27,25,0.28)';
const RED = OR, PEN = BL, SOFT = STY.soft, TINT2 = STY.tint, GREEN = '#2F9E5B', HAND = "var(--font-accent), 'Caveat', cursive";
function ground(P, h) { el(P, box(0, 0, 1080, h, { background: GROUND }));
  el(P, box(0, 0, 1080, h, { backgroundImage: 'linear-gradient(rgba(59,91,219,0.06) 2px, transparent 2px)', backgroundSize: '100% 64px', backgroundPosition: '0 30px' })); }
function sheet(Pw, x, y, w, h, extra) { return el(Pw, box(x, y, w, h, Object.assign({ background: CARD, borderRadius: '28px', boxShadow: SH }, extra || {}))); }
function hand(Pw, x, y, w, h, text, size, color, extra) { return el(Pw, box(x, y, w, h, Object.assign({ fontFamily: HAND, fontSize: px(size), fontWeight: 700, color: color || INK,
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }, extra || {})), 'lbl', text); }
const AV = ['#D9443A', '#3B5BDB', '#2F9E5B', '#E8A317'];
function avatar(Pw, x, y, s, i) { return el(Pw, box(x, y, s, s, { borderRadius: '50%', background: AV[i % 4], border: `${Math.round(s * 0.07)}px solid #fff`, boxShadow: SH }), '',
  `<div style="position:absolute;left:${Math.round(s * 0.2)}px;top:${Math.round(s * 0.17)}px;width:${Math.round(s * 0.5)}px;height:${Math.round(s * 0.5)}px">${ICON.user('#fff')}</div>`); }
// a seeded scribble: the knot of a project you cannot explain
function knot(svg, cx, cy, rx, ry, n, seed, color) { const r = mulberry32(seed), pts = [];
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = 0.25 + r() * 0.75; pts.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d]); }
  return sketchPath(svg, pts, { color: color || INK, w: 6, jit: 40, seed }); }

// ============================================================ A (0 to 6.35): "When you build with AI, it is easy to build something that works without knowing how it works. And that's"
// split: a card that says it works (a tick draws on "works"); full: the card lifts away and the knot behind it draws itself
// ("without knowing how"); a red ring closes round the knot on "And that's".
(function () {
  const Wd = world('A'), W = Wd.W, [t0, t1] = [Wd.at(0), Wd.at(1)];
  camera(Wd, [[1.15, 540, 840], [1, 540, 700], [1.15, 540, 840], [0.9, 540, 740], [1, 540, 900]]);   // frame 0: the card fills the frame, then shrinks to the top as he looks up
  const sv = mkSvg(W, 1080, 1920);
  const kn = knot(sv, 540, 740, 420, 340, 36, 11, RED); kn.p.setAttribute('stroke-width', 9);
  const c = el(W, box(140, 330, 800, 740, { background: CARD, borderRadius: '28px' })); tag(c, 'A', true);
  const cb = mkSvg(c, 800, 740); const brd = sketchRect(cb, 14, 14, 772, 712, { color: PEN, w: 8, jit: 6, seed: 2 }); brd.p.setAttribute('stroke-dashoffset', 0); ev(0, 'card on frame 0');
  const sv2 = mkSvg(c, 800, 740); const tk = sketchPath(sv2, [[230, 360], [350, 480], [590, 230]], { color: GREEN, w: 26, jit: 6, seed: 3 });
  const ct = el(c, box(560, 60, 180, 110, { borderRadius: '55px', background: PEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }), '', `<div style="width:70px;height:70px">${ICON.code('#fff')}</div>`);
  const tAI = V(4) - LEAD; ct.style.transformOrigin = '50% 50%';
  // frame 0: the code mark sits big in the middle of the card (what you build with AI); it moves to the corner as the tick draws
  tl.fromTo(ct, { x: -250, y: 215, scale: 2.4 }, { x: -250, y: 215, scale: 2.4, duration: 0.01, immediateRender: true }, 0);
  tl.to(ct, { x: 0, y: 0, scale: 1, duration: 0.55, ease: 'power3.inOut' }, V(9) - LEAD - 0.5); ev(V(9) - LEAD - 0.5, 'code mark moves to the corner');
  bump(ct, tAI, 1.1); ring(c, 400, 330, 200, PEN, tAI, 6); ev(tAI, 'code tag pulses'); sync(4, 'the code tag pulses on "AI"', tAI); sfx(tAI, 'pop', 'code tag pulses');
  const iw = hand(c, 0, 510, 800, 170, 'it works', 160, PEN); iw.style.opacity = 0; tl.fromTo(iw, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', immediateRender: false }, V(12) - LEAD);
  const tW = V(12) - LEAD, tB_ = V(9) - LEAD; tk.p.setAttribute('stroke-dashoffset', tk.L); drawOn(tk, tB_, 0.5); ev(tB_, 'tick draws'); sfx(tB_, 'type', 'pen draws the tick len=0.45 n=3');
  ring(c, 410, 355, 230, GREEN, tW, 10); sync(12, '"it works" pops in, a green ring pulses from the tick on "works"', tW); ev(tW, 'it works'); sfx(tW, 'pop', 'words appear');
  // full: the card lifts away, the knot behind it draws
  const tL = V(13) - LEAD; tl.to(c, { y: -1100, rotation: -6, duration: 0.7, ease: 'power2.in' }, tL); untag(c, tL);
  sync(13, 'the card lifts away on "without"', tL); ev(tL, 'card lifts'); sfx(tL, 'whoosh', 'card lifts');
  drawOn(kn, tL + 0.25, 1.3); const kb = wrap(W, 120, 330, 840, 820); tagAt(kb, 'A', tL + 1.6); kb.dataset.hero = 'A'; ev(tL + 0.25, 'knot draws');
  tl.set(c, { opacity: 0 }, tL + 0.72);
  const rc = sketchCircle(sv, 540, 740, 440, { color: INK, w: 10, jit: 10, seed: 5 }); const tR = V(19) - LEAD; drawOn(rc, tR, 0.6);
  sync(19, 'a ring closes round the knot on "that\'s"', tR); ev(tR, 'ring'); sfx(tR + 0.5, 'land', 'ring closes');
  const tPb = V(22) - LEAD; tl.to(rc.p, { attr: { 'stroke-width': 18 }, duration: 0.15 }, tPb); tl.to(rc.p, { attr: { 'stroke-width': 10 }, duration: 0.4 }, tPb + 0.15); tl.to(rc.p, { attr: { stroke: RED }, duration: 0.2 }, tPb);
  ev(tPb, 'ring turns red'); sync(22, 'the ring turns red on "problem"', tPb);
})();

// ============================================================ B (6.35 to 13.0): "a big problem, but the best fix is to ask your agent to draw it. It is a free code skill called"
// Claude Code's terminal: the request types on "ask your agent", Enter on "draw it"; full: the skill loads on "skill".
(function () {
  const Wd = world('B'), W = Wd.W, [t0, t1] = [Wd.at(0), Wd.at(1)];
  camera(Wd, [[1, 540, 560], [1, 540, 760]]);
  const MONO = "Menlo, 'SF Mono', monospace";
  const term = el(W, box(60, 220, 960, 720, { borderRadius: '30px', background: '#151515', boxShadow: SH, border: `8px solid ${PEN}` })); tag(term, 'B', true);
  fadeUp(term, t0, 30);
  const wb = el(term, box(40, 36, 380, 70, { borderRadius: '22px', border: `3px solid ${RED}`, display: 'flex', alignItems: 'center', gap: '14px', padding: '0 22px' }));
  el(wb, { position: 'relative', width: '36px', height: '36px' }, '', svgClaude(36, '#D97757'));
  el(wb, { position: 'relative', fontFamily: MONO, fontSize: '30px', fontWeight: 700, color: '#F2F2F2', whiteSpace: 'nowrap' }, '', 'Claude Code');
  const code = el(term, box(40, 160, 880, 520, { fontFamily: MONO, fontSize: '52px', lineHeight: '84px', color: '#EDEDED' })); code.dataset.code = '1';
  const p1 = el(code, box(0, 0, 880, 84, { whiteSpace: 'pre' })); const REQ = 'draw this project';
  const tA = V(29) - LEAD, tD = V(33) - LEAD;
  FR.push(t => { const n = t < tA ? 0 : Math.min(REQ.length, Math.floor((t - tA) / (tD - 0.15 - tA) * REQ.length)); p1.innerHTML = `<span style="color:${RED}">&gt;</span> ${REQ.slice(0, n)}<span style="color:${RED};opacity:${t < tD + 0.3 && Math.floor(t * 3) % 2 ? 0 : 1}">&#9608;</span>`; });
  sync(29, 'the request types on "ask"', tA); ev(tA, 'typing request'); sfx(tA, 'type', `request len=${(tD - 0.15 - tA).toFixed(2)} n=10`);
  sync(33, 'Enter on "draw"', tD); ev(tD, 'enter'); sfx(tD, 'cclick', 'enter key');
  // full: the skill loads and starts reading (real tool-call lines, as Claude Code prints them)
  const l2 = el(code, box(0, 130, 880, 84, { whiteSpace: 'pre', opacity: 0 }), '', `<span style="color:#4EBA65">&#9679;</span> Skill(annotated-<br>  illustrations)`);
  const l3 = el(code, box(0, 320, 880, 84, { whiteSpace: 'pre', opacity: 0, color: '#9A9A9A' }), '', `  &#9151; drawing your project...`);
  const tS = V(40) - LEAD; fadeUp(l2, tS, 20); fadeUp(l3, tS + 0.5, 20);
  sync(40, 'the skill loads on "skill"', tS); ev(tS, 'skill line'); sfx(tS, 'pop', 'skill line appears');
})();

// ============================================================ C (15.32 to 26.55): the diagram. split: it draws itself ("turns whatever you just built into a hand-drawn
// illustration"); full: the camera flies up to the project folder, which it reads file by file ("reads the whole thing"); split: back on
// the diagram, each part gets its note ("what each part does") and dots run along the arrows ("how they work").
(function () {
  const Wd = world('C'), W = Wd.W, t0 = Wd.at(0);
  const sh = sheet(W, 70, 160, 940, 1000); tag(sh, 'C', true); sh.dataset.code = '1'; enter(sh, t0);   // the drawing is the skill's output (its words are content, like real UI)
  const sv = mkSvg(sh, 940, 1000);
  const N = { app: [470, 170], login: [220, 470], db: [720, 470], pay: [470, 790] }, BW = 360, BH = 160;
  const LAB = { app: 'App', login: 'Login', db: 'Database', pay: 'Payments' };
  const ICO = { app: ICON.play, login: ICON.user, db: ICON.chart, pay: ICON.tag };
  const order = ['app', 'login', 'db', 'pay'], tStart = V(46) - LEAD, step = (V(54) - LEAD - tStart) / 5;
  const boxes = {};
  order.forEach((k, i) => { const [cx, cy] = N[k]; const r = sketchRect(sv, cx - BW / 2, cy - BH / 2, BW, BH, { color: i % 2 ? RED : PEN, w: 7, jit: 5, seed: 20 + i });
    const fill = el(sh, box(cx - BW / 2 + 6, cy - BH / 2 + 6, BW - 12, BH - 12, { borderRadius: '14px', background: i % 2 ? SOFT : TINT2, opacity: 0 })); tl.to(fill, { opacity: 1, duration: 0.25 }, tStart + i * step + 0.3);
    const lab = hand(sh, cx - BW / 2 + 40, cy - 34, BW - 60, 70, LAB[k], 56, INK); const ic = el(sh, box(cx - BW / 2 + 18, cy - BH / 2 + 18, 40, 40), '', ICON[k === 'app' ? 'play' : k === 'login' ? 'user' : k === 'db' ? 'chart' : 'tag'](PEN));
    const at = tStart + i * step; drawOn(r, at, 0.5); [lab, ic].forEach(e => { e.style.opacity = 0; tl.to(e, { opacity: 1, duration: 0.25 }, at + 0.35); });
    boxes[k] = { r, lab, at }; ev(at, 'box draws: ' + LAB[k]); });
  sfx(tStart, 'type', 'pen drawing the boxes len=' + (step * 4).toFixed(2) + ' n=8');
  const arrows = [[N.app, N.login, 40], [N.app, N.db, -40], [N.login, N.pay, -40], [N.db, N.pay, 40]].map(([a, b, bend], i) => {
    const A = [a[0] + (b[0] - a[0]) * 0.32, a[1] + (b[1] - a[1]) * 0.42], B = [a[0] + (b[0] - a[0]) * 0.7, a[1] + (b[1] - a[1]) * 0.62];
    const ar = sketchArrow(sv, A, B, { color: PEN, w: 6, jit: 3, bend, seed: 40 + i }); const at = tStart + 4 * step + i * 0.12; ar.forEach(s => drawOn(s, at, 0.4)); return { A, B, at }; });
  sync(46, 'the diagram starts drawing itself on "turns"', tStart); sync(54, 'the last arrows land on "illustration"', V(54) - LEAD);
  // the project folder above the diagram (full window): the camera flies up to it, it is read file by file
  const fo = sheet(W, 110, -820, 860, 560, { borderRadius: '30px', border: `6px solid ${PEN}` }); const fsv = mkSvg(fo, 700, 560);
  el(fo, box(40, 34, 70, 56), '', `<svg viewBox="0 0 32 26" width="70" height="56"><path d="M2 5a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="${PEN}"/></svg>`);
  const FILES = ['app/page.tsx', 'auth/login.ts', 'db/schema.sql', 'pay/checkout.ts'];
  const rows = FILES.map((f, i) => { const r = el(fo, box(60, 130 + i * 100, 680, 80, { borderRadius: '18px', background: '#F3F1EC', fontFamily: "Menlo, monospace", fontSize: '34px', color: INK, display: 'flex', alignItems: 'center', paddingLeft: '28px' }));
    r.dataset.code = '1'; r.textContent = f; return r; });
  const tR = V(63) - LEAD; const scan = el(fo, box(48, 120, 704, 100, { borderRadius: '20px', border: `5px solid ${RED}`, opacity: 0 }));
  tl.set(scan, { opacity: 1 }, tR); tl.fromTo(scan, { y: 0 }, { y: 300, duration: 1.0, ease: 'none', immediateRender: false }, tR); tl.to(scan, { opacity: 0, duration: 0.2 }, tR + 1.05);
  rows.forEach((r, i) => { const k = mkTick(fo, 770, 170 + i * 100, 26, GREEN); tickAt(k, tR + 0.25 + i * 0.25); });
  sync(63, 'the folder is read file by file on "reads"', tR); ev(tR, 'reading files'); sfx(tR + 0.25, 'type', 'files ticking len=1.0 n=4');
  // split again: notes for each part, then dots run along the arrows
  const NOTE = { login: ['signs in', [60, 600]], db: ['stores it', [590, 600]], pay: ['takes cards', [330, 905]] };
  const tN = V(73) - LEAD;
  Object.entries(NOTE).forEach(([k, [txt, [x, y]]], i) => { const n = hand(sh, x, y, 300, 70, txt, 52, RED); n.style.opacity = 0; const at = tN + i * 0.45;
    tl.fromTo(n, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, at); ev(at, 'note: ' + txt); });
  sync(73, 'each part gets its note on "what"', tN); sfx(tN, 'pop', 'first note');
  const tH = V(78) - LEAD;
  arrows.forEach((a, i) => { const d = el(sh, box(0, 0, 26, 26, { borderRadius: '13px', background: RED, opacity: 0 }));
    FR.push(t => { const u = (t - tH - i * 0.1) / 0.7; if (u < 0 || u > 1.6) { d.style.opacity = 0; return; } const v = (u % 1); d.style.opacity = 1;
      d.style.transform = `translate(${lerp(a.A[0], a.B[0], v) - 13}px, ${lerp(a.A[1], a.B[1], v) - 13}px)`; }); });
  sync(78, 'dots run along the arrows on "how"', tH); ev(tH, 'dots run');
  // camera: split shows the whole sheet; full flies up to the folder, then back; split moves top half -> bottom half
  const [c1, c2, c3, c4] = [1, 2, 3, 4].map(Wd.at);
  camera(Wd, [[0.76, 540, 660], [1, 540, -490], [0.92, 540, -540], [1, 540, 970], [0.76, 540, 660]], [[tH - 0.1, 1.05, 540, 860, 0.7]]);
  untag(sh, c1); tl.set(sh, { attr: { 'data-ov': 'C' } }, c3 + 0.5); untag(sh, tH - 0.1); tagAt(fo, 'C', c1 + 0.5); untag(fo, c3); fo.dataset.hero = 'C';
})();

// ============================================================ D (28.47 to 34.57): "it is the easiest way to explain to a teammate how anything works, even a non-technical one."
// A team chat: your message with the diagram lands on "explain"; the teammate reacts (a tick) on "works"; full: a second teammate
// (non-technical) joins and reacts on "non-technical".
(function () {
  const Wd = world('D'), W = Wd.W, [t0, t1] = [Wd.at(0), Wd.at(1)];
  camera(Wd, [[1, 540, 990], [1, 540, 560], [1, 540, 990]], [[V(104) - LEAD - 0.1, 1, 540, 1500, 0.7], [V(108) - LEAD + 0.1, 1, 540, 1790, 0.7]]);
  const ch = sheet(W, 60, 180, 960, 760, { border: `6px solid ${PEN}` }); tag(ch, 'D', true); enter(ch, t0); untag(ch, V(104) - LEAD - 0.1);
  const msg = el(ch, box(260, 60, 640, 480, { borderRadius: '36px 36px 12px 36px', background: TINT2, border: `6px solid ${RED}` })); avatar(ch, 820, 470, 110, 1);
  const thumb = el(msg, box(30, 30, 580, 420, { borderRadius: '22px', background: '#fff', overflow: 'hidden' })); const ts = mkSvg(thumb, 580, 420);
  [[290, 70], [130, 210], [450, 210], [290, 350]].forEach(([x, y], i) => { const r = sketchRect(ts, x - 90, y - 45, 180, 90, { color: INK, w: 4, jit: 3, seed: 60 + i }); r.p.setAttribute('stroke-dashoffset', 0); });
  [[[290, 115], [150, 165]], [[290, 115], [430, 165]], [[150, 255], [270, 305]], [[430, 255], [310, 305]]].forEach(([a, b], i) => sketchArrow(ts, a, b, { color: PEN, w: 4, seed: 70 + i }).forEach(s => s.p.setAttribute('stroke-dashoffset', 0)));
  const tE = V(93) - LEAD; msg.style.opacity = 0; land(msg, t0 + 0.1, 60, 0.5); sfx(t0 + 0.1, 'notify', 'message sent'); ev(t0 + 0.1, 'message lands');
  ts.querySelectorAll('path').forEach((pp, k) => { const L = pp.getTotalLength(); pp.setAttribute('stroke-dasharray', `${L} ${L}`); pp.setAttribute('stroke-dashoffset', L); tl.to(pp, { attr: { 'stroke-dashoffset': 0 }, duration: 0.5, ease: 'power1.inOut' }, tE + k * 0.06); });
  sync(93, 'the diagram draws itself in your message on "explain"', tE); ev(tE, 'diagram draws in the message'); sfx(tE, 'type', 'pen draws the diagram len=0.8 n=6');
  const tm = el(ch, box(40, 600, 600, 150)); avatar(tm, 0, 20, 110, 2); const bub = el(tm, box(140, 10, 200, 130, { borderRadius: '36px 36px 36px 12px', background: '#F3F1EC' }));
  const k1 = mkTick(bub, 100, 65, 40, GREEN); tm.style.opacity = 0; const tT = V(99) - LEAD, tMate = V(96) - LEAD; fadeUp(tm, tMate, 30); ev(tMate, 'teammate lands'); sync(96, 'the teammate lands on "teammate"', tMate); sfx(tMate, 'pop', 'teammate lands'); tickAt(k1, tT);
  sync(99, 'the teammate ticks it on "works"', tT); ev(tT, 'teammate tick'); sfx(tT, 'done', 'tick');
  const tm2 = el(W, box(60, 980, 600, 150)); FR.push(t => { tm2.style.visibility = t >= Wd.at(2) ? 'inherit' : 'hidden'; }); avatar(tm2, 0, 20, 110, 3); const bub2 = el(tm2, box(140, 10, 200, 130, { borderRadius: '36px 36px 36px 12px', background: '#fff', boxShadow: SH }));
  const k2 = mkTick(bub2, 100, 65, 40, GREEN); tm2.style.opacity = 0; const tN = V(102) - LEAD; fadeUp(tm2, Math.max(Wd.at(2) + 0.2, tN - 0.3), 30); tickAt(k2, tN);
  sync(102, 'a second, non-technical teammate ticks it too', tN); ev(tN, 'second tick'); sfx(tN, 'done', 'second tick');
  {   // own block: the CTA's names stay local
  // ---- the CTA, in the same chat (no new world): the message box rises on "Comment", DRAW types, send, the DM lands in the thread
  const tDM = V(108) - LEAD + 0.35;
  const bar = wrap(W, 60, 1330, 960, 250); tag(bar, 'D'); untag(bar, 0); tagAt(bar, 'D', V(104) - LEAD + 0.7);
  const bb = el(bar, box(0, 0, 960, 250, { borderRadius: '125px', background: CARD, boxShadow: SH, border: `6px solid ${PEN}` }));
  avatar(bb, 34, 38, 162, 1);
  const tx = el(bb, box(236, 25, 500, 200, { display: 'flex', alignItems: 'center', fontSize: '150px', fontWeight: 800, color: INK, letterSpacing: '-0.04em' }), 'lbl', ''); tx.dataset.typed = '1';
  const send = el(bb, box(774, 45, 160, 160, { borderRadius: '80px', background: RED }), '', `<div style="position:absolute;left:38px;top:38px;width:84px;height:84px">${ICON.send('#fff')}</div>`);
  bar.style.opacity = 0; fadeUp(bar, V(104) - LEAD, 60); ev(V(104) - LEAD, 'message box rises'); const tT = V(105) - LEAD; typer(tx, 'DRAW', tT, tT + 0.32);
  sync(105, '"DRAW" types on "draw"', tT); ev(tT, 'typing DRAW'); sfx(tT, 'type', 'DRAW len=0.32 n=4');
  const tS = V(108) - LEAD; press(send, tS); ring(bb, 854, 125, 90, RED, tS + 0.06, 6); sync(108, 'send is pressed on "send"', tS); ev(tS, 'send'); sfx(tS, 'cclick', 'send button');
  const dm = wrap(W, 60, 1640, 960, 420); dm.style.opacity = 0;
  const d = el(dm, box(0, 0, 960, 420, { borderRadius: '48px 48px 48px 14px', background: PEN, boxShadow: SH }));
  const th = el(d, box(40, 40, 400, 340, { borderRadius: '26px', background: '#fff' })); const ts = mkSvg(th, 400, 340);
  [[200, 60], [90, 170], [310, 170], [200, 280]].forEach(([x, y], i) => { const r = sketchRect(ts, x - 70, y - 35, 140, 70, { color: INK, w: 4, jit: 3, seed: 80 + i }); r.p.setAttribute('stroke-dashoffset', 0); });
  hand(d, 470, 120, 450, 180, 'the skill &#8599;', 92, '#fff');
  land(dm, tDM, 140, 0.5); tagAt(dm, 'D', tDM + 0.55); ev(tDM, 'DM lands'); sfx(tDM, 'notify', 'DM arrives');
  bump(dm, V(111) - LEAD, 1.02); sync(111, 'the DM bumps on "skill"', V(111) - LEAD);
  }
})();

