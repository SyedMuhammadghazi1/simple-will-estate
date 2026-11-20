// shorts-studio Short library (ported from the jack-youtube system), part 1 of 3 (from tyler-short r8 scene8.js lines 1-285).
// Setup, the master clock (pure functions of time), layout windows, spacing tags, grounds, real logos, the pixel mascot,
// motion helpers (pop, bump, press, tick) and the 21st.dev ports. gen.py writes: lib/head.js + lib/foot.js + scene files + lib/tail.js.
(function () {
// ============================================================ setup
// Round 6: copies the look of Jack's top Shorts (JS1 to JS5): soft white vignette, big real app tiles, node diagram that builds,
// dark code card, full-bleed colour blocks (orange #FF8000, blue #2B7EF9), pixel mascots ringing the hero, real footage big.
// UI pieces are ports of 21st.dev components (Magic UI by dillionverma, Compare by manuarora700), rewritten as pure functions of time.
const D = window.__D, T = D.T, MODE = D.mode, W = D.words;
const V = i => W[i].s, VE = i => W[i].e, LEAD = 0.06;
// colours come from the user's style (edit.json "style"); OR = accent 1, BL = accent 2 (names kept from the original library)
const STY = D.style || {};
const OR = STY.accent || '#E5484D', BL = STY.accent2 || '#111111', INK = STY.ink || '#111111', CLAY = STY.accent || '#E5484D',
      CREAM = STY.soft || '#FFF1EC', YEL = STY.highlight || '#FFC23D', GRN = STY.good || '#22B573', BLT = STY.tint || '#F2F2F0',
      GROUND = STY.ground || '#FAFAF8', CARD = STY.card || '#FFFFFF';
const root = document.getElementById('root');
const tl = gsap.timeline({ paused: true });
window.__timelines = window.__timelines || {};
window.__timelines['main'] = tl;
const SYNC = [], EV = [];
window.__SYNC = SYNC; window.__EV = EV;
function sync(i, what, t) { SYNC.push({ i: i, word: W[i].w, word_t: V(i), event: what, event_t: Math.round(t * 1000) / 1000 }); }
function ev(t, what) { EV.push([Math.round(t * 1000) / 1000, what]); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const GRAIN = (function () { const c = document.createElement('canvas'); c.width = 360; c.height = 360; const x = c.getContext('2d'), r = mulberry32(8);
  const im = x.createImageData(360, 360); for (let i = 0; i < im.data.length; i += 4) { const v = 90 + r() * 165 | 0;
  im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); return c.toDataURL(); })();
function el(parent, css, cls, html) { const e = document.createElement('div'); if (cls) e.className = cls;
  e.style.position = 'absolute'; Object.assign(e.style, css || {}); if (html != null) e.innerHTML = html; parent.appendChild(e); return e; }
const px = v => v + 'px';
function box(x, y, w, h, extra) { return Object.assign({ left: px(x), top: px(y), width: px(w), height: px(h) }, extra || {}); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = n => gsap.parseEase(n);
const EO = ease('expo.out'), P3O = ease('power3.out'), P2IO = ease('power2.inOut'), EIO = ease('expo.inOut'), BO = ease('back.out(1.6)');
const pr = (t, t0, d) => clamp((t - t0) / d, 0, 1);
const svgNS = 'http://www.w3.org/2000/svg';
function mk(tag, attrs, parent) { const e = document.createElementNS(svgNS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
function mkSvg(parent, w, h, css) { const s = mk('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` }); Object.assign(s.style, { position: 'absolute', left: '0px', top: '0px', overflow: 'visible' }, css || {}); parent.appendChild(s); return s; }

// ============================================================ master clock: pure functions of time
const FR = [];
function frame(t) { FR.forEach(f => f(t)); }

// ============================================================ layout windows
const LAY = D.layout;
function windowsOf(pred) { const w = []; LAY.forEach(([a, b, ty, sc]) => { if (pred(ty, sc)) { if (w.length && Math.abs(w[w.length - 1][1] - a) < 1e-6) w[w.length - 1][1] = b; else w.push([a, b]); } }); return w; }
function showWindows(e, wins) {
  const vis0 = wins.some(([a, b]) => a <= 0 && 0 < b);
  e.style.visibility = vis0 ? 'visible' : 'hidden';
  const pts = []; wins.forEach(([a, b]) => { if (a > 0) pts.push([a, 'visible']); if (b < T - 1e-6) pts.push([b, 'hidden']); });
  pts.sort((p, q) => p[0] - q[0]); pts.forEach(([t, v]) => tl.set(e, { visibility: v }, t));
}
function showOpacity(e, wins) { // video wrappers: the renderer composites video frames by opacity, not visibility
  e.style.visibility = 'visible'; const vis0 = wins.some(([a, b]) => a <= 0 && 0 < b); e.style.opacity = vis0 ? 1 : 0;
  const pts = []; wins.forEach(([a, b]) => { if (a > 0) pts.push([a, 1]); if (b < T - 1e-6) pts.push([b, 0]); });
  pts.sort((p, q) => p[0] - q[0]); pts.forEach(([t, v]) => tl.set(e, { opacity: v }, t));
}
function win(sc) { const w = LAY.filter(x => x[3] === sc); return [w[0][0], w[w.length - 1][1]]; }
function scene(id, wins, panelH) { const s = el(root, { zIndex: 1 }, 'sc'); s.id = id; showWindows(s, wins);
  const p = el(s, box(0, 0, 1080, panelH || 1920, { overflow: 'hidden' }), 'panel'); p.dataset.panel = `0,0,1080,${panelH || 1920}`; return p; }
LAY.forEach(([a, b, ty, sc], i) => { if (i === 0 || LAY[i - 1][2] !== ty || LAY[i - 1][3] !== sc) ev(a, 'layout -> ' + ty + (sc ? ' (' + sc + ')' : '')); });
// spacing-check tags: data-ov = the block's scene; 'off' once it starts to leave; data-hero = the scene's hero (width check)
function tag(e, sc, hero) { e.dataset.ov = sc; if (hero) e.dataset.hero = sc; return e; }
function untag(e, t) { tl.set(e, { attr: { 'data-ov': 'off' } }, t); }
function tagAt(e, sc, t) { e.dataset.ov = 'off'; tl.set(e, { attr: { 'data-ov': sc } }, t); return e; }   // measured only once it has landed

// ============================================================ grounds (copied from Jack's reels: soft white vignette, or a full-bleed colour block)
function vignette(p, h, cy) {
  return el(p, box(0, 0, 1080, h, { background: `radial-gradient(ellipse 860px ${Math.round(h * 0.6)}px at 50% ${cy || 44}%, #FFFFFF 0%, #FDFDFD 34%, #F1F1F3 70%, #E2E2E6 100%)` }));
}
function block(p, h, color, edge) {
  const b = el(p, box(0, 0, 1080, h, { background: color }));
  el(b, box(0, 0, 1080, h, { background: `radial-gradient(ellipse 900px ${Math.round(h * 0.62)}px at 50% 42%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 45%, ${edge} 100%)` }));
  return b;
}

// ============================================================ real logos (Simple Icons paths: Claude #D97757, Adobe After Effects + Premiere Pro app icons)
const P_CLAUDE = 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';
const P_AE = 'M8.54 10.73c-.1-.31-.19-.61-.29-.92s-.19-.6-.27-.89c-.08-.28-.15-.54-.22-.78h-.02c-.09.43-.2.86-.34 1.29-.15.48-.3.98-.46 1.48-.13.51-.29.98-.44 1.4h2.54c-.06-.21-.14-.46-.23-.72-.09-.27-.18-.56-.27-.86zm8.58-.29c-.55-.03-1.07.26-1.33.76-.12.23-.19.47-.22.72h2.109c.26 0 .45 0 .57-.01.08-.01.16-.03.23-.08v-.1c0-.13-.021-.25-.061-.37-.178-.56-.708-.94-1.298-.92zM19.75.3H4.25C1.9.3 0 2.2 0 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm-7.04 16.511h-2.09c-.07.01-.14-.041-.16-.11l-.82-2.4H5.92l-.76 2.36c-.02.09-.1.15-.19.14H3.09c-.11 0-.14-.06-.11-.18L6.2 7.39c.03-.1.06-.19.1-.31.04-.21.06-.43.06-.65-.01-.05.03-.1.08-.11h2.59c.07 0 .12.03.13.08l3.65 10.25c.03.11.001.161-.1.161zm7.851-3.991c-.021.189-.031.33-.041.42-.01.07-.069.13-.14.13-.06 0-.17.01-.33.021-.159.02-.35.029-.579.029-.23 0-.471-.04-.73-.04h-3.17c.039.31.14.62.31.89.181.271.431.48.729.601.4.17.841.26 1.281.25.35-.011.699-.04 1.039-.11.311-.039.61-.119.891-.23.05-.039.08-.02.08.08v1.531c0 .039-.01.08-.021.119-.021.03-.04.051-.069.07-.32.14-.65.24-1 .3-.471.09-.94.13-1.42.12-.761 0-1.4-.12-1.92-.35-.49-.211-.921-.541-1.261-.95-.319-.39-.55-.83-.69-1.31-.14-.471-.209-.961-.209-1.461 0-.539.08-1.07.25-1.59.16-.5.41-.96.75-1.37.33-.4.739-.72 1.209-.95.471-.23 1.03-.31 1.67-.31.531-.01 1.06.09 1.55.31.41.18.77.45 1.05.8.26.34.47.72.601 1.14.129.4.189.81.189 1.22 0 .24-.01.45-.019.64z';
const P_PR = 'M10.15 8.42a2.93 2.93 0 00-1.18-.2 13.9 13.9 0 00-1.09.02v3.36l.39.02h.53c.39 0 .78-.06 1.15-.18.32-.09.6-.28.82-.53.21-.25.31-.59.31-1.03a1.45 1.45 0 00-.93-1.46zM19.75.3H4.25A4.25 4.25 0 000 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm-7.09 11.65c-.4.56-.96.98-1.61 1.22-.68.25-1.43.34-2.25.34l-.5-.01-.43-.01v3.21a.12.12 0 01-.11.14H5.82c-.08 0-.12-.04-.12-.13V6.42c0-.07.03-.11.1-.11l.56-.01.76-.02.87-.02.91-.01c.82 0 1.5.1 2.06.31.5.17.96.45 1.34.82.32.32.57.71.73 1.14.15.42.23.85.23 1.3 0 .86-.2 1.57-.6 2.13zm6.82-3.15v1.95c0 .08-.05.11-.16.11a4.350 4.35 0 00-1.92.37c-.19.09-.37.21-.51.37v5.1c0 .1-.04.14-.13.14h-1.97a.14.14 0 01-.16-.12v-5.58l-.01-.75-.02-.78c0-.23-.02-.45-.04-.68a.1.1 0 01.07-.11h1.78c.1 0 .18.07.2.16a3.03 3.03 0 01.13.92c.3-.35.67-.64 1.08-.86a3.1 3.1 0 011.52-.39c.07-.01.13.04.14.11v.04z';
const svgClaude = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="display:block"><path fill="${c || CLAY}" d="${P_CLAUDE}"/></svg>`;
const svgAdobe = (s, p) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="display:block"><rect x="1" y="1.3" width="22" height="22" rx="3" fill="#9999FF"/><path fill="#00005B" d="${p}"/></svg>`;
const ST = (c, w) => `fill="none" stroke="${c}" stroke-width="${w || 2.6}" stroke-linecap="round" stroke-linejoin="round"`;
const ICON = {
  play: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M12 9.5v13l11-6.5z" fill="${c}" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  pause: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="10" y="9" width="4.4" height="14" rx="1.6" fill="${c}"/><rect x="17.6" y="9" width="4.4" height="14" rx="1.6" fill="${c}"/></svg>`,
  send: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 25V8M8.5 15 16 7.5l7.5 7.5" ${ST(c, 3.4)}/></svg>`,
  down: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 6v16M9 15.5l7 7 7-7" ${ST(c, 3.6)}/><path d="M7 27h18" ${ST(c, 3.6)}/></svg>`,
  link: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M13.5 18.5l5-5" ${ST(c, 3.2)}/><path d="M11 15l-3 3a4.2 4.2 0 0 0 6 6l3-3" ${ST(c, 3.2)}/><path d="M21 17l3-3a4.2 4.2 0 0 0-6-6l-3 3" ${ST(c, 3.2)}/></svg>`,
  user: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><circle cx="16" cy="11.5" r="5.5" fill="${c}"/><path d="M6 27c1.4-5.6 5.4-8.4 10-8.4s8.6 2.8 10 8.4z" fill="${c}"/></svg>`,
  chart: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="6" y="15" width="5" height="11" rx="1.6" fill="${c}"/><rect x="13.5" y="8" width="5" height="18" rx="1.6" fill="${c}"/><rect x="21" y="12" width="5" height="14" rx="1.6" fill="${c}"/></svg>`,
  pin: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 29s-9-8.6-9-15.3a9 9 0 0 1 18 0C25 20.4 16 29 16 29z" fill="${c}"/><circle cx="16" cy="13.6" r="3.6" fill="#fff"/></svg>`,
  rocket: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 3.5c5 3.4 7 8.6 6.2 15.2l-2.7 3.3h-7l-2.7-3.3C9 12.1 11 6.9 16 3.5z" fill="${c}"/><circle cx="16" cy="12.6" r="2.8" fill="#fff"/><path d="M12.8 23.6h6.4l-1.2 4.4h-4z" fill="${YEL}"/><path d="M9.6 17.2 6 21.6l1 3.4 3.6-3M22.4 17.2l3.6 4.4-1 3.4-3.6-3" fill="${c}"/></svg>`,
  palette: () => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 4C9.4 4 4 9 4 15.4 4 21.6 9 27 15 27c1.8 0 2.6-1.1 2.6-2.3 0-1.6-1.3-2-1.3-3.4 0-1.3 1-2.2 2.4-2.2H22c3.6 0 6-2.6 6-6C28 8.3 22.6 4 16 4z" fill="${INK}"/><circle cx="10" cy="14" r="2.4" fill="${OR}"/><circle cx="14" cy="9" r="2.4" fill="${YEL}"/><circle cx="20" cy="9.4" r="2.4" fill="${BL}"/><circle cx="23.2" cy="14.4" r="2.2" fill="${GRN}"/></svg>`,
  mail: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="5" y="8" width="22" height="16" rx="3.4" fill="${c}"/><path d="M6.5 10l9.5 7 9.5-7" ${ST('#fff', 2.4)}/></svg>`,
  lock: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="7" y="14" width="18" height="13" rx="3.4" fill="${c}"/><path d="M11 14v-3a5 5 0 0 1 10 0v3" ${ST(c, 3)}/></svg>`,
  code: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M11 9.5 4.5 16 11 22.5M21 9.5l6.5 6.5-6.5 6.5M18 7l-4 18" ${ST(c, 3.2)}/></svg>`,
  film: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="5" y="6" width="22" height="20" rx="3.4" fill="${c}"/><rect x="10" y="10" width="12" height="12" rx="2" fill="#fff"/><g fill="#fff"><rect x="6.6" y="8.4" width="1.8" height="2.2" rx=".6"/><rect x="6.6" y="14.9" width="1.8" height="2.2" rx=".6"/><rect x="6.6" y="21.4" width="1.8" height="2.2" rx=".6"/><rect x="23.6" y="8.4" width="1.8" height="2.2" rx=".6"/><rect x="23.6" y="14.9" width="1.8" height="2.2" rx=".6"/><rect x="23.6" y="21.4" width="1.8" height="2.2" rx=".6"/></g></svg>`,
  lines: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M7 10h18M7 16h18M7 22h11" ${ST(c, 3.2)}/></svg>`,
  restart: (c) => `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M24 50a26 26 0 1 0 8-18.8" ${ST(c, 9)}/><path d="M22 18v17h17" ${ST(c, 9)}/></svg>`,
  tag: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h9.2l11.3 11.3-10.7 10.7L5 15.7z" fill="${c}"/><circle cx="11" cy="11" r="2.4" fill="#fff"/></svg>`,
  text: (c) => `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M7 9V6.5h18V9M16 6.5v19M11.5 25.5h9" ${ST(c, 3.4)}/></svg>`,
  cursor: () => `<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M8 4l24 14-10.5 2.6L16 31z" fill="${INK}" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>`,
};
const STAR = 'M9.82531 0.843845C10.0553 0.215178 10.9446 0.215178 11.1746 0.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L0.843814 11.1747C0.215148 10.9447 0.215148 10.0553 0.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531 0.843845Z';
const svgStar = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 21 21" style="display:block"><path fill="${c}" d="${STAR}"/></svg>`;

// ============================================================ the pixel mascot (Claude Code's pixel crab, as in JS1's sub-agent ring), with props
const CRAB_ROWS = ['...XXXXXXXXXXXX...', '...XXEXXXXXXEXX...', '.XXXXXXXXXXXXXXXX.', '...XXXXXXXXXXXX...', '....X.X....X.X....'];
function crabBody(color) { let r = '';
  CRAB_ROWS.forEach((row, y) => { let x = 0; while (x < row.length) { const ch = row[x]; if (ch === '.') { x++; continue; }
    let k = x; while (k < row.length && row[k] === ch) k++;
    r += `<rect x="${x}" y="${y * 2}" width="${k - x}" height="2" fill="${ch === 'E' ? INK : color}"/>`; x = k; } });
  return r; }
const PROPS = {
  clap: `<rect x="5" y="-5.8" width="8" height="5.2" rx=".5" fill="${INK}"/><g transform="rotate(-14 5 -6)"><rect x="5" y="-8.2" width="8" height="2" rx=".4" fill="${INK}"/><rect x="6.2" y="-8.2" width="1.3" height="2" fill="#fff"/><rect x="8.9" y="-8.2" width="1.3" height="2" fill="#fff"/><rect x="11.6" y="-8.2" width="1.3" height="2" fill="#fff"/></g>`,
  play: `<circle cx="16.4" cy="-3.6" r="3.4" fill="${BL}"/><path d="M15.3 -5.5v3.8l3.2-1.9z" fill="#fff"/>`,
  star: `<g transform="translate(5.8 -8.6) scale(0.31)"><path fill="${YEL}" d="${STAR}"/></g>`,
  cap: `<path d="M4.4 0a4.6 4.4 0 0 1 9.2 0z" transform="translate(0 -0.2) scale(1 1)" fill="${OR}"/><rect x="3" y="-0.9" width="12" height="1.3" rx=".4" fill="${OR}"/>`,
  film: `<rect x="4" y="-7.4" width="10" height="6.4" rx=".8" fill="${INK}"/><rect x="6.4" y="-6.2" width="5.2" height="4" rx=".4" fill="${OR}"/><g fill="#fff"><rect x="4.7" y="-6.8" width=".9" height=".9"/><rect x="4.7" y="-4.6" width=".9" height=".9"/><rect x="4.7" y="-2.4" width=".9" height=".9"/><rect x="12.4" y="-6.8" width=".9" height=".9"/><rect x="12.4" y="-4.6" width=".9" height=".9"/><rect x="12.4" y="-2.4" width=".9" height=".9"/></g>`,
  none: '',
};
// returns { e, setArm(up) }: wave toggles the right arm between down (row 2) and raised
function crab(parent, x, y, w, prop, color) {
  const e = el(parent, box(x, y, w, w));
  e.innerHTML = `<svg width="${w}" height="${w}" viewBox="-1 -9 20 20" shape-rendering="crispEdges" style="display:block;overflow:visible">${crabBody(color || CLAY)}<rect class="armUp" x="16" y="-1" width="1" height="5" fill="${color || CLAY}" opacity="0"/>${PROPS[prop || 'none']}</svg>`;
  const up = e.firstChild.querySelector('.armUp');
  return { e, setArm(on) { up.setAttribute('opacity', on ? 1 : 0); } };
}

// ============================================================ shared motion helpers (entries = pop or build, exits = hard cut)
// on a hard cut a pop starts 55% there and rises 24 px (no scale, so inner spacing never shrinks)
function pop(e, t, o) { o = o || {}; const s0 = o.s == null ? 0.6 : o.s;
  tl.fromTo(e, { opacity: o.cut ? 0.55 : 0 }, { opacity: 1, duration: o.fd || 0.1, ease: 'none', immediateRender: true }, t);
  tl.fromTo(e, { scale: o.cut ? 1 : s0, y: o.cut ? (o.rise == null ? 24 : o.rise) : (o.y || 0), rotation: o.r || 0 }, { scale: 1, y: 0, rotation: 0, duration: o.d || 0.36, ease: o.ease || 'back.out(1.5)', immediateRender: true }, t);
}
function bump(e, t, s) { tl.to(e, { scale: s || 1.05, duration: 0.1, ease: 'power2.out' }, t); tl.to(e, { scale: 1, duration: 0.4, ease: 'back.out(3)' }, t + 0.1); }
function press(e, t) { tl.to(e, { scale: 0.86, duration: 0.08, ease: 'power2.in' }, t); tl.to(e, { scale: 1, duration: 0.42, ease: 'back.out(4)' }, t + 0.08); }
function ring(par, cx, cy, r, color, t, w) { const e = el(par, box(cx - r, cy - r, 2 * r, 2 * r, { borderRadius: '50%', border: `${w || 5}px solid ${color}`, opacity: 0 }));
  tl.fromTo(e, { opacity: 0.9, scale: 0.8 }, { opacity: 0, scale: 1.7, duration: 0.55, ease: 'power2.out', immediateRender: false }, t); return e; }
function typer(node, text, t0, t1) { FR.push(t => { const n = t < t0 ? 0 : t >= t1 ? text.length : Math.floor((t - t0) / (t1 - t0) * text.length + 1e-6); node.textContent = text.slice(0, n); }); }
function caretBlink(node, on0, on1, steady) { FR.push(t => { node.style.opacity = (t >= on0 && t < on1) ? ((steady != null && t < steady) ? 1 : (Math.floor((t - on0) * 2.6) % 2 ? 0.15 : 1)) : 0; }); }
function tile(par, x, y, s, html, extra) { return el(par, box(x, y, s, s, Object.assign({ borderRadius: px(Math.round(s * 0.24)) }, extra || {})), 'tile', html); }
function wrap(par, x, y, w, h) { return el(par, box(x, y, w, h)); } // positioning wrapper (FR moves the wrapper, GSAP pops the child)

// ---- the tick (stroke draws, disc springs and settles, ring + small burst) [checkmark in the style of 21st.dev animated check]
function mkTick(parent, cx, cy, Rr, color, opt) {
  opt = opt || {}; color = color || BL;
  const light = color === OR ? '#FFC58A' : '#A9CBFF', dark = color === OR ? '#D96A00' : '#1D63D8';
  const g = el(parent, { left: px(cx), top: px(cy), width: '0px', height: '0px', zIndex: 5 });
  const rg = el(g, box(-Rr, -Rr, 2 * Rr, 2 * Rr, { borderRadius: '50%', border: `${Math.max(3, Math.round(Rr * 0.07))}px solid ${color}`, opacity: 0 }));
  const parts = []; const N = 10;
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2 + 0.31;
    const p = el(g, box(-Rr * 0.055, -Rr * 0.16, Rr * 0.11, Rr * 0.32, { borderRadius: px(Rr * 0.06), background: k % 2 ? (opt.alt || light) : color, opacity: 0 }));
    gsap.set(p, { rotation: a * 180 / Math.PI, x: Rr * Math.sin(a), y: -Rr * Math.cos(a) }); parts.push({ p, a }); }
  const disc = el(g, box(-Rr, -Rr, 2 * Rr, 2 * Rr, { borderRadius: '50%',
    background: `radial-gradient(circle at 34% 28%, ${light} 0%, ${color} 55%, ${dark} 100%)`,
    boxShadow: `0 0 0 ${Math.max(3, Math.round(Rr * 0.09))}px ${opt.rim || '#FFFFFF'}, 0 ${Math.round(Rr * 0.18)}px ${Math.round(Rr * 0.5)}px -${Math.round(Rr * 0.12)}px rgba(15,15,15,0.35)` }));
  disc.innerHTML = `<svg width="${2 * Rr}" height="${2 * Rr}" viewBox="0 0 100 100" style="position:absolute;left:0;top:0"><path d="M29 52 L44 66 L72 36" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="64" stroke-dashoffset="64"/></svg>`;
  gsap.set(disc, { scale: 0 });
  return { g, ring: rg, disc, chk: disc.querySelector('path'), parts, Rr };
}
function tickAt(k, t) {
  tl.to(k.disc, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.6)' }, t);
  tl.to(k.chk, { attr: { 'stroke-dashoffset': 0 }, duration: 0.24, ease: 'power2.out' }, t + 0.1);
  tl.fromTo(k.ring, { opacity: 0.85, scale: 0.75 }, { opacity: 0, scale: 1.9, duration: 0.55, ease: 'power2.out', immediateRender: false }, t + 0.06);
  k.parts.forEach(({ p, a }) => { const r0 = k.Rr * 1.08, r1 = k.Rr * 1.8;
    tl.fromTo(p, { opacity: 1, x: r0 * Math.sin(a), y: -r0 * Math.cos(a), scaleY: 1 }, { opacity: 0, x: r1 * Math.sin(a), y: -r1 * Math.cos(a), scaleY: 0.35, duration: 0.45, ease: 'power3.out', immediateRender: false }, t + 0.1); });
}

// ============================================================ 21st.dev ports (pure functions of time)
// Animated Beam (dillionverma/animated-beam): grey base path + a gradient comet. The gradient vector x1/x2 sweep with expo-out
// [0.16, 1, 0.3, 1] like the original, but each sweep is triggered on a word instead of repeat: Infinity. A packet rides the head.
let GID = 0;
function beam(svg, a, b, o) {
  o = o || {}; const id = 'beam' + (GID++);
  const d = `M ${a[0]},${a[1]} Q ${(a[0] + b[0]) / 2},${a[1] - (o.curv || 0)} ${b[0]},${b[1]}`;
  const defs = mk('defs', {}, svg);
  const lg = mk('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: -9999, y1: -9999, x2: -9998, y2: -9998 }, defs);
  const c0 = o.from || OR, c1 = o.to || BL;
  mk('stop', { 'stop-color': c0, 'stop-opacity': 0 }, lg); mk('stop', { 'stop-color': c0 }, lg);
  mk('stop', { offset: '32.5%', 'stop-color': c1 }, lg); mk('stop', { offset: '100%', 'stop-color': c1, 'stop-opacity': 0 }, lg);
  const base = mk('path', { d, fill: 'none', stroke: o.path || '#D3D5DC', 'stroke-width': o.w || 6, 'stroke-linecap': 'round' }, svg);
  const grad = mk('path', { d, fill: 'none', stroke: `url(#${id})`, 'stroke-width': (o.w || 6) + 2, 'stroke-linecap': 'round' }, svg);
  const L = base.getTotalLength();
  base.setAttribute('stroke-dasharray', `${L} ${L}`); base.setAttribute('stroke-dashoffset', L);
  return { base, grad, lg, L, a, b, runs: [] };
}
function beamDraw(B, t, dur) { tl.to(B.base, { attr: { 'stroke-dashoffset': 0 }, duration: dur || 0.25, ease: 'power2.out' }, t); }
function beamRun(B, t0, dur, pkt) { B.runs.push([t0, dur]);
  if (B.runs.length === 1) FR.push(t => {
    const r = B.runs.filter(([s, d]) => t >= s && t <= s + d).pop();
    if (!r) { B.lg.setAttribute('x1', -9999); B.lg.setAttribute('x2', -9998); B.lg.setAttribute('y1', -9999); B.lg.setAttribute('y2', -9998); if (B.pkt) B.pkt.style.opacity = 0; return; }
    const u = EO((t - r[0]) / r[1]), head = -0.1 + 1.25 * u, tail = head - 0.45;
    const P = s => [lerp(B.a[0], B.b[0], s), lerp(B.a[1], B.b[1], s)];
    const h = P(head), q = P(tail);
    B.lg.setAttribute('x1', h[0]); B.lg.setAttribute('y1', h[1]); B.lg.setAttribute('x2', q[0]); B.lg.setAttribute('y2', q[1]);
    if (B.pkt) { const s = clamp(head - 0.04, 0, 1), p = B.grad.getPointAtLength(B.L * s);
      B.pkt.style.transform = `translate(${p.x}px, ${p.y}px)`; B.pkt.style.opacity = (head > 0.02 && head < 1.04) ? 1 : 0; }
  });
}
// Ripple (dillionverma/ripple): concentric circles breathing 1 -> 0.9 -> 1 every 2 s, ring i delayed 0.2 s, mask fades to the bottom
function ripple(par, cx, cy, base, n, cols) {
  const wrapE = el(par, box(0, 0, 1080, 1920, { WebkitMaskImage: `linear-gradient(to bottom, #000 ${cy - 200}px, rgba(0,0,0,0) ${cy + base / 2 + n * 70}px)`, maskImage: `linear-gradient(to bottom, #000 ${cy - 200}px, rgba(0,0,0,0) ${cy + base / 2 + n * 70}px)` }));
  const cs = [];
  for (let i = n - 1; i >= 0; i--) { const s = base + i * 110, col = cols[i % cols.length];
    const c = el(wrapE, box(cx - s / 2, cy - s / 2, s, s, { borderRadius: '50%', background: col.replace('A', String(0.2 - i * 0.03)), border: `3px ${i === n - 1 ? 'dashed' : 'solid'} ${col.replace('A', String(0.45 - i * 0.06))}` }));
    cs.push({ c, i }); }
  FR.push(t => cs.forEach(({ c, i }) => { const ph = ((t - i * 0.2) % 2 + 2) % 2 / 2; c.style.transform = `scale(${1 - 0.1 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2))})`; }));
  return wrapE;
}
// Orbiting Circles (dillionverma/orbiting-circles): items on an orbit, angle = phase + 360deg * t / duration
function orbit(items, cx, cy, rx, ry, dur, reverse) { FR.push(t => items.forEach(({ w, a0, s }) => {
  const a = (a0 + (reverse ? -1 : 1) * t / dur * 360) * Math.PI / 180; w.style.left = px(cx + rx * Math.cos(a) - s / 2); w.style.top = px(cy + ry * Math.sin(a) - s / 2); })); }
// Sparkles Text (dillionverma/sparkles-text): stars at seeded spots, each loops opacity 0-1-0, scale 0-s-0, rotate 75-120-150 over 0.8 s
function sparkles(par, x, y, w, h, n, cols, t0, t1, seed, size) {
  const r = mulberry32(seed || 3), S = [];
  // round 9: soft dots, not 4-point stars (R04 "no decorative sparkle stars"; check.py no_sparkle_stars). D.sparkle === 'star' = the round 8 look.
  for (let i = 0; i < n; i++) { const s = D.sparkle === 'star' ? el(par, box(x + r() * w - (size || 30) / 2, y + r() * h - (size || 30) / 2, size || 30, size || 30, { opacity: 0 }), '', svgStar(size || 30, cols[i % cols.length]))
      : el(par, box(x + r() * w - (size || 30) / 4, y + r() * h - (size || 30) / 4, (size || 30) / 2, (size || 30) / 2, { opacity: 0, borderRadius: '50%', background: cols[i % cols.length], boxShadow: '0 0 0 3px rgba(255,255,255,0.6)' }));
    S.push({ s, delay: r() * 0.8, sc: 0.5 + r() * 0.9 }); }
  FR.push(t => S.forEach(({ s, delay, sc }) => { if (t < t0 + delay || t > t1) { s.style.opacity = 0; return; }
    const ph = ((t - t0 - delay) % 0.8) / 0.8, k = Math.sin(ph * Math.PI);
    s.style.opacity = k; s.style.transform = `scale(${k * sc}) rotate(${ph < 0.5 ? lerp(75, 120, ph * 2) : lerp(120, 150, ph * 2 - 1)}deg)`; }));
}
// Border Beam (dillionverma/border-beam): a short orange-to-blue light that runs around a rounded box
function borderBeam(par, x, y, w, h, r, t0, t1, dur) {
  const s = mkSvg(par, 1080, 1920); const id = 'bb' + (GID++);
  const defs = mk('defs', {}, s); const lg = mk('linearGradient', { id }, defs);
  mk('stop', { offset: '0%', 'stop-color': BL, 'stop-opacity': 0 }, lg); mk('stop', { offset: '60%', 'stop-color': BL }, lg); mk('stop', { offset: '100%', 'stop-color': OR }, lg);
  const rect = mk('rect', { x, y, width: w, height: h, rx: r, fill: 'none', stroke: OR, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
  const rect2 = mk('rect', { x, y, width: w, height: h, rx: r, fill: 'none', stroke: BL, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
  const L = 2 * (w + h) - (8 - 2 * Math.PI) * r, seg = Math.min(260, L * 0.12);
  FR.push(t => { const on = t >= t0 && t <= t1; s.style.opacity = on ? 1 : 0; if (!on) return; const u = ((t - t0) / (dur || 2.2)) % 1;
    rect.setAttribute('stroke-dasharray', `${seg} ${L}`); rect.setAttribute('stroke-dashoffset', -u * L);
    rect2.setAttribute('stroke-dasharray', `${seg} ${L}`); rect2.setAttribute('stroke-dashoffset', -(u * L + L / 2)); });
  return s;
}
// Number Ticker (dillionverma/number-ticker): framer spring (stiffness 100, damping 60), run 3x faster so it lands on the word
function ticker(node, from, to, t0, suffix, speed) { const k = 100, c = 60, d = Math.sqrt(c * c - 4 * k), r1 = (-c + d) / 2, r2 = (-c - d) / 2;
  const val = t => { const tt = Math.max(0, t - t0) * (speed || 3), x = 1 - (r2 * Math.exp(r1 * tt) - r1 * Math.exp(r2 * tt)) / (r2 - r1); return lerp(from, to, t < t0 ? 0 : clamp(x / 0.9, 0, 1)); };
  FR.push(t => { node.textContent = Math.round(val(t)) + (suffix || ''); }); return val; }
// Animated Circular Progress Bar (dillionverma/animated-circular-progress-bar): r 45, stroke 10, 5% gap, secondary arc mirrored
function progressRing(par, x, y, s, prim, sec) {
  const e = el(par, box(x, y, s, s)); const C = 2 * Math.PI * 45, P = C / 100;
  e.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none"><circle class="sec" cx="50" cy="50" r="45" stroke-width="10" stroke-linecap="round" stroke="${sec}" transform="rotate(252 50 50) scale(1 -1) translate(0 -100)"/><circle class="pri" cx="50" cy="50" r="45" stroke-width="10" stroke-linecap="round" stroke="${prim}" transform="rotate(-90 50 50)"/></svg>`;
  const pri = e.querySelector('.pri'), se = e.querySelector('.sec');
  return { e, set(p) { pri.setAttribute('stroke-dasharray', `${p * P} ${C}`); se.style.display = p <= 90 ? '' : 'none'; se.setAttribute('stroke-dasharray', `${Math.max(0, 90 - p) * P} ${C}`); } };
}
// Confetti (dillionverma/confetti = canvas-confetti): same particle physics (velocity, decay 0.9, gravity, wobble, tilt) re-run from the
// burst start every frame with a seeded random, 60 ticks per second
function confetti(par, x0, y0, t0, o) {
  o = o || {}; const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; Object.assign(cv.style, { position: 'absolute', left: '0px', top: '0px', width: '1080px', height: '1920px' }); par.appendChild(cv);
  const ctx = cv.getContext('2d'), N = o.n || 90, cols = o.colors || [OR, BL, YEL, '#FFFFFF'], sc = o.scalar || 2.4;
  const base = []; const r = mulberry32(o.seed || 11);
  for (let i = 0; i < N; i++) { const sv = o.v || 45;
    base.push({ wobble: r() * 10, ws: Math.min(0.11, r() * 0.1 + 0.05), vel: sv * 0.5 + r() * sv, ang: -(o.angle || 90) * Math.PI / 180 + (0.5 * (o.spread || 70) - r() * (o.spread || 70)) * Math.PI / 180,
      tilt: (r() * 0.5 + 0.25) * Math.PI, col: cols[i % cols.length], seed: 1000 + i, sq: r() > 0.4 }); }
  FR.push(t => { ctx.clearRect(0, 0, 1080, 1920); if (t < t0) return; const n = Math.floor((t - t0) * 60), ticks = o.ticks || 120; if (n >= ticks) return;
    base.forEach(p => { let x = x0, y = y0, v = p.vel, wob = p.wobble, tilt = p.tilt; const rr = mulberry32(p.seed); let rnd = 2;
      for (let k = 0; k < n; k++) { x += Math.cos(p.ang) * v; y += Math.sin(p.ang) * v + 3 * (o.gravity || 1); v *= (o.decay || 0.9); wob += p.ws; tilt += 0.1; rnd = rr() + 2; }
      const wx = x + 10 * sc * Math.cos(wob), wy = y + 10 * sc * Math.sin(wob), ts = Math.sin(tilt), tc = Math.cos(tilt);
      ctx.globalAlpha = 1 - n / ticks; ctx.fillStyle = p.col; ctx.beginPath();
      if (p.sq) { ctx.moveTo(x, y); ctx.lineTo(wx, y + rnd * ts * sc); ctx.lineTo(wx + rnd * tc * sc, wy + rnd * ts * sc); ctx.lineTo(x + rnd * tc * sc, wy); }
      else ctx.ellipse(x, y, Math.abs(wx - x) * 0.6 + 2, Math.abs(wy - y) * 0.6 + 2, Math.PI / 10 * wob, 0, 2 * Math.PI);
      ctx.closePath(); ctx.fill(); }); });
  return cv;
}
// Cool Mode (dillionverma/cool-mode): click particles; per tick left -= speedHorz * dir, top -= speedUp, speedUp = min(size, speedUp - 1)
function coolMode(par, cx, cy, t0, n, seed) {
  const r = mulberry32(seed || 5), P = [], sizes = [15, 20, 25, 35, 45], cols = [OR, BL, YEL, GRN, OR, BL];
  for (let i = 0; i < n; i++) { const size = sizes[Math.floor(r() * sizes.length)] * 1.4; const e = el(par, box(0, 0, size, size, { borderRadius: '50%', background: cols[i % cols.length], opacity: 0 }));
    P.push({ e, size, sh: r() * 10, su: r() * 25, dir: r() <= 0.5 ? -1 : 1 }); }
  FR.push(t => P.forEach(p => { if (t < t0) { p.e.style.opacity = 0; return; } const k = Math.floor((t - t0) * 60); if (k > 70) { p.e.style.opacity = 0; return; }
    const top = cy - p.size / 2 - (k * p.su - k * (k - 1) / 2), left = cx - p.size / 2 - k * p.sh * p.dir;
    p.e.style.opacity = 1 - k / 70; p.e.style.transform = `translate(${left}px, ${top}px)`; }));
}
// Animated List (dillionverma/animated-list): spring scale 0 -> 1 (stiffness 350, damping 40), newest on top pushes the rest down
function springScale(t, t0) { if (t < t0) return 0; const k = 350, c = 40, z = c / (2 * Math.sqrt(k)), wn = Math.sqrt(k), tt = t - t0;
  if (z >= 1) { const d = Math.sqrt(c * c - 4 * k), r1 = (-c + d) / 2, r2 = (-c - d) / 2; return 1 - (r2 * Math.exp(r1 * tt) - r1 * Math.exp(r2 * tt)) / (r2 - r1); }
  const wd = wn * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * wn * tt) * (Math.cos(wd * tt) + z / Math.sqrt(1 - z * z) * Math.sin(wd * tt)); }
// Typing Animation (dillionverma/typing-animation) = typer() above: one character per step, stepped on the clock, not on setInterval
// Shimmer Button (dillionverma/shimmer-button): a light sweep crosses the button once per 3 s while it is live
function shimmer(btn, w, h, t0, t1) { const s = el(btn, box(0, 0, w, h, { borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }));
  const band = el(s, box(-w, 0, w * 0.5, h, { background: 'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 100%)' }));
  FR.push(t => { if (t < t0 || t > t1) { band.style.opacity = 0; return; } band.style.opacity = 1; const u = ((t - t0) % 1.4) / 1.4; band.style.transform = `translateX(${u * w * 2.6}px)`; }); }

// ============================================================ Jack videos (final mode only). No push, no drift on Jack (round 6 rule).
const vfullWrap = document.getElementById('vfullWrap'), vsplitWrap = document.getElementById('vsplitWrap');
if (vfullWrap) { vfullWrap.style.zIndex = 2; showOpacity(vfullWrap, windowsOf(ty => ty === 'jack')); }
if (vsplitWrap) { vsplitWrap.style.zIndex = 2; showOpacity(vsplitWrap, windowsOf(ty => ty === 'split')); }

