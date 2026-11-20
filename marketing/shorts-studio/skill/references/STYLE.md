# Your look

The system ships with 4 neutral presets in `styles/`: clean, night, bold, paper. They are starting points, not a brand.

To make your own, copy one to `styles/<yourname>.json` and change:
- `font`: any Google Font name (add `fonturl` if it has only one weight, like "Archivo Black").
- `accent`: your one brand colour. It colours the spoken caption word, numbers and `**marked**` words.
- `panel`, `ink`: card background and text. `ground`: the background behind the split panel.
- `caption`: caption colour. `capaccent`: the spoken-word highlight in captions (it sits on a dark band, so pick a bright one). `radius`: card corners. `titlebg`: title and end card background.

Or give Claude 1 to 3 examples you like (links or screenshots) and your colours. It writes the style for you,
describing HOW the examples look (weights, spacing, corner size, how things move) with exact hex codes.

Rules that keep any look clean: one accent colour, 3 colours on screen at most, 32 px or more between things,
no glows, no gradients that shift hue, nothing that scales up from zero.
