#!/usr/bin/env node
// One command from reel.json to a postable MP4:
//
//   validate -> voice (vo.py) -> export cues -> audio mix (mix.py) -> render -> subtitles + cover
//
//   node marketing/reel-kit/scripts/build.mjs --reel plainwill-no-will
//
// Flags: --reel <slug>   --skip-vo (reuse vo.wav/timeline.json)   --python <path>
//        --workers <n>   --no-music
//        --variant <name> (build a test version defined under "variants" in reel.json)
//        --export (copy the MP4, cover, subtitles and checklist PDF to reels/<slug>/export)
// The Python steps need Kokoro (see scripts/vo.py). Set REEL_PYTHON or pass --python to point at
// the interpreter that has it installed.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { plainCaption } from "../player/js/captions.js";
import { applyVariant, spokenText } from "./variant.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, "..");

function flag(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
}

function step(title, cmd, argv) {
  console.log(`\n== ${title}`);
  const res = spawnSync(cmd, argv, { stdio: "inherit" });
  if (res.error) throw new Error(`${title}: could not run ${cmd} (${res.error.message})`);
  if (res.status !== 0) throw new Error(`${title} failed (exit ${res.status})`);
}

const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/**
 * One subtitle cue per beat, straight from the resolved timeline, plus one for the end card:
 * its spoken line and, marked as on-screen text, the disclosure it shows.
 */
export function toSrt(timeline, endcard = null) {
  const cues = timeline.beats.map((b) => [b.start, b.end - 0.02, plainCaption(b.caption)]);
  if (timeline.endcard && endcard) {
    const lines = [];
    if (endcard.say) lines.push(plainCaption(endcard.say));
    if (endcard.disclaimer) lines.push(`[On screen] ${endcard.disclaimer}`);
    if (lines.length)
      cues.push([timeline.endcard.start, timeline.duration - 0.02, lines.join("\n")]);
  }
  return (
    cues.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join("\n") +
    "\n"
  );
}

/**
 * Write reels/<slug>--<name>/reel.json for a variant. When the variant says the same words in
 * the same voice, the original's narration is reused. Returns the new slug and whether it was.
 */
async function makeVariant(baseSlug, name) {
  const baseDir = path.join(KIT, "reels", baseSlug);
  const base = JSON.parse(await readFile(path.join(baseDir, "reel.json"), "utf8"));
  const reel = applyVariant(base, name);
  const slug = `${baseSlug}--${name}`;
  const dir = path.join(KIT, "reels", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "reel.json"), JSON.stringify(reel, null, 2) + "\n");
  const voiced = ["vo.wav", "timeline.json"].every((f) => existsSync(path.join(baseDir, f)));
  const sameVoice = voiced && spokenText(base) === spokenText(reel);
  if (sameVoice) {
    for (const f of ["vo.wav", "timeline.json"]) {
      await copyFile(path.join(baseDir, f), path.join(dir, f));
    }
  }
  console.log(
    `variant "${name}" -> reels/${slug}${sameVoice ? " (same narration, voice reused)" : ""}`,
  );
  return { slug, sameVoice };
}

async function main() {
  const baseSlug = flag("reel");
  if (!baseSlug || baseSlug === true) throw new Error("usage: build.mjs --reel <slug>");
  const variant = flag("variant");
  if (variant === true) throw new Error('--variant needs a name from reel.json\'s "variants"');
  const made = variant ? await makeVariant(baseSlug, variant) : null;
  const slug = made?.slug ?? baseSlug;
  const dir = path.join(KIT, "reels", slug);
  const python = flag("python", process.env.REEL_PYTHON ?? "python3");
  const node = process.execPath;
  const script = (name) => path.join(HERE, name);

  // Before the voice step the wording may have changed, so the old timeline.json is not a
  // reason to stop: validate the script on estimated timing unless the voice is being reused.
  const reuseVoice =
    (flag("skip-vo") || made?.sameVoice) && existsSync(path.join(dir, "timeline.json"));
  step("validate", node, [
    script("validate.mjs"),
    "--reel",
    slug,
    ...(reuseVoice ? [] : ["--estimate"]),
  ]);
  if (reuseVoice) {
    console.log("\n== voice (skipped, reusing vo.wav + timeline.json)");
  } else {
    step("voice", python, [script("vo.py"), "--reel", slug]);
  }
  step("cues", node, [script("render.mjs"), "--reel", slug, "--cues"]);
  step("audio mix", python, [
    script("mix.py"),
    "--reel",
    slug,
    ...(flag("no-music") ? ["--no-music"] : []),
  ]);
  const workers = flag("workers");
  step("render", node, [
    script("render.mjs"),
    "--reel",
    slug,
    ...(workers ? ["--workers", String(workers)] : []),
  ]);

  const timeline = JSON.parse(await readFile(path.join(dir, "timeline.resolved.json"), "utf8"));
  const srt = path.join(KIT, "out", `${slug}.srt`);
  const reel = JSON.parse(await readFile(path.join(dir, "reel.json"), "utf8"));
  await writeFile(srt, toSrt(timeline, reel.endcard));
  console.log(`\n${srt}`);
  step("validate (measured timing)", node, [script("validate.mjs"), "--reel", slug]);

  if (flag("export")) {
    // the files you post, kept next to the script that made them (a variant's cut goes into
    // the original reel's export folder, under its own name)
    const exp = path.join(KIT, "reels", baseSlug, "export");
    await mkdir(exp, { recursive: true });
    await copyFile(path.join(KIT, "out", `${slug}.mp4`), path.join(exp, `${slug}.mp4`));
    if (variant) {
      // a variant gets its own subtitle file only when its words differ from the original's
      const baseSrt = path.join(exp, "captions.srt");
      const same =
        existsSync(baseSrt) && (await readFile(baseSrt, "utf8")) === (await readFile(srt, "utf8"));
      if (!same) await copyFile(srt, path.join(exp, `captions--${variant}.srt`));
    } else {
      await copyFile(path.join(KIT, "out", `${slug}-cover.png`), path.join(exp, "cover.png"));
      await copyFile(srt, path.join(exp, "captions.srt"));
      if (existsSync(path.join(dir, "checklist.html"))) {
        step("checklist", node, [
          script("print.mjs"),
          "--html",
          `reels/${slug}/checklist.html`,
          "--out",
          `reels/${slug}/export/checklist.pdf`,
          "--png",
        ]);
      }
    }
    console.log(`\nexported to ${exp}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n${err.message ?? err}`);
    process.exit(1);
  });
}
