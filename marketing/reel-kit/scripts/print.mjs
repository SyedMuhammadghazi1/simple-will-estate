#!/usr/bin/env node
// Prints an HTML page from the kit to a one-page PDF (and a PNG preview), e.g. the checklist a
// reel's call to action promises.
//
//   node marketing/reel-kit/scripts/print.mjs --html reels/<slug>/checklist.html \
//        --out reels/<slug>/export/checklist.pdf        (add --png for a preview image)

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "./render.mjs";

const require = createRequire(import.meta.url);
const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const html = arg("html");
const out = arg("out");
if (!html || !out || !out.endsWith(".pdf")) {
  console.error("usage: print.mjs --html <path under the kit> --out <path under the kit>.pdf");
  process.exit(1);
}
const outPath = path.resolve(KIT, out);
await mkdir(path.dirname(outPath), { recursive: true });

const { chromium } = require("playwright");
const executablePath = [process.env.REEL_CHROMIUM, "/opt/pw-browsers/chromium"]
  .filter(Boolean)
  .find((p) => existsSync(p));
const { server, port } = await serve();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({
    viewport: { width: 816, height: 1056 },
    deviceScaleFactor: 2,
  });
  const res = await page.goto(`http://127.0.0.1:${port}/${html.replace(/^\/+/, "")}`);
  if (!res?.ok()) throw new Error(`could not load ${html} (${res?.status() ?? "no response"})`);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  if (overflow > 2) console.warn(`warning: content overflows the page by ${overflow}px`);
  await page.pdf({
    path: outPath,
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  if (process.argv.includes("--png")) {
    await page.screenshot({ path: outPath.replace(/\.pdf$/, ".png") });
  }
  console.log(outPath);
} finally {
  await browser.close();
  server.close();
}
