// Variants: small named overrides of a reel, for testing one change against the original
// (Instagram's Trial Reels, or simply posting two cuts a week apart). They live in reel.json:
//
//   "variants": {
//     "list": { "about": "keyword end card", "endcard": { "keyword": "LIST", "sub": "..." } },
//     "ask-b": { "beats": { "ask": { "caption": "Send this to someone with *no will.*" } } }
//   }
//
// A variant is deep-merged over the reel: objects merge, arrays and plain values replace, and
// null removes a key. Under "beats", entries are keyed by beat id (null removes the beat).
// `build.mjs --reel <slug> --variant <name>` writes the merged reel to reels/<slug>--<name>/
// (a generated folder, ignored by git) and builds it like any other reel.

import { plainCaption } from "../player/js/captions.js";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function merge(base, patch) {
  if (!isObject(base) || !isObject(patch)) return structuredClone(patch);
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = key in base ? merge(base[key], value) : structuredClone(value);
  }
  return out;
}

export function variantNames(reel) {
  return Object.keys(reel.variants ?? {});
}

export function applyVariant(reel, name) {
  const spec = reel.variants?.[name];
  if (!spec) {
    const have = variantNames(reel).join(", ") || "none";
    throw new Error(`reel "${reel.id}" has no variant "${name}" (have: ${have})`);
  }
  const { about: _about, beats: beatPatches = {}, ...rest } = spec;
  const { variants: _variants, ...base } = reel;
  const out = merge(base, rest);
  out.id = `${reel.id}--${name}`;
  const ids = new Set(reel.beats.map((b) => b.id));
  for (const id of Object.keys(beatPatches)) {
    if (!ids.has(id))
      throw new Error(`variant "${name}" patches beat "${id}", which does not exist`);
  }
  out.beats = reel.beats.flatMap((beat) => {
    if (!(beat.id in beatPatches)) return [structuredClone(beat)];
    const patch = beatPatches[beat.id];
    return patch === null ? [] : [merge(beat, patch)];
  });
  return out;
}

/** Everything the voice step depends on: if two reels agree on this, they can share a voice. */
export function spokenText(reel) {
  return JSON.stringify({
    voice: reel.voice ?? null,
    beats: reel.beats.map((b) => [
      b.say ?? null,
      plainCaption(b.caption),
      b.lead ?? null,
      b.gap ?? null,
      b.speed ?? null,
    ]),
    endcard: reel.endcard
      ? [reel.endcard.say ?? null, reel.endcard.hold ?? null, reel.endcard.lead ?? null]
      : null,
  });
}
