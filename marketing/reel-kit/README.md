# Reel kit

A code-driven template for 25–40 second vertical explainer reels: a serif "karaoke" caption that
lights up word by word with the voice, one illustrated prop per sentence on a persistent stage, a
reacting mascot, a late dark beat, a spoken follow card (with an optional comment-keyword ask),
and a seamless loop back to the first frame.

You write one JSON file. The kit generates the voiceover, times every caption word to it,
animates the scene, synthesises the sound design, and renders a 1080×1920 MP4 ready to post.

- **How the format works and why** (the reverse-engineered design system):
  [docs/TEMPLATE-SPEC.md](docs/TEMPLATE-SPEC.md)
- **Reels made with it** (each folder has a `POSTING-KIT.md`: caption, hashtags, what to check
  before posting, and a source for every claim):
  - [`reels/plainwill-no-will/`](reels/plainwill-no-will): "No will? Your state already wrote
    yours." (the `plainwill` theme)
  - [`reels/gta6-launch-week/`](reels/gta6-launch-week): an unofficial GTA 6 launch-week
    explainer (the `sunset` theme), which shows the kit on a subject that has nothing to do with
    the first one

## Quick start

```bash
npm ci                                   # the kit uses the repo's Playwright
npx playwright install chromium          # once per machine
# voice + audio (Python 3.10–3.12; Kokoro runs locally on CPU, no API key)
uv venv --python 3.12 .venv-reel && uv pip install --python .venv-reel/bin/python \
  "kokoro>=0.9.4" soundfile numpy \
  "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
export REEL_PYTHON=.venv-reel/bin/python

npm run reel:preview -- --reel plainwill-no-will   # scrub it in a browser
npm run reel:build   -- --reel plainwill-no-will   # -> marketing/reel-kit/out/<slug>.mp4
# add --export to copy the MP4, cover, subtitles and checklist PDF into reels/<slug>/export
```

`reel:build` runs: validate → voice (`vo.py`) → export sound cues → mix (`mix.py`) → render →
subtitles (`.srt`) and cover (`-cover.png`). Requires `ffmpeg` on the PATH. Each step can be run
on its own (`npm run reel:validate`, `npm run reel:render -- --reel <slug> --stills 0,1.5,3`).

## Anatomy

```
1080 × 1920
┌──────────────────────────┐
│  (Instagram header)      │  0–230     kept empty
│  EYEBROW · SERIES NAME   │  270       mono, constant
│  Caption that lights up  │  308–566   serif, 1–3 lines, accent words italic + underlined
│  word by *word.*         │
│  ┌────────────────────┐  │  712       the pad: every prop is staged here
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
  "eyebrow": "Brand · series name", // always on, top left
  "disclaimer": "Not legal advice · Laws vary by state", // always on, on the pad's binding
  "voice": { "voice": "af_heart", "speed": 0.95, "lead": 0.1, "gap": 0.22 },
  "music": { "until": "end" }, // or a beat id: the bed stops when that beat starts
  "lint": {
    "banned": ["guarantee", "/\\bfree\\b/"], // phrases this reel must never contain
    "require": [{ "field": "disclaimer", "includes": ["not legal advice"] }], // and must carry
  },
  "beats": [
    {
      "id": "hook",
      "caption": "You *already* have a will.", // *asterisks* mark accent words
      "prelit": 2, // words inked on the first frame, so the autoplay still reads as a phrase
      // "breakAfter": "will"   ends the first line after that word
      // "captionWrap": "wrap"  fills line 1 instead of balancing the lines
      "prop": { "type": "doc-stamp", "enter": "none", "span": 3 /* stays for 3 beats */ },
      "mascot": [{ "at": 0, "face": "talk", "pose": "point" }],
    },
    {
      "id": "turn",
      "mood": "dark", // whole-frame mood flip
      "caption": "Until you do, the default *is* your plan.",
      "prop": { "type": "doc-stamp", "stamp": "Default", "stampAt": "w:is" },
    },
  ],
  "endcard": {
    "headline": "Follow for grown-up stuff,\n*in plain English*", // "\n" forces a line break
    "say": "Follow for grown-up stuff, in plain English.", // spoken; the headline follows it
    "sub": "The checklist is in the caption",
    "brand": "plainwill",
    "disclaimer": "Plainwill is not a law firm.", // shown for the whole card
    "hold": 4,
    // "keyword": "WILL"  adds a typed-comment pill: see "Variants" before you use it
  },
}
```

### Variants (for testing one change)

Add named overrides under `"variants"` and build one with `--variant`:

```jsonc
"variants": {
  "list": { "endcard": { "keyword": "LIST", "sub": "Comment it. I'll send the checklist." } },
  "ask-b": { "beats": { "ask": { "caption": "Send this to someone with *no will.*" } } },
}
```

```bash
npm run reel:build -- --reel my-reel --variant list --export
```

A variant is deep-merged over the reel (objects merge, arrays and values replace, `null` removes
a key; under `beats`, entries are keyed by beat id). The merged reel is written to
`reels/<slug>--<name>/` (generated, ignored by git) and its MP4 is exported next to the original.
When a variant says the same words, the original narration is reused. Post variants as Trial
Reels, or a week apart, and keep the winner.

The comment-keyword card is the obvious first test. Instagram has named "comment a specific
word" as an example of engagement bait, and has also said that genuine deliver-something flows
are not treated that way. The default card therefore asks only for a follow, and the keyword is
a variant.

### Cues

Anything timed (`…At`, `delay`, mascot `at`, sound `at`) takes a cue:

| Cue             | Means                                          |
| --------------- | ---------------------------------------------- |
| `0.4`           | 0.4 s after the beat starts                    |
| `"w:3"`         | when the 4th word of the caption is spoken     |
| `"w:judge"`     | when the first word matching "judge" is spoken |
| `"beat:1"`      | start of the 2nd beat a spanning prop covers   |
| `"end"`         | end of the (last spanned) beat                 |
| `"w:you#2"`     | the 2nd word matching "you"                    |
| `"w:judge+0.2"` | any cue with an offset in seconds              |

Word cues are what keep the picture locked to the voice: change the wording or the voice speed
and every prop action moves with it.

### Props

| Type           | Use it for                                                                        |
| -------------- | --------------------------------------------------------------------------------- |
| `calendar`     | a date on a desk-calendar page; earlier dates on slips get struck out             |
| `doc-stamp`    | a document that gets authored, rubber-stamped and annotated                       |
| `download`     | a status card with one button that a cursor clicks; it turns into a progress bar  |
| `flip-clock`   | a digital clock that flips from one time to another on cue                        |
| `formula-card` | belongings feeding an ordered list ("a rulebook decides"; an order, never shares) |
| `gavel`        | someone else decides: gavel strikes on cue                                        |
| `meter`        | a big number over a bar that fills; can re-measure it against a bigger whole      |
| `pair`         | two people and a link that snaps, with the value that results                     |
| `price-tags`   | two or three hanging price tags that drop in on cue                               |
| `ratio-people` | "1 in 4" as avatars, with a source line                                           |
| `checklist`    | items ticked as they are spoken; an item can be a red cross (`no`) with a note    |
| `sign-doc`     | a signature writing itself, then witnesses signing                                |
| `timer`        | "this takes N minutes"                                                            |
| `share-sheet`  | shows the exact share action a "send this to…" line asks for                      |
| `stat-card`    | one big counting number                                                           |
| `note`         | the footnote chip: a caveat or a source, on screen                                |

Common fields on every prop: `x`, `y` (anchor, default pad centre), `rot`, `scale`, `span`,
`delay`, `enter` (`right` `left` `drop` `rise` `pop` `stamp` `fade` `none`), `exit` (`left`
`right` `up` `drop` `fade` `none`). Each prop's own fields are documented at the top of its
file in [`player/js/props/`](player/js/props).

To add a prop: copy a small one (`stat-card.js`), keep `update()` a pure function of time, use the
theme's CSS variables and the shared `.card` / `.tag` classes, and register it in `props/index.js`.
The contract is at the top of [`_util.js`](player/js/props/_util.js).

### Mascot

`face`: `idle` `talk` `look` `shock` `worried` `stern` `deadpan` `think` `happy` `smile` `proud`.
`pose`: `rest` `point` `pointUp` `cheer` `shrug` `gasp` `chin` `wave` `hips`.
Add `"hop": 12` to a cue for a small jump. Faces with a `talk` weight lip-flap to the voice.

### Themes

Colours are `[light, dark]` pairs in [`player/js/theme.js`](player/js/theme.js); the stage blends
between them with the current mood. Four themes ship: `sunset-city` (an animated retro-sunset city: palms, skyline, traffic, turning to neon night for `mood: "dark"`; poster captions in Anton; props float; reel.json `hud.money` adds a game-style cash counter; `music.style: "synthwave"` gives it a matching bed), `noir` (dark and minimal, no pad or mascot), `plainwill` (cream, navy and gold, a desk
with books and a photo) and `sunset` (peach, plum and magenta, a desk with game cases and a
gamepad). Props with `"plate": true` get a dark glass panel for legibility over a busy backdrop. To re-skin for another brand, copy one and change the values. A theme can also set the
mascot's colours (`mascot`), the table set (`set`) and the follow card's colours (`endcard`).
Layout numbers (safe zones, caption size, pad geometry) are in `LAYOUT`.

**Other people's brands.** When a reel is about a product you do not own (a game, a film, a
phone), use its name in plain text only: no logo, no lettering style, no screenshots, artwork or
music from it. Say on screen that the reel is unofficial (the pad's binding strip and the end
card are made for this), and keep the drawings generic: the `sunset` theme's gamepad, for
example, carries no console maker's markings.

## What the validator checks

`npm run reel:validate -- --reel <slug>` lints the script against the format's measured rules
before you spend a render on it: beat length (1.1–5 s), words per caption (≤ 14), a short hook
(≤ 3.5 s, ≤ 9 words), an accent word in every caption, something new on the pad every beat, the
dark beat in the back half, narration pace (150–205 wpm), a composed frame 0, cues that resolve
(and a warning when a word cue matches more than one word), known props, themes and mascot faces,
footnote chips that are up for under 2 s, an end card that sits in silence, any `lint.banned`
phrase anywhere a viewer can read it (including the fenced blocks of the reel's `POSTING-KIT.md`:
the caption and reply text you will paste), and the disclosures listed in `lint.require`. Every
variant is validated too.

A full render also runs a **safe-zone check**: at the settled moment of each beat and of the end
card it measures all visible text and warns about anything outside Instagram's safe box
(`LAYOUT.SAFE`). Run it alone with `node scripts/render.mjs --reel <slug> --audit`.

### Rules for a regulated brand

The Plainwill reels follow these, and the next one should too:

- The mascot is never placed on a document and never labelled. Stamps never say approved,
  certified, official, valid, notarized, filed or in effect (the reel's `lint.banned` list
  enforces this).
- Every claim that depends on a caveat carries it on screen as a `note` chip, for at least 2 s,
  inside the safe zone.
- The identity disclosure ("not a law firm") is always on, in the eyebrow; "not legal advice ·
  laws vary by state" is always on, on the pad; the full sentence is on the end card for its
  whole hold and in the subtitles.

## Voice options

`vo.py` uses [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), which runs offline
and returns word timestamps. Try `--voice am_michael`, `af_bella`, `bf_emma`, … To use a recorded
voice or another TTS instead, produce `vo.wav` and a `timeline.json` in the same shape (per beat:
`start`, `end`, and `{ t0, t1 }` for every caption word) and run the build with `--skip-vo`.

An AI voice is synthetic audio: when posting, turn on the platform's AI-content label (see the
reel's `POSTING-KIT.md`).

## Troubleshooting

- **`vo.py` stops while installing `en_core_web_sm`**: Kokoro's text front-end fetches spaCy's
  small English model with pip on first run. A `uv venv` has no pip, so install it once:
  `uv pip install --python .venv-reel/bin/python "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"`
- **`phontab: No such file or directory`**: the bundled espeak-ng could not find its data.
  `vo.py` links `~/espeak-ng-data` to the bundled copy automatically; if that link could not be
  created, make it by hand or install `espeak-ng` from your package manager.
- **`timeline.json is stale`**: the caption wording changed since the voice was generated. Run
  the build without `--skip-vo`.
- **Chromium not found**: `npx playwright install chromium`, or point `REEL_CHROMIUM` at a Chrome
  or Chromium binary.
- **A caption wraps to four lines**: it is too long for the format. Cut words; the kit shrinks it
  to fit and the render prints a warning.

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
scripts/         validate, vo (voice), mix (audio), render, build, variant, preview, print (PDF)
reels/<slug>/    reel.json, timeline.json (voice timings), POSTING-KIT.md, checklist.html,
                 export/ (the files you post)
tests/           unit tests (run with the repo's `npm run test:unit`)
```

All artwork, the mascot, the sound effects and the music bed are original to this kit and
generated from code, so there is nothing to license.
