# plan.json: layouts and graphics

```json
{
  "format": "short",
  "short_layout": "split",
  "face": [36, 6, 68, 62],
  "keep_clear": [],
  "style": { "...": "copy from styles/<name>.json, or your own" },
  "captions": {"on": true, "max_words": 3},
  "panel": {"file": "work/screen-cut.mp4", "crop": [33, 40, 97, 100]},
  "graphics": [
    {"type": "title",   "t": 0, "text": "Update it in **one prompt**", "hold": 3.0},
    {"type": "callout", "word_i": 56, "text": "Paste **one prompt**", "hold": 2.6},
    {"type": "stat",    "word_i": 83, "value": 0, "label": "data lost", "hold": 2.6},
    {"type": "media",   "word": "result", "file": "result.png", "crop": [10, 10, 90, 90], "hold": 2.5},
    {"type": "end",     "t": 31.6, "kicker": "Comment", "text": "**UPDATE**", "hold": 2.8}
  ]
}
```

## Layouts (Short)
- `crop`: you, cropped tall around your face. Cards and captions go above or below your face.
- `split`: you in the bottom 63%, a panel on top. Captions sit on the line between them.
  Left out, the builder tries `crop` first and falls back to `split` when there is no room.

## face and keep_clear
`[left, top, right, bottom]` in percent of the recording. Read them off the gridded stills from `scripts/frames.sh`
(each square is 10%). Add room for your head and hands. Add anything you hold up to `keep_clear`.

## panel (split only)
A screen recording or picture that fills the top panel for the whole Short. Use `screen-cut.mp4` from
`scripts/follow_cut.py` so it stays in time with what you say. `crop` zooms into the part that matters
(`[left, top, right, bottom]` in percent of that file). Read it off `frames.sh` stills of the screen recording.

## graphics
Every graphic lands on a spoken word (`word`, or `word_i` = the #n number if the word repeats) or a time (`t`).
- `title`: the hook headline. 2 to 6 words. `**word**` wears the accent colour.
- `callout`: one short line with an accent bar.
- `stat`: a number that counts up, with a 1 to 3 word label. Numbers make the best cards.
- `media`: a picture or clip in the free space (`file`, optional `crop`; `"sync": true` plays a clip on the same timeline as the cut).
- `end`: the ask at the end. `kicker` small ("Comment"), `text` big ("**UPDATE**").
Rules the builder enforces: never over the face or the captions, never two cards at once, every word must exist in the transcript.

## Make it yours
These five graphic types are a starting kit. The project is plain HTML + CSS + GSAP (HyperFrames):
`templates/edit/edit.css` is the look, `templates/edit/edit.js` is the motion. Ask Claude to add your own graphic types there
(a logo sting, a progress bar, a quote card) in your style, and keep the rules above.
