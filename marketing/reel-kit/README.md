# Reel kit

A code-driven template for 25–40 second vertical explainer reels: a serif "karaoke" caption that
lights up word by word with the voice, one illustrated prop per sentence on a persistent stage, a
reacting mascot, a late dark beat, a comment-keyword end card, and a seamless loop back to the
first frame.

You write one JSON file. The kit generates the voiceover, times every caption word to it,
animates the scene, synthesises the sound design, and renders a 1080×1920 MP4 ready to post.

- **How the format works and why** (the reverse-engineered design system):
  [docs/TEMPLATE-SPEC.md](docs/TEMPLATE-SPEC.md)
- **The first reel made with it**: [`reels/plainwill-default-will/`](reels/plainwill-default-will)
  (its caption, hashtags, comment-reply text and source list are in `POSTING-KIT.md` there)

## Quick start

```bash
npm ci                                   # the kit uses the repo's Playwright
npx playwright install chromium          # once per machine
# voice + audio (Python 3.10–3.12; Kokoro runs locally on CPU, no API key)
uv venv --python 3.12 .venv-reel && uv pip install --python .venv-reel/bin/python \
  "kokoro>=0.9.4" soundfile numpy
export REEL_PYTHON=.venv-reel/bin/python

npm run reel:preview -- --reel plainwill-default-will   # scrub it in a browser
npm run reel:build   -- --reel plainwill-default-will   # -> marketing/reel-kit/out/<slug>.mp4
```

`reel:build` runs: validate → voice (`vo.py`) → export sound cues → mix (`mix.py`) → render →
subtitles (`.srt`) and cover (`-cover.png`). Requires `ffmpeg` on the PATH. Each step can be run
on its own (`npm run reel:validate`, `npm run reel:render -- --reel <slug> --stills 0,1.5,3`).

## Anatomy

```
1080 × 1920
┌──────────────────────────┐
│  (Instagram header)      │  0–230     kept empty
│  EYEBROW · SERIES NAME   │  252       mono, constant
│  Caption that lights up  │  292–550   serif, 1–3 lines, accent words italic + underlined
│  word by *word.*         │
│  ┌────────────────────┐  │  706       the pad: every prop is staged here
│  │      [ prop ]      │  │
│  │ mascot        set  │  │
│  ├────────────────────┤  │  1338      table edge
│  │                    │  │
│  │  table (empty)     │  │  1338–1920 sits under Instagram's caption, audio and action rail
│  └────────────────────┘  │
└──────────────────────────┘
```

Nothing cuts except the caption and the prop. That continuity is what lets a dozen beats in
thirty seconds feel like one shot rather than a slideshow.

## Writing a reel

Create `reels/<slug>/reel.json`:

```jsonc
{
  "id": "my-reel",
  "theme": "plainwill",
  "eyebrow": "Brand · series name",
  "voice": { "voice": "af_heart", "speed": 0.95, "lead": 0.1, "gap": 0.22 },
  "music": { "until": "cta" }, // the bed stops when this beat starts
  "lint": { "banned": ["guarantee"] }, // phrases this reel must never contain
  "beats": [
    {
      "id": "hook",
      "caption": "You *already* have a will.", // *asterisks* mark accent words
      "prop": { "type": "doc-stamp", "enter": "none", "span": 3 /* stays for 3 beats */ },
      "mascot": [{ "at": 0, "face": "talk", "pose": "point" }],
    },
    {
      "id": "turn",
      "mood": "dark", // whole-frame mood flip
      "caption": "Until you do, the default *is* your plan.",
      "prop": { "type": "doc-stamp", "stamp": "In effect", "stampAt": "w:is" },
    },
  ],
  "endcard": {
    "headline": "Follow for grown-up stuff, *in plain English*",
    "keyword": "WILL",
    "sub": "Comment it and I'll send the checklist",
    "brand": "plainwill",
  },
}
```

### Cues

Anything timed (`…At`, `delay`, mascot `at`, sound `at`) takes a cue:

| Cue             | Means                                          |
| --------------- | ---------------------------------------------- |
| `0.4`           | 0.4 s after the beat starts                    |
| `"w:3"`         | when the 4th word of the caption is spoken     |
| `"w:judge"`     | when the first word matching "judge" is spoken |
| `"beat:1"`      | start of the 2nd beat a spanning prop covers   |
| `"end"`         | end of the (last spanned) beat                 |
| `"w:judge+0.2"` | any cue with an offset in seconds              |

Word cues are what keep the picture locked to the voice: change the wording or the voice speed
and every prop action moves with it.

### Props

| Type           | Use it for                                                    |
| -------------- | ------------------------------------------------------------- |
| `doc-stamp`    | a document that gets authored, rubber-stamped and annotated   |
| `formula-card` | belongings feeding a ranked list ("a rulebook decides")       |
| `gavel`        | someone else decides: gavel strikes on cue                    |
| `pair`         | two people and a link that snaps, with the value that results |
| `ratio-people` | "1 in 4" as avatars, with a source line                       |
| `checklist`    | three or four items ticked as they are spoken                 |
| `sign-doc`     | a signature writing itself, then witnesses signing            |
| `timer`        | "this takes N minutes"                                        |
| `share-sheet`  | shows the exact share action a "send this to…" line asks for  |
| `stat-card`    | one big counting number                                       |
| `note`         | the footnote chip: a caveat or a source, on screen            |

Common fields on every prop: `x`, `y` (anchor, default pad centre), `rot`, `scale`, `span`,
`delay`, `enter` (`right` `left` `drop` `rise` `pop` `stamp` `fade` `none`), `exit` (`left`
`right` `up` `drop` `pop` `fade` `none`). Each prop's own fields are documented at the top of its
file in [`player/js/props/`](player/js/props).

To add a prop: copy a small one (`stat-card.js`), keep `update()` a pure function of time, use the
theme's CSS variables and the shared `.card` / `.tag` classes, and register it in `props/index.js`.
The contract is at the top of [`_util.js`](player/js/props/_util.js).

### Mascot

`face`: `idle` `talk` `look` `shock` `worried` `stern` `think` `happy` `smile` `proud`.
`pose`: `rest` `point` `pointUp` `cheer` `shrug` `gasp` `chin` `wave` `hips`.
Add `"hop": 12` to a cue for a small jump. Faces with a `talk` weight lip-flap to the voice.

### Themes

Colours are `[light, dark]` pairs in [`player/js/theme.js`](player/js/theme.js); the stage blends
between them with the current mood. To re-skin for another brand, copy the `plainwill` theme and
change the values. Layout numbers (safe zones, caption size, pad geometry) are in `LAYOUT`.

## What the validator checks

`npm run reel:validate -- --reel <slug>` lints the script against the format's measured rules
before you spend a render on it: beat length (1.1–5 s), words per caption (≤ 14), a short hook
(≤ 3.5 s, ≤ 9 words), an accent word in every caption, something new on the pad every beat, the
dark beat in the back half, narration pace (150–205 wpm), a composed frame 0, resolvable cues,
known props and mascot faces, and any `lint.banned` phrases.

## Voice options

`vo.py` uses [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), which runs offline
and returns word timestamps. Try `--voice am_michael`, `af_bella`, `bf_emma`, … To use a recorded
voice or another TTS instead, produce `vo.wav` and a `timeline.json` in the same shape (per beat:
`start`, `end`, and `{ t0, t1 }` for every caption word) and run the build with `--skip-vo`.

An AI voice is synthetic audio: when posting, turn on the platform's AI-content label (see the
reel's `POSTING-KIT.md`).

## Files

```
player/          the scene (HTML/CSS/SVG). window.reel.seek(t) draws the frame at time t.
  js/timing.js     easing, springs, keyframes, seeded randomness
  js/timeline.js   reel.json + voice timings -> absolute times; cue resolution
  js/captions.js   karaoke captions
  js/stage.js      wall, pad, table, set dressing, mood
  js/mascot.js     the mascot
  js/motion.js     shared enter/exit choreography
  js/endcard.js    end card + loop dissolve
  js/props/        prop library
  fonts/           Fraunces, Inter, DM Mono (SIL OFL 1.1, licences included)
scripts/         validate, vo (voice), mix (audio), render, build, preview
reels/<slug>/    reel.json, timeline.json (voice timings), export/ (final cut)
tests/           unit tests (run with the repo's `npm run test:unit`)
```

All artwork, the mascot, the sound effects and the music bed are original to this kit and
generated from code, so there is nothing to license.
