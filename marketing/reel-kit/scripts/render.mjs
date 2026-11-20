#!/usr/bin/env node
// Renders a reel to MP4: serves the player locally, drives it frame by frame in headless
// Chromium (window.reel.seek is a pure function of time, so capture is deterministic and can be
// split across workers), then encodes with ffmpeg and muxes the audio mix if one exists.
//
//   node marketing/reel-kit/scripts/render.mjs --reel plainwill-no-will
//   node marketing/reel-kit/scripts/render.mjs --reel plainwill-no-will --stills 0,1.5,3.2
//
// Flags: --reel <slug>  --out <file.mp4>  --workers <n>  --stills <t,t,...>  --range <a-b sec>
//        --cues (only export cues.json + timeline.resolved.json for the audio mix)
//        --cover (only write out/<slug>-cover.png)
//        --audit (only run the safe-zone check; a full render always runs it)
//        --estimate (ignore timeline.json)  --keep-frames  --no-audio  --crf <n>

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

/** Static file server rooted at the kit; binds to loopback only. */
export function serve(root = KIT) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const target = url.pathname.endsWith("/") ? path.join(file, "index.html") : file;
      const body = await readFile(target);
      res.writeHead(200, {
        "content-type": MIME[path.extname(target)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function run(cmd, argv, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ["ignore", quiet ? "ignore" : "inherit", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)),
    );
  });
}

async function launch() {
  const { chromium } = require("playwright");
  // REEL_CHROMIUM overrides the browser binary; the second path is where hosted Claude Code
  // sessions keep theirs. Locally, `npx playwright install chromium` is all that is needed.
  const candidates = [process.env.REEL_CHROMIUM, "/opt/pw-browsers/chromium"].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (err) {
    if (!executablePath) throw err;
    // fall back to Playwright's own browser, but keep the first error: it is the real cause
    try {
      return await chromium.launch();
    } catch (fallbackErr) {
      throw new Error(
        `could not launch ${executablePath}: ${err.message}\nfallback also failed: ${fallbackErr.message}`,
      );
    }
  }
}

/** Duration of an audio file in seconds, or null if it cannot be read. */
function audioDuration(file) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(Number.parseFloat(out) || null));
  });
}

async function openPlayer(browser, base, slug, estimate) {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });
  const q = `reel=../reels/${slug}&mode=render${estimate ? "&estimate=1" : ""}`;
  await page.goto(`${base}/player/index.html?${q}`);
  await page.waitForFunction(
    () => document.body.dataset.ready || document.body.dataset.error,
    null,
    {
      timeout: 30_000,
    },
  );
  const error = await page.evaluate(() => document.body.dataset.error);
  if (error) throw new Error(`player failed to start: ${error}`);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

async function capture({ page, cdp }, t) {
  await page.evaluate(
    (time) =>
      new Promise((resolve) => {
        window.reel.seek(time);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    t,
  );
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 },
  });
  return Buffer.from(data, "base64");
}

/**
 * Safe-zone check. At the settled moment of every beat (and of the end card) it measures every
 * piece of visible text in the caption, prop and end-card layers and reports any that crosses
 * the platform-safe box (LAYOUT.SAFE). Text there ends up under the app's own buttons.
 */
async function auditSafeZone({ page }) {
  return page.evaluate(async () => {
    const { LAYOUT } = await import("./js/theme.js");
    const { SAFE } = LAYOUT;
    const tl = window.reel.timeline;
    const frame = 1 / tl.fps;
    const moments = tl.beats.map((b) => ({
      label: `beat "${b.id}"`,
      t: b.end - window.reel.exitDur - 2 * frame,
    }));
    if (tl.endcard) {
      moments.push({
        label: "end card",
        t: (tl.loop ? tl.loop.start : tl.duration) - 2 * frame,
      });
    }
    const opacity = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        o *= parseFloat(cs.opacity);
      }
      return o;
    };
    const found = [];
    for (const { label, t } of moments) {
      window.reel.seek(t);
      for (const id of ["l-caption", "l-props", "l-overlay"]) {
        const walker = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (!text || opacity(node.parentElement) < 0.5) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const over = [];
          if (r.top < SAFE.top - 1) over.push(`top ${Math.round(r.top)} < ${SAFE.top}`);
          if (r.bottom > SAFE.bottom + 1)
            over.push(`bottom ${Math.round(r.bottom)} > ${SAFE.bottom}`);
          if (r.left < SAFE.left - 1) over.push(`left ${Math.round(r.left)} < ${SAFE.left}`);
          if (r.right > SAFE.right + 1) over.push(`right ${Math.round(r.right)} > ${SAFE.right}`);
          if (over.length)
            found.push(
              `${label}: "${text.slice(0, 40)}" is outside the safe zone (${over.join(", ")})`,
            );
        }
      }
    }
    window.reel.seek(0);
    return found;
  });
}

/**
 * Collision check. Samples the whole reel (every 0.2 s) and reports, once per pair:
 *  - two pieces of visible text that overlap (e.g. a counter drawn over a caption);
 *  - visible text that runs over a prop it does not belong to (a caption over a card).
 * Text is measured line by line, so a wrapped line never counts as one big box.
 */
async function auditOverlaps({ page }) {
  return page.evaluate(async () => {
    const tl = window.reel.timeline;
    const step = 0.2;
    const opacity = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        o *= parseFloat(cs.opacity);
      }
      return o;
    };
    const owner = (el) =>
      el.closest(".prop") ?? el.closest(".cap") ?? el.closest(".eyebrow") ?? el.parentElement;
    const name = (el) => {
      if (el.classList?.contains("cap")) return "caption";
      if (el.classList?.contains("prop"))
        return `prop#${[...el.parentElement.children].indexOf(el)}`;
      return el.id || el.className || el.tagName;
    };
    const hit = (a, b, pad = 2) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > pad &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > pad;
    const seen = new Map();
    const streak = new Map();
    const report = (key, msg) => {
      if (!seen.has(key)) seen.set(key, msg);
    };
    for (let t = 0; t < tl.duration; t += step) {
      window.reel.seek(t);
      const beat = [...tl.beats].reverse().find((b) => b.start <= t + 1e-6);
      const where = tl.endcard && t >= tl.endcard.start ? "end card" : `beat "${beat?.id}"`;
      const texts = [];
      for (const id of ["l-caption", "l-props", "l-overlay"]) {
        const root = document.getElementById(id);
        if (!root) continue;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (!text || opacity(node.parentElement) < 0.35) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          // line boxes of tall display fonts overlap their neighbours; test the glyph band
          const fs = parseFloat(getComputedStyle(node.parentElement).fontSize) || 16;
          for (const box of range.getClientRects()) {
            if (box.width < 2 || box.height < 2) continue;
            const inset = Math.max(0, (box.height - fs * 0.8) / 2);
            const r = {
              left: box.left,
              right: box.right,
              top: box.top + inset,
              bottom: box.bottom - inset,
            };
            texts.push({ r, text, own: owner(node.parentElement) });
          }
        }
      }
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const A = texts[i];
          const B = texts[j];
          if (A.own === B.own) continue;
          if (hit(A.r, B.r)) {
            report(
              `t:${A.text}|${B.text}`,
              `${where} at ${t.toFixed(1)}s: "${A.text.slice(0, 30)}" overlaps "${B.text.slice(0, 30)}"`,
            );
          }
        }
      }
      // text over a card it doesn't belong to, and cards over each other. A card's box includes
      // its "plate" (the glass panel drawn 44 x 34 px outside the prop body).
      const cards = [...document.querySelectorAll("#l-props .prop")]
        .filter((el) => opacity(el) > 0.5 && el.querySelector(".card, .plate, img"))
        .map((el) => {
          const body = el.querySelector(".prop-body") ?? el;
          const b = body.getBoundingClientRect();
          const k = body.offsetWidth ? b.width / body.offsetWidth : 1;
          const px = body.classList.contains("plate") ? 44 * k : 0;
          const py = body.classList.contains("plate") ? 34 * k : 0;
          const full = b.width >= 1000 && b.height >= 1800; // full-bleed artwork is a backdrop
          return {
            el,
            full,
            r: { left: b.left - px, right: b.right + px, top: b.top - py, bottom: b.bottom + py },
          };
        })
        .filter((c) => !c.full)
        // a card under a solid end-card panel is covered, not colliding
        .filter((c) => {
          const cx = (c.r.left + c.r.right) / 2;
          const cy = (c.r.top + c.r.bottom) / 2;
          for (const el of document.elementsFromPoint(cx, cy)) {
            if (c.el.contains(el)) return true;
            if (
              el.closest("#l-endback") &&
              !getComputedStyle(el).backgroundImage.includes("rgba(")
            ) {
              return false;
            }
          }
          return true;
        });
      for (const T of texts) {
        for (const c of cards) {
          if (T.own === c.el || c.el.contains(T.own)) continue;
          if (hit(T.r, c.r, 4)) {
            report(
              `c:${T.text}|${name(c.el)}`,
              `${where} at ${t.toFixed(1)}s: "${T.text.slice(0, 30)}" runs over ${name(c.el)}`,
            );
          }
        }
      }
      // two cards must overlap for three samples in a row (0.6 s) to count: one passing the
      // other during a cut is choreography, not a collision
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const key = `p:${name(cards[i].el)}|${name(cards[j].el)}`;
          if (hit(cards[i].r, cards[j].r, 4)) {
            const n = (streak.get(key) ?? 0) + 1;
            streak.set(key, n);
            if (n === 3)
              report(
                key,
                `${where} at ${t.toFixed(1)}s: ${name(cards[i].el)} and ${name(cards[j].el)} overlap`,
              );
          } else streak.delete(key);
        }
      }
    }
    window.reel.seek(0);
    return [...seen.values()];
  });
}

async function main() {
  const a = args();
  const slug = a.reel;
  if (!slug || slug === true) throw new Error("usage: render.mjs --reel <slug> [flags]");
  const reelDir = path.join(KIT, "reels", slug);
  if (!existsSync(path.join(reelDir, "reel.json"))) {
    throw new Error(`no reel.json in ${reelDir}`);
  }
  const outDir = path.join(KIT, "out");
  await mkdir(outDir, { recursive: true });
  const out = path.resolve(a.out ?? path.join(outDir, `${slug}.mp4`));
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const browser = await launch();
  let framesDir = null;

  try {
    const first = await openPlayer(browser, base, slug, a.estimate);
    const info = await first.page.evaluate(() => ({
      fps: window.reel.fps,
      frames: window.reel.frames,
      duration: window.reel.duration,
      warnings: window.reel.warnings,
      sfx: window.reel.sfx,
      timeline: window.reel.timeline,
    }));
    for (const w of info.warnings) console.warn(`warning: ${w}`);
    if (!info.timeline.measured) {
      console.warn("warning: rendering with ESTIMATED timing (no timeline.json or --estimate)");
    }
    // One clock for picture and sound: the audio mixer and subtitle writer read these. They are
    // written only by a full render or --cues, and never from estimated timing, so a quick
    // --stills or --estimate run cannot overwrite the data the mix was built from.
    const partial = a.stills || a.cover || a.range;
    if (info.timeline.measured && (a.cues || !partial)) {
      await writeFile(path.join(reelDir, "cues.json"), JSON.stringify({ sfx: info.sfx }, null, 2));
      await writeFile(
        path.join(reelDir, "timeline.resolved.json"),
        JSON.stringify(info.timeline, null, 2),
      );
    }
    if (a.cues) {
      if (!info.timeline.measured) throw new Error("--cues needs measured timing: run vo.py first");
      console.log(`cues.json + timeline.resolved.json written (${info.sfx.length} sound cues)`);
      return;
    }

    if (a.audit || !partial) {
      const issues = await auditSafeZone(first);
      for (const issue of issues) console.warn(`warning: ${issue}`);
      console.log(
        issues.length
          ? `safe-zone check: ${issues.length} piece(s) of text outside the safe zone`
          : "safe-zone check: all text inside the safe zone",
      );
      const clashes = await auditOverlaps(first);
      for (const c of clashes) console.warn(`warning: overlap: ${c}`);
      console.log(
        clashes.length
          ? `overlap check: ${clashes.length} collision(s)`
          : "overlap check: no text collisions",
      );
      if (a.audit) return;
    }

    // frame 0 doubles as the loop target for the closing dissolve
    const frame0 = await capture(first, 0);
    const loopSrc = `data:image/png;base64,${frame0.toString("base64")}`;
    const prime = async (p) => {
      await p.page.evaluate(async (src) => {
        window.reel.setLoopImage(src);
        const img = document.getElementById("loop-img");
        if (img) await img.decode().catch(() => {});
      }, loopSrc);
    };
    await prime(first);

    if (a.cover || (!a.stills && !a.range)) {
      // the cover is a real frame of the reel (hook caption fully inked), so it never misleads
      const coverT = await first.page.evaluate(() => window.reel.coverTime);
      const coverFile = path.join(outDir, `${slug}-cover.png`);
      await writeFile(coverFile, await capture(first, coverT));
      console.log(`${coverFile}  (frame at ${coverT.toFixed(2)}s)`);
      if (a.cover) return;
    }

    if (a.stills) {
      const dir = path.resolve(a["stills-dir"] ?? path.join(outDir, `${slug}-stills`));
      await mkdir(dir, { recursive: true });
      for (const t of String(a.stills).split(",").map(Number)) {
        const file = path.join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`);
        await writeFile(file, await capture(first, t));
        console.log(file);
      }
      return;
    }

    let from = 0;
    let to = info.frames;
    if (a.range) {
      const [s, e] = String(a.range).split("-").map(Number);
      from = Math.max(0, Math.round(s * info.fps));
      to = Math.min(info.frames, Math.round(e * info.fps));
    }
    const total = to - from;
    const workers = Math.max(
      1,
      Math.min(Number(a.workers ?? Math.max(1, os.cpus().length - 1)), 8),
    );
    framesDir = path.join(os.tmpdir(), `reel-frames-${slug}-${process.pid}`);
    await mkdir(framesDir, { recursive: true });

    const pages = [first];
    for (let i = 1; i < workers; i++) {
      const p = await openPlayer(browser, base, slug, a.estimate);
      await prime(p);
      pages.push(p);
    }
    let done = 0;
    const started = Date.now();
    let next = from;
    await Promise.all(
      pages.map(async (p) => {
        // workers pull the next frame index, so a slow page never stalls the others
        for (;;) {
          const f = next++;
          if (f >= to) return;
          const png = await capture(p, f / info.fps);
          await writeFile(path.join(framesDir, `${String(f - from).padStart(5, "0")}.png`), png);
          done++;
          if (done % 150 === 0 || done === total) {
            const rate = done / ((Date.now() - started) / 1000);
            console.log(`  ${done}/${total} frames (${rate.toFixed(1)} fps)`);
          }
        }
      }),
    );

    const mix = path.join(reelDir, "mix.wav");
    const withAudio = !a["no-audio"] && existsSync(mix) && !a.range;
    if (withAudio) {
      // a mix built before a timing change would silently cut off or pad the picture
      const mixDur = await audioDuration(mix);
      if (mixDur != null && Math.abs(mixDur - info.duration) > 1.5 / info.fps) {
        throw new Error(
          `mix.wav is ${mixDur.toFixed(2)}s but the reel is ${info.duration.toFixed(2)}s: re-run the cues and mix steps (or build.mjs)`,
        );
      }
    }
    const ff = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      String(info.fps),
      "-i",
      path.join(framesDir, "%05d.png"),
    ];
    if (withAudio) ff.push("-i", mix);
    ff.push(
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      // Flat graphics compress well; a low CRF with a bitrate ceiling keeps the upload inside
      // Instagram's spec (H.264 High, <= 25 Mbps) while leaving its transcoder a clean source.
      "-crf",
      String(a.crf ?? 12),
      "-maxrate",
      "20M",
      "-bufsize",
      "40M",
      "-g",
      String(info.fps * 2),
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-r",
      String(info.fps),
    );
    if (withAudio) ff.push("-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2");
    ff.push("-t", info.duration.toFixed(4));
    ff.push("-movflags", "+faststart", out);
    await run("ffmpeg", ff);
    console.log(
      `${out}  (${total} frames, ${(total / info.fps).toFixed(2)}s, ${withAudio ? "with audio" : "silent"})`,
    );
  } finally {
    await browser.close();
    server.close();
    // about a thousand full-size PNGs: clean up on failure too
    if (framesDir && !a["keep-frames"]) await rm(framesDir, { recursive: true, force: true });
    else if (framesDir) console.log(`frames kept in ${framesDir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
