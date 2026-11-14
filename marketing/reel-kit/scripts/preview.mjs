#!/usr/bin/env node
// Serves the player for live preview: scrub, play with audio, toggle the Instagram safe zones.
//
//   node marketing/reel-kit/scripts/preview.mjs --reel plainwill-default-will

import { serve } from "./render.mjs";

const i = process.argv.indexOf("--reel");
const slug = i > 0 ? process.argv[i + 1] : "plainwill-default-will";
const { port } = await serve();
console.log(`preview: http://127.0.0.1:${port}/player/index.html?reel=../reels/${slug}`);
console.log("add &estimate=1 to preview before the voice step has run. Ctrl+C to stop.");
