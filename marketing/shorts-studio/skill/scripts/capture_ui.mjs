// capture_ui.mjs: record a REAL web page moving (smooth scroll, optional zoom and highlight), frame by frame, to an MP4.
// Real UI only (rules R02, R31): use it for the product site, the GitHub repo, a pricing page, a post.
// usage: node scripts/capture_ui.mjs <url> <out.mp4> [--w 1080] [--h 960] [--dur 6] [--from 0] [--to 1200] [--dpr 2]
//        [--zoom 1] [--wait 2500] [--click "css selector"] [--hide "css selector,..."]
//   or:  node scripts/capture_ui.mjs <url> <out.png> --shot "css selector" [--vw 1280] [--dpr 3]   (one real element, sharp, as a PNG
//        to animate in a scene: push in, highlight, click. Use it when a whole page would show too much text, rule R11)
//   --from/--to   scroll positions in px at the start and the end (eased, so it reads like a person scrolling)
//   --zoom        page zoom (1.25 makes small UI readable on a phone)
//   --hide        selectors to hide first (cookie banners, sign-in nags)
// Uses the headless Chrome that HyperFrames installs (run any `npx hyperframes` command once).
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';

const a = process.argv.slice(2);
if (a.length < 2) { console.log('usage: node capture_ui.mjs <url> <out.mp4> [--w 1080 --h 960 --dur 6 --from 0 --to 1200]'); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const URL_ = a[0], OUT = path.resolve(a[1]);
const W = +opt('w', 1080), H = +opt('h', 960), DUR = +opt('dur', 6), FPS = 30, DPR = +opt('dpr', 1);
const Y0 = +opt('from', 0), Y1 = +opt('to', 0), ZOOM = +opt('zoom', 1), WAIT = +opt('wait', 2500);
const H_ = os.homedir(), npx = path.join(H_, '.npm/_npx');
const pc = fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).filter(f => fs.existsSync(f))[0];
if (!pc) { console.log('puppeteer-core not found: run `npx --yes hyperframes@0.8.181 --version` once'); process.exit(2); }
const cdir = path.join(H_, '.cache/hyperframes/chrome/chrome-headless-shell');
const ver = fs.readdirSync(cdir).filter(d => d.startsWith('mac')).sort().pop();
const CHROME = path.join(cdir, ver, fs.readdirSync(path.join(cdir, ver))[0], 'chrome-headless-shell');
const { default: puppeteer } = await import(pc);
if (opt('shot', null)) {
  const b2 = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  try {
    const pg = await b2.newPage();
    await pg.setViewport({ width: +opt('vw', 1280), height: +opt('vh', 900), deviceScaleFactor: +opt('dpr', 3) });
    await pg.goto(URL_, { waitUntil: 'networkidle2', timeout: 60000 }); await new Promise(r => setTimeout(r, WAIT));
    const hide = opt('hide', ''); if (hide) await pg.addStyleTag({ content: hide.split(',').map(s => `${s}{display:none!important}`).join('\n') });
    const sel = opt('shot'); let elh = null;
    for (const h of await pg.$$(sel)) { const bb = await h.boundingBox(); if (bb && bb.width > 20 && bb.height > 20) { elh = h; break; } }   // first VISIBLE match
    if (!elh) { console.log('no element matches ' + sel); process.exit(1); }
    await elh.screenshot({ path: OUT, omitBackground: false });
    const bb = await elh.boundingBox(); console.log(`captured ${sel} on ${URL_} -> ${OUT} (${Math.round(bb.width)}x${Math.round(bb.height)} css px at ${opt('dpr', 3)}x)`);
  } finally { await b2.close(); }
  process.exit(0);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const cpid = browser.process() && browser.process().pid;   // never leave a headless Chrome behind
if (cpid) process.on('exit', () => { try { process.kill(cpid, 'SIGKILL'); } catch (e) {} });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Math.round(W / ZOOM), height: Math.round(H / ZOOM), deviceScaleFactor: DPR * ZOOM });
  await page.goto(URL_, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, WAIT));
  const hide = opt('hide', '');
  if (hide) await page.addStyleTag({ content: hide.split(',').map(s => `${s}{display:none!important}`).join('\n') });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important} *{caret-color:transparent}' });
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-g', '15', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(DUR * FPS);
  const easeIO = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  for (let i = 0; i < N; i++) {
    const u = N > 1 ? i / (N - 1) : 0;
    const y = Y0 + (Y1 - Y0) * easeIO(Math.min(1, u * 1.15));   // land a little early, then hold so it can be read
    await page.evaluate(yy => window.scrollTo(0, yy), y / ZOOM);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`captured ${URL_} -> ${OUT} (${W}x${H}, ${DUR} s, scroll ${Y0} to ${Y1})`);
} finally {
  await browser.close();
}
