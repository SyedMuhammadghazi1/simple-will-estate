#!/usr/bin/env node
// One command from reel.json to a postable MP4:
//
//   validate -> voice (vo.py) -> export cues -> audio mix (mix.py) -> render -> subtitles + cover
//
//   node marketing/reel-kit/scripts/build.mjs --reel plainwill-default-will
//
// Flags: --reel <slug>   --skip-vo (reuse vo.wav/timeline.json)   --python <path>
//        --workers <n>   --no-music
// The Python steps need Kokoro (see scripts/vo.py). Set REEL_PYTHON or pass --python to point at
// the interpreter that has it installed.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { plainCaption } from "../player/js/captions.js";

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

/** One subtitle cue per beat, straight from the resolved timeline. */
export function toSrt(timeline) {
  return (
    timeline.beats
      .map(
        (b, i) =>
          `${i + 1}\n${stamp(b.start)} --> ${stamp(b.end - 0.02)}\n${plainCaption(b.caption)}\n`,
      )
      .join("\n") + "\n"
  );
}

async function main() {
  const slug = flag("reel");
  if (!slug || slug === true) throw new Error("usage: build.mjs --reel <slug>");
  const dir = path.join(KIT, "reels", slug);
  const python = flag("python", process.env.REEL_PYTHON ?? "python3");
  const node = process.execPath;
  const script = (name) => path.join(HERE, name);

  step("validate", node, [script("validate.mjs"), "--reel", slug]);
  if (flag("skip-vo") && existsSync(path.join(dir, "timeline.json"))) {
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
  await writeFile(srt, toSrt(timeline));
  console.log(`\n${srt}`);
  step("validate (measured timing)", node, [script("validate.mjs"), "--reel", slug]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n${err.message ?? err}`);
    process.exit(1);
  });
}
