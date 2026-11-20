// Short mode, DOM spacing check (from tyler-short r6 to r8). Every 5th frame, from the DOM boxes of every graphic block (data-ov)
// and caption pill: gap between separate blocks >= 32 px, outer margin inside the block's panel >= 48 px, padding of a block
// inside another >= 28 px, no partial overlap ("touching"), caption pill clear of blocks by >= 32 px, at most 3 words + 1 number of
// label text on screen (text inside [data-code] or [data-typed] is not a label), hero (data-hero) at least 65% of the panel width.
// Blocks that have started to leave carry data-ov="off" and are skipped. A page error (any JS exception) is a FAIL.
// Also dumps the word-sync log (window.__SYNC) and the graphics event log (window.__EV): the gate reads sync.json, the
// audio step places sound effects from events.json.
// usage: node bbox_check.mjs <project>    (reads work/comps/final.html, writes work/bbox.json, work/sync.json, work/events.json)
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
const P = path.resolve(process.argv[2] || '.'), WD = path.join(P, 'work');
const H = os.homedir();
const npx = path.join(H, '.npm/_npx');
const pc = fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).filter(f => fs.existsSync(f))[0];
if (!pc) { console.log('puppeteer-core not found under ~/.npm/_npx (run any `npx hyperframes` command once)'); process.exit(2); }
const cdir = path.join(H, '.cache/hyperframes/chrome/chrome-headless-shell');
const ver = fs.readdirSync(cdir).filter(d => d.startsWith('mac_arm')).sort().pop();
const CHROME = path.join(cdir, ver, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const { default: puppeteer } = await import(pc);
const MIN_GAP = 32, MIN_MARGIN = 48, MIN_PAD = 28, MAX_WORDS = 3, MAX_NUMS = 1, MIN_HERO = 0.65, TOL = 0.5;
const page_html = path.join(WD, 'hf', '_check.html');
fs.copyFileSync(path.join(WD, 'comps', 'final.html'), page_html);
let browser, failed = false;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  // Kill Chrome when this script ends (orphan guard, 18 Oct 2026 near-OOM: never leave headless Chrome behind)
  const cpid = browser.process() && browser.process().pid;
  if (cpid) { spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 2; done; kill -9 ${cpid} 2>/dev/null`], { detached: true, stdio: 'ignore' }).unref();
    process.on('exit', () => { try { process.kill(cpid, 'SIGKILL'); } catch (e) {} }); }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', r => { if (/ERR_FILE_NOT_FOUND/.test((r.failure() || {}).errorText || '')) errors.push('missing file: ' + decodeURIComponent(r.url()).replace('file://' + path.join(WD, 'hf') + '/', '')); });   // e.g. an asset folder not copied by prep.py (found 21 Oct)
  await page.setViewport({ width: 1080, height: 1920 });
  await page.goto('file://' + page_html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));
  const res = await page.evaluate(() => {
    if (!window.__timelines || !window.__timelines.main) return { frames: [], sync: [], ev: [], broken: true };
    const tl = window.__timelines.main, T = parseFloat(document.getElementById('root').dataset.duration), out = [];
    // 27 Oct: skip anything inside a world that is mid-transition (its panel growing, shrinking or sliding: data-moving="1"),
    // and anything wholly off the frame (a card that has flown away)
    function vis(e) { if (e.closest && e.closest('[data-moving="1"]')) return false; if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      { const r = e.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= 1920 || r.right <= 0 || r.left >= 1080) return false; }
      let n = e, op = 1; while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; } return op > 0.15; }
    const rect = e => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, k: e.offsetWidth ? r.width / e.offsetWidth : 1 }; };
    function panelOf(e) { const s = e.dataset.in || (e.closest('[data-panel]') || {}).dataset?.panel || '0,0,1080,1920'; const [a, b, c, d] = s.split(',').map(Number); return { x0: a, y0: b, x1: c, y1: d }; }
    function words() { const w = [], nums = []; const it = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
      let n; while ((n = it.nextNode())) { const p = n.parentElement; if (!p || p.closest('.cap') || p.closest('[data-code]') || p.closest('[data-typed]') || !n.textContent.trim()) continue; if (!vis(p)) continue;
        n.textContent.trim().split(/\s+/).forEach(tok => { if (/\d/.test(tok)) nums.push(tok); else if (/[A-Za-z]/.test(tok)) w.push(tok); }); }
      return { w, nums }; }
    for (let f = 0; f < Math.round(T * 30); f += 5) {
      const t = f / 30; tl.seek(t, false);
      const caps = Array.from(document.querySelectorAll('.cap')).filter(c => getComputedStyle(c).visibility === 'visible').map(c => Object.assign(rect(c.firstChild), { id: c.id, text: c.textContent }));
      const els = Array.from(document.querySelectorAll('[data-ov]')).filter(e => e.dataset.ov !== 'cap' && e.dataset.ov !== 'off' && vis(e)).map(e => Object.assign(rect(e),
        { g: e.dataset.ov, id: e.id || (e.className + ':' + (e.textContent || '').trim().slice(0, 16)) + '@' + e.dataset.ov, p: panelOf(e) })).filter(b => b.x1 - b.x0 > 2 && b.y1 - b.y0 > 2);
      const heroes = Array.from(document.querySelectorAll('[data-hero]')).filter(e => vis(e)).map(e => { const r = rect(e), p = panelOf(e); return { g: e.dataset.hero, w: (r.x1 - r.x0) / (p.x1 - p.x0) }; });
      out.push({ f, t, caps, els, heroes, words: words() });
    }
    return { frames: out, sync: window.__SYNC, ev: window.__EV };
  });
  const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inside = (a, b) => a.x0 >= b.x0 - TOL && a.y0 >= b.y0 - TOL && a.x1 <= b.x1 + TOL && a.y1 <= b.y1 + TOL;
  const gapOf = (a, b) => { const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1), dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1); return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy); };
  const fails = { gap: [], margin: [], pad: [], touch: [], cap: [], words: [], hero: [], page: errors.map(e => ({ error: e.slice(0, 300) })) };
  if (res.broken) fails.page.push({ error: 'no timeline: the page script did not run' });
  let minGap = 1e9, minMargin = 1e9, minPad = 1e9, minCapGap = 1e9, maxWords = 0, maxNums = 0; const heroMax = {};
  for (const fr of res.frames) {
    const T2 = +fr.t.toFixed(2);
    for (const e of fr.els) { const m = Math.min(e.x0 - e.p.x0, e.y0 - e.p.y0, e.p.x1 - e.x1, e.p.y1 - e.y1); minMargin = Math.min(minMargin, m);
      if (m < MIN_MARGIN - TOL) fails.margin.push({ t: T2, el: e.id, margin: Math.round(m) }); }
    for (let i = 0; i < fr.els.length; i++) for (let j = i + 1; j < fr.els.length; j++) { const a = fr.els[i], b = fr.els[j];
      if (inside(a, b) || inside(b, a)) { const [c, o] = inside(a, b) ? [a, b] : [b, a]; const pd = Math.min(c.x0 - o.x0, c.y0 - o.y0, o.x1 - c.x1, o.y1 - c.y1) / (o.k || 1); minPad = Math.min(minPad, pd);
        if (pd < MIN_PAD - TOL) fails.pad.push({ t: T2, inner: c.id, outer: o.id, pad: Math.round(pd) }); continue; }
      if (inter(a, b) > 0) { fails.touch.push({ t: T2, a: a.id, b: b.id }); minGap = Math.min(minGap, 0); continue; }
      const g = gapOf(a, b); minGap = Math.min(minGap, g); if (g < MIN_GAP - TOL) fails.gap.push({ t: T2, a: a.id, b: b.id, gap: Math.round(g) }); }
    for (const c of fr.caps) for (const e of fr.els) { const g = inter(c, e) > 0 ? 0 : gapOf(c, e); minCapGap = Math.min(minCapGap, g);
      if (g < MIN_GAP - TOL) fails.cap.push({ t: T2, cap: c.text, el: e.id, gap: Math.round(g) }); }
    maxWords = Math.max(maxWords, fr.words.w.length); maxNums = Math.max(maxNums, fr.words.nums.length);
    if (fr.words.w.length > MAX_WORDS || fr.words.nums.length > MAX_NUMS) fails.words.push({ t: T2, words: fr.words.w.join(' '), nums: fr.words.nums.join(' ') });
    for (const h of fr.heroes) heroMax[h.g] = Math.max(heroMax[h.g] || 0, h.w);
  }
  for (const g in heroMax) if (heroMax[g] < MIN_HERO) fails.hero.push({ scene: g, width: +heroMax[g].toFixed(3) });
  const summary = { samples: res.frames.length, minGap: Math.round(minGap), minMargin: Math.round(minMargin), minPad: Math.round(minPad), minCaptionGap: Math.round(minCapGap),
    maxWords, maxNumbers: maxNums, heroWidth: Object.fromEntries(Object.entries(heroMax).map(([k, v]) => [k, +(v * 100).toFixed(1)])),
    failCounts: Object.fromEntries(Object.entries(fails).map(([k, v]) => [k, v.length])) };
  summary.pass = Object.values(summary.failCounts).every(n => n === 0); failed = !summary.pass;
  fs.writeFileSync(path.join(WD, 'bbox.json'), JSON.stringify(Object.assign({ summary }, { fails: Object.fromEntries(Object.entries(fails).map(([k, v]) => [k, v.slice(0, 60)])) }), null, 1));
  fs.writeFileSync(path.join(WD, 'sync.json'), JSON.stringify(res.sync || [], null, 1));
  fs.writeFileSync(path.join(WD, 'events.json'), JSON.stringify(res.ev || [], null, 1));
  console.log(JSON.stringify(summary));
  for (const k in fails) if (fails[k].length) console.log('FAIL', k, JSON.stringify(fails[k].slice(0, 6)));
} finally { if (browser) await browser.close(); try { fs.unlinkSync(page_html); } catch (e) {} }
process.exit(failed ? 1 : 0);
