# Template spec: the format, reverse-engineered

This is the design system behind the kit. It was measured, frame by frame and sample by sample,
from one reference reel (a 36.5 s, 30 fps animated explainer from a creator in the AI-tools
niche) and then generalised into rules. The kit implements the rules; **none of the reference's
artwork, mascot, fonts, palette, audio or wording is reused** — everything you see and hear in a
kit reel is original.

Numbers are given in the 1080 × 1920 design space (the reference file was a 720 × 1280 delivery
of what was almost certainly a 1080-wide master: every measurement lands on a round number at
×1.5). "Frame" means 1/30 s.

## 1. What the format is

One continuous shot of a small stage. A narrator says one sentence at a time; that sentence is on
screen in full, and lights up word by word as it is spoken. Each sentence puts one illustrated,
animated prop on the stage and takes the last one away. A mascot stands on the stage and reacts.
Nothing else ever moves: no camera, no cuts to other scenes, no stock footage.

Why it holds attention:

- **There is always a reason to keep reading.** The sentence is visible before it is spoken, so
  the eye runs ahead; the reveal pulls it back in sync. Sound-off viewers lose nothing.
- **Something new arrives every 2–3 seconds**, and inside each beat a secondary element or a
  payoff lands every 0.7–1.3 s, tied to a specific spoken word.
- **The stage never resets**, so twelve beats read as one thought rather than twelve slides.
- **It loops**: the end card dissolves back into frame 0, which is already mid-sentence.

## 2. Beat grammar

A _beat_ is one caption (one sentence, or two very short ones) and its prop.

| Measure                  | Reference                                     | Kit rule (validator)       |
| ------------------------ | --------------------------------------------- | -------------------------- |
| Beats                    | 13 + end card                                 | 7–16                       |
| Total length             | 36.5 s (34.0 s narrated + 2.4 s)              | 24–40 s sweet spot         |
| Beat length              | 1.5–4.3 s, median 2.7 s                       | 1.1–5 s                    |
| Words per caption        | 4–14, median 7                                | ≤ 14                       |
| Caption lines            | 1–3 (mostly 1–2)                              | ≤ 3, aim for 2             |
| Accent words per caption | 1–3, at least one in every beat               | 1–4                        |
| Narration pace           | 173 wpm incl. pauses (≈ 205 wpm articulation) | 150–205 wpm                |
| Pause between sentences  | 0.22–0.62 s, median 0.30 s                    | `voice.gap` + `voice.lead` |
| Hook                     | 9 words, first word on frame 1                | ≤ 9 words, ≤ 3.5 s         |
| Dark beat                | one, at 75% of the runtime                    | back half only             |

### The arc

The reference's thirteen beats, by job. A new script does not need the same count, but it needs
the same jobs in roughly this order:

| #   | Job                                     | Reference line                                                           |
| --- | --------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **Hook**: timely, concrete, a date      | "Thursday, _GTA 6_ comes out. Millions will play it."                    |
| 2   | **Twist**: the unexpected angle         | "A few will get _paid._"                                                 |
| 3–4 | **Set-up / tension**                    | "Streamers go _live_ for _eight_ hours…" / "_Nobody_ watches all eight." |
| 5   | **Insight**                             | "They watch the _thirty seconds_ where it all went wrong."               |
| 6   | **Proof / stakes** (with a caveat chip) | "And some streamers _pay_ whoever cuts that clip."                       |
| 7   | **The catch** (labelled as such)        | "The _catch?_ Finding that moment eats hours."                           |
| 8   | **Solution found**                      | "So I found a _free_ tool on GitHub. _OpenShorts._"                      |
| 9   | **How it works**, in three verbs        | "…finds the _moment,_ crops it _vertical,_ and adds _captions._"         |
| 10  | **Payoff ratio**                        | "_One_ stream in. _Ten clips_ out."                                      |
| 11  | **Dark beat**: the stake, in 5 words    | "But you've got _one week._"                                             |
| 12  | **Why now**                             | "Launch week, everyone's searching _GTA 6._"                             |
| 13  | **Ask**: comment a keyword              | "_Comment GTA,_ I'll send you the _tool._"                               |
| —   | **End card** (silent) → loop            | "Follow for _one … use case a day_" + the comment being typed            |

Things worth copying from how it is written: every sentence is short enough to say in one breath;
numbers are concrete; the caveat ("only clip streamers who allow it") is on screen as a small
chip rather than hidden; the ask is shown as the action itself (a comment being typed and liked).

## 3. Layout and safe zones

```
  0 ─┬───────────────────────────  empty (platform header)                  13.6%
261 ─┤ EYEBROW        mono caps, constant for the whole reel
316 ─┤ Caption        serif, top-anchored, 1–3 lines, left-aligned at x 72
     │                (≥ 45 px clear between caption and any prop)
710 ─┤ ┌─ board ───────────────┐  900 × 624, x 90–990; props may overhang its top
     │ │        prop zone      │  by up to ~160 px and its sides freely
     │ │ mascot         set    │  mascot bottom-left, set dressing bottom-right
1336─┤ └───────────────────────┘  desk edge
     │   empty desk                nothing is ever placed here               29.1%
1920─┴───────────────────────────
```

- All meaning sits in **y 13.6%–71%, x 6.7%–92.5%**. The empty desk is where Instagram draws the
  username, caption and audio; the empty top is where it draws its header.
- Meta's only published Reels safe zone (for ads) is stricter at the bottom: keep text and logos
  inside **y 269–1248, x 65–1015**. The kit keeps everything that must be _read_ inside that box
  (`LAYOUT.SAFE` in `player/js/theme.js`; toggle "safe zones" in the preview) and lets scenery run
  lower, as the reference does.
- The caption block is top-anchored: line 1 sits on the same baseline whether the caption has
  one line or three, so nothing jumps between beats.

## 4. Type and colour

| Role             | Reference                                                           | Kit (original choice)                              |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Caption          | Newsreader 500, 78 px, −0.025 em, line 87 px                        | Fraunces 560, 68 px, line 86 px                    |
| Accent word      | same face, synthesised oblique, terracotta, 5 px underline per word | Fraunces italic 600, accent colour, 5 px underline |
| Unspoken words   | ink at 35% opacity (accent words italic but grey)                   | theme `ghost`                                      |
| Eyebrow / labels | JetBrains Mono 500, 24 px, +0.18 em, caps                           | DM Mono 500, 23 px, +0.2 em                        |
| UI text in props | Inter 400–800                                                       | Inter (variable)                                   |
| Big numerals     | caption serif, 246 px, unit word in accent italic                   | Fraunces 104–118 px                                |

Colour logic (not the colours themselves): a warm off-white ground with one soft corner glow; one
near-black ink used for all text, outlines and hard shadows; **one** accent hue for emphasis; two
or three supporting hues that only appear inside props; a dark variant of every token for the mood
flip. The kit's theme uses the product's navy and amber on paper white.

Prop construction ("paper stickers"): flat fills, a uniform 4 px ink outline with round joins,
16–24 px corner radii, a **hard** offset shadow (9 px right, 9–10 px down, zero blur) on hero
cards and none on small tags, resting tilts of ±2–7° (never exactly 0 on a card). No gradients,
no soft shadows, no textures.

## 5. Motion

Everything below was measured on individual frames. `C` is the frame the caption changes — the
**swap frame**, the master clock of a beat.

```
C−4 … C−1   old prop leaves (4 frames)
C           caption hard-cuts to the new sentence, all grey · old prop is gone ·
            new prop is already arriving · mascot swaps pose and starts a hop
C+1         first word lights up
C+3 (≈0.1s) narrator starts the sentence
C+10        prop has visually landed          C+15  fully at rest
…           one payoff inside the prop, cued by a specific word
last word   picture holds 0.3–0.6 s, then the cycle repeats
```

- **Caption swap**: a hard cut. No fade, no slide. The whole new sentence is laid out at its
  final wrap for exactly one frame before anything lights up; layout never reflows.
- **Word reveal**: the colour flips in **one frame** (no fade), ~50 ms before the word is spoken
  (median; three-quarters of words light up before they are heard). On that frame the word sits
  7.5 px low and rises linearly to rest over 5 frames. Accent words flip to the accent colour and
  their underline appears at full width on the same frame — it is not drawn on.
- **Prop enter**: from the right, starting on the swap frame with its leading edge at the frame
  edge; position follows a critically damped spring, `1 − (1 + 15t)·e^(−15t)`: about 90% in 8
  frames, at rest in 15. **No overshoot or bounce anywhere.** It arrives with ~8° of extra tilt
  and ~20 px of blur, both decaying on the same curve.
- **Prop exit**: always to the left, starting exactly 4 frames before the swap, at a constant
  180 px per frame, gaining ~4.5 px of blur per frame, fully opaque, removed on the swap frame
  while still partly on screen. Old and new props are never visible together and the stage is
  never empty for more than the swap frame.
- **Secondary elements** (tags, chips, badges): a "blur-pop" in place — opacity 0→1, scale
  ~0.55→1, blur→0 over 10 frames, ease-out — starting 1–2 frames after their trigger word.
  Full-width elements fade in place over 5 frames. Small UI changes cut in one frame.
- **Counters** run on smoothstep and are tuned to land 2–4 frames before the prop leaves.
- **Something always loops**: every hero prop carries a constant-rate micro-motion (scrolling
  road dashes, clock hands, a caret) so no frame is ever frozen.
- **Mascot**: one pose and expression per beat, swapped on the swap frame with a hop (36 px, five
  frames up, five down, a 3–5 px squash on landing). Mouth lip-syncs to the voice and relaxes to
  the pose's rest mouth in pauses. A three-frame blink about every three seconds. It looks or
  points at the active prop and is always the top layer under the caption.
- **Stage**: pixel-static for the entire reel. No camera move, zoom, shake or flash.

## 6. Sound

| Layer     | Reference                                                                               | Kit                                        |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Voice     | dry, close, heavily levelled; starts on frame 1; no breaths                             | Kokoro TTS (or your own recording)         |
| Music     | quiet lo-fi loop, one chord per bar, 15–20 dB under the voice; **stops before the ask** | synthesised original four-bar loop, −19 dB |
| Cut sound | the same soft 0.65 s low swell on every caption cut                                     | `cut`                                      |
| Effects   | sparse and literal: tied to a prop action or the key word of the beat                   | per-prop `sfx()` hooks                     |
| Dark beat | the one loud effect: a low boom and a held rumble                                       | `sub` + `drone`                            |
| End card  | silent                                                                                  | spoken follow line over the bed (optional) |
| Master    | −14.2 LUFS integrated, −0.7 dBTP, dual mono                                             | −14 LUFS, −1 dBTP                          |

## 7. The dark beat, end card and loop

- **Dark beat**: a near-opaque dark layer fades in linearly over four frames starting on the swap
  and fades out over the three frames _before_ the next swap, so the following beat opens fully
  lit. Board outline and set dressing sink to faint ghosts; the mascot and the beat's props stay
  at full brightness above the layer; the caption inverts. Props here pop or scale in and fade
  out (five frames) instead of sliding. In the reference it is the shortest sentence in the reel
  (five words), its prop is a row of date chips popping on two frames apart plus one huge numeral
  with its unit in accent italic, and it is followed by the longest pause (0.62 s).
- **End card** (reference): a hard cut from the stage to a full-frame sky gradient. Build order
  after the cut: +0.03 s the mascot pops in at centre (about 1.45× stage size, scale 0→1 in ten
  frames with a small landing); +0.23 s the headline, one word every two frames (fade, 30 px
  rise); +0.50 s the comment card; +0.63 s the handle pill; +0.77 s the keyword types itself at
  two frames per character with a blinking caret; +0.83 s the sub-line fades in; +1.10 s the
  heart turns red. Everything is settled for barely 0.6 s. No voice, no music, no effects.
- **Loop**: at +1.90 s a nine-frame linear cross-dissolve to a _frozen_ frame 0. Frame 0 is
  "swap + 1": the hook caption with its first word already lit, the hook prop at rest, the mascot
  about to hop. There is no intro, logo sting or fade from black — the reel begins mid-thought,
  with the voice on frame 1.
- **Mascot bookkeeping**: exactly one hop per swap (lift-off one frame after it), a three-frame
  blink on a fixed 97-frame timer, the pose catalogue reused across beats (cheer for reveals,
  point for demonstrations, wink-and-point for the playful beats, heavy-lidded deadpan for the
  problem and the dark beat).

The kit's own end card keeps the build order but not the hard cut: the table rises to fill the
frame and the mascot hops to centre, which keeps the "one continuous shot" promise to the end. It
is spoken rather than silent and holds longer, because it carries a legal line that has to be
readable (see section 8).

## 8. Where the kit deliberately departs

Sections 1–7 describe the reference. The kit follows them except here:

- **Disclosure is built into the stage.** The eyebrow and the pad's binding strip are on screen
  for the whole reel, so they carry what must always be readable (who is speaking, and that it is
  not advice); the end card shows the full sentence for its whole hold, and the subtitle file
  repeats it. A regulated product needs its caveats inside the video, not only in the caption.
  Props are staged below the strip so it is never covered. `lint.require` in reel.json makes the
  validator fail a reel whose disclosures have been removed.
- **Footnotes are first-class.** The reference shows one caveat chip; the kit has a `note` prop
  and expects one wherever a claim needs a hedge or a source, set at the reference's footnote
  size (27 px), kept inside the safe zone and on screen for at least 2 s (the validator and the
  render's safe-zone check enforce both).
- **The ask is a send first, and the keyword is optional.** Instagram has named sends per reach
  as the strongest signal for reaching non-followers, and has given "comment a specific word" as
  an example of engagement bait (while saying genuine deliver-something flows are not treated
  that way). The kit's last spoken line is a share prompt (`share-sheet` prop). Its default end
  card asks only for a follow; `endcard.keyword` adds the reference's typed-comment pill, and is
  meant to be tested as a variant (`build.mjs --variant`) rather than assumed.
- **The end card is spoken.** The reference's card is 2.3 s of silence. The kit's carries a legal
  line that needs reading time, and several seconds of silence at the end costs completion, so
  `endcard.say` gives the card a voiced line: the headline's words appear as they are spoken, the
  mascot says them, and the music bed runs to the loop (`music.until: "end"`).
- **The hook can open on a phrase.** The reference lights one word on frame 0. `prelit` inks the
  first few words from the first frame, so the autoplay still reads "No will?" rather than "No".
  Unlit words are also a little darker than a 35% tint (about 2.4:1 on the wall), for the same
  reason: frame 0 has to be legible as a still.
- **More idle motion.** A drawn stage is stiller than the reference's 3D one, so props keep a
  slow loop between their cued events (a document rocks, a gavel sways, the mascot bobs), and
  cues are spread so something lands roughly every second.
- **Pre-roll.** A travelling prop starts two frames before the swap, so its first pixels are on
  screen on the cut. For those two frames the new prop is entering at the right edge while the
  old one is clearing the left (the reference keeps them strictly apart and accepts a nearly
  empty stage on the swap frame).
- **Dark beat.** The pad and its outline are re-coloured from the dark palette rather than dimmed
  to a ghost, and the beat's prop is drawn in the dark palette too. Text and outlines flip at the
  midpoint of the fade instead of fading, so the caption never passes through the wall colour.
- **End card.** The table rises to fill the frame and the mascot hops to centre (no hard cut);
  the legal line comes in with the card and stays for all of it; the stack is laid out from its
  measured heights so it always ends inside the safe zone.
- **Mascot.** A beat may add a second expression on a word (a reaction), where the reference
  holds one pose per beat; arm changes and the end card's heart are allowed a small overshoot.
  "No overshoot" applies to props.
- **Original everything**: its own stage (a ruled pad on a table), mascot (a gold rosette),
  typefaces, palette, props, sound effects and music.

## 9. `timeline.json`

Written by `scripts/vo.py`; write it yourself to use a recorded voice.

```json
{
  "fps": 30,
  "duration": 28.3,
  "beats": [
    {
      "id": "hook",
      "start": 0.0,
      "end": 1.43,
      "vo": [0.1, 1.23],
      "text": "No will?",
      "words": [
        { "t0": 0.1, "t1": 0.21 },
        { "t0": 0.21, "t1": 0.61 }
      ]
    }
  ],
  "endcard": {
    "text": "Follow for more.",
    "vo": [26.4, 27.6],
    "words": [
      { "t0": 26.4, "t1": 26.8 },
      { "t0": 26.8, "t1": 27.0 },
      { "t0": 27.0, "t1": 27.6 }
    ]
  }
}
```

One `words` entry per whitespace-separated caption word, in order; `t0` is when the word starts
being spoken. Beat `start`/`end` are the swap frames. `text` is the wording the timings belong
to: the player refuses a timing file whose text no longer matches the caption. `endcard` is
present only when the reel has `endcard.say`.
