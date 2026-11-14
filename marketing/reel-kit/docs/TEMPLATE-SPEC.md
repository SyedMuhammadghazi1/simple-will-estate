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
| End card  | silent                                                                                  | UI clicks only                             |
| Master    | −14.2 LUFS integrated, −0.7 dBTP, dual mono                                             | −14 LUFS, −1 dBTP                          |

## 7. The dark beat, end card and loop

- **Dark beat**: the whole frame flips to the dark palette in three frames on the swap; the board
  outline and set dressing sink to faint silhouettes, the mascot stays lit, the caption inverts,
  and the prop is a row of chips plus one huge numeral with its unit in accent italic. It is the
  shortest sentence in the reel and is followed by the longest pause (0.62 s).
- **End card**: the stage gives way to a full-frame gradient; the mascot moves to centre at
  about 1.4× scale; a two-line follow headline (second half in accent italic), the comment pill
  with the keyword typing itself and the heart turning red, one sub-line, and the handle in an
  outlined pill. No voice, no music.
- **Loop**: the last ~0.4 s cross-dissolves into frame 0, and frame 0 is "swap + 1": the hook
  caption with its first word already lit, the hook prop at rest, the mascot starting its hop.
  There is no intro, logo sting or fade from black — the reel begins mid-thought.

## 8. Where the kit deliberately departs

- **Disclosure is built into the stage.** The pad's binding strip carries an always-on fine-print
  line, and the end card has a legal line. A regulated product needs its caveats inside the
  video, not only in the caption.
- **The ask is a send first.** Instagram has named sends per reach as the strongest signal for
  reaching non-followers, and has at times treated "comment a word" prompts as engagement bait.
  The kit's last spoken line can be a share prompt (`share-sheet` prop) with the comment keyword
  shown on the silent end card and in the post caption.
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
      "words": [
        { "t0": 0.1, "t1": 0.21 },
        { "t0": 0.21, "t1": 0.61 }
      ]
    }
  ]
}
```

One `words` entry per whitespace-separated caption word, in order; `t0` is when the word starts
being spoken. Beat `start`/`end` are the swap frames.
