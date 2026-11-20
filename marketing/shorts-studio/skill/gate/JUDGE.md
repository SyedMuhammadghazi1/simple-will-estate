# JUDGE.md: the eye test (layer 2 of the slop gate)

check.py measures what code can measure. This rubric covers what it cannot: meaning, taste and cliches.
Every FAIL question below comes from a real verdict Jack gave, quoted. The WARN questions come from research
(his top Shorts, Nick Saraev, Kallaway, 20 Instagram outlier reels): they never block a ship on their own,
but write them in the fix list.

## How to run it

1. Run check.py first. It writes `<out>/contact.jpg`: 2 frames a second, failing frames framed in red,
   footage ranges tagged FOOTAGE.
2. Open `board.jpg` (next to this file). Left = GREAT (loved or proven). Right = SLOP (rejected, his words).
   Look at it before you look at the video. Hold the board in mind for every scene.
3. Split the contact sheet into scenes (a scene = one visual idea, usually 1 to 4 s).
4. For every scene, answer every FAIL question YES or NO. YES = good. Any NO = FAIL, with the time.
   Answer as Jack would on a phone, not as the builder: if you have to explain why it works, it is a NO.
5. Write the answers to `<out>/judge.json`:
   `[{"t0": 4.0, "t1": 5.5, "q": "J5", "answer": "NO", "why": "arrow points at empty laptop, not at Meet Grok Bot"}]`
   (only NOs and WARNs are needed; an empty list means every scene passed).
6. The video ships only when check.py prints GATE PASS and judge.json has no NO.

Do not grade your own work kindly. A borderline scene is a NO. Jack rejected round 5 after it passed every
measured gate ("AI sloppy"), so the eye test is where most slop is caught.

## FAIL questions (each tied to a verdict)

| # | Question (YES = good) | Verdict it comes from |
|---|---|---|
| J1 | **One hero.** Is the screen ONE cohesive visual that fills its panel, with small details around it, not stacked panels or a small card floating in empty space? | r5 short "AI sloppy": the dense dark 3-panel editor; rule "ONE SCREEN, ONE IMAGE"; "Graphics must be big and visual, not small cards floating in empty space" |
| J2 | **Real, not placeholder.** Are logos, UI and footage real (the actual product, the actual logo), never grey bars, wireframes, or a generic stand-in? | r3 short "shockingly bad" (grey wireframe placeholders); "Show the real thing" |
| J3 | **Show, don't echo.** Does each graphic SHOW the idea, instead of typing the word he just said or adding a label chip? (Big centred kinetic text of his words is the one exception.) | r5 intro "if I say a word, you do it"; "logos speak for themselves (no 'New AI startup' label)"; r6 "Easy part ... looks a bit lazy"; 20 Oct "It's called" cards looked pointless |
| J4 | **No AI cliches.** Is it free of crossed-out icons, restart or refresh arrows used as a metaphor, sparkle stars, generic glowing orbs, and the orange-on-black "one prompt" look? | r6 short 28.5 to 31 s (crossed-out restart icon): "Animations at 30 seconds look like AI slop to me"; r6 intro "the sparkle star on the Glaido logo, and decorative corner stars in general"; the enemy look Jack chose (20 Oct): every one-prompt video has the same orange-and-black look |
| J5 | **Pointers point.** Does every arrow, cursor, line or ring touch the exact thing it is about? | r6 intro "hours saved" arrow: "the arrow doesn't make any sense" |
| J6 | **It does something.** Does the visual change, reveal or pay off while he talks (not a static card that just sits there)? | r6 intro Spam Shield card "isn't that interesting"; reels: "craft with no payoff" sits at 1.1 to 1.8x |
| J7 | **Calm proof.** Are credentials and numbers shown as one clean visual (a logo, real footage, one number), not chips, stamps, avatar rings or a busy count-up? | r6 intro "Built & sold / 60,000 customers": "not a big fan, there's a better way to show this"; r7 intro 60,000 + avatars + SOLD stamp: "I don't like this graphic, not a massive fan" |
| J8 | **Progress is a picture.** Is a sequence or level-up shown as something moving (a track filling, characters stepping up, bars rising), not a text counter ticking? | r6 intro "Level 2 ... Level 6": "a better levelling animation would be better"; r7 7-node level-up track: "amazing" |
| J9 | **His colours.** Are his orange #FF8000 and blue #2B7EF9 visible as real accents inside the graphic (fills, rings, chips), plus real logo colours, never grey-on-grey? | r5 short "What happened to my orange and blue?"; r7 rising bars "wants colours" |
| J10 | **Room to breathe.** Is there clear space around every element: nothing touching, nothing jammed against an edge, captions clear of graphics? | 20 Oct "spacing is where it really gets its ass kicked"; r5 "no spacing", "needs spacing rules" |
| J11 | **Type.** At most 3 words per graphic, Switzer (plus one Emilio italic accent at most), every headline centred? | r5 "too much text (max 3 words per graphic)"; r7 "I told you I wanted all text centralised"; r5 intro "Don't forget to use my font" |
| J12 | **Camera is calm.** Does his picture hold still (no punch-ins, drifts, fast zoom-in-and-out transitions), with every jump cut covered by a second angle or a graphic? | r5 intro "weird camera jumping around", "keeps zooming in"; r6 intro "fast zoom in and out transitions makes you feel nauseous, too much happening"; "you should never have a naked cut" |
| J13 | **His face.** Is his face visible and on the lens whenever he is on screen, never covered, never a silent stare, never the back of his head or a side angle? | r5 intro over-the-shoulder shot; r7 "remove the b-roll where I'm looking off to the side"; r6 short 10 s "just looking at the camera, not doing anything"; 20 Oct "never put graphics over his face" |
| J14 | **Means something, follows him.** Does the graphic match what he is saying at that moment, and does it land on the word it illustrates? | 20 Oct showcase: "graphics must mean something for the shot", desk UI "had nothing to do with what he was saying"; SYNC rule "within 2 frames" |
| J15 | **Ship it.** Would a design studio ship this frame next to the GREAT side of the board, and does it belong with the frames before and after (one visual system)? | 20 Oct "one visual system ... genuinely beautiful"; r7 Grok Bot scene "amazing, how did you do that?" is the bar |
| J16 | **Continuity (R25).** Does each graphic grow out of the one before it (the same elements move, sink, turn, regroup) instead of a hard cut from one unrelated graphic to another? | intro r9: "motion graphic continuity ... the seven levels go up, then down, then rotate, so everything feels fully connected into one motion" |
| J17 | **One ground (R26).** Is every graphic on his white dot grid with the soft orange glow bottom-left and blue glow bottom-right, with orange and blue inside the graphics, never full-screen colour blocks? | short r9: "show our white dotted background with the orange and the blue; that's really tasty" |
| J18 | **Concrete example (R27).** Does the graphic show a real, specific example (a real prompt and its real result) instead of an abstract label or a row of icon tiles standing for the idea? | short r8: "what if we just said 'a pirate ship on a beach' and then you showed that? ... we show, we don't tell" |

## WARN questions (research, not yet a verdict)

From `~/code/jack-youtube-system/research/motion-research-page/reels/LEARNINGS.md` (20 outlier reels, 21 Oct) and `~/code/jack-youtube-system/rules/RULES.md`.

| # | Question (YES = good) | Evidence |
|---|---|---|
| W1 | Frame 0 (Shorts): a big title or the tool logos on screen? | 12 of 20 outlier reels (R07, R13, R16) |
| W2 | Captions 1 to 3 words, with one keyword coloured? | 10 of 20 (R16, R03, R01) |
| W3 | A pinned step label in the same spot on every beat ("1. Type it")? | 8 of 20 (R13, R16, R08) |
| W4 | Real UI cropped into ONE floating card on a soft ground (not a fragment in a busy frame)? | 8 of 20 (R13, R03, R01) |
| W5 | If a number matters, is the count-up the hero (40 to 90% of the width)? | 6 of 20 (R15, R14); his JS1 "68 sub-agents" |
| W6 | One ground and one accent per scene, at most two fonts? | winners avoid more than one ground (R08 cream + orange) |
| W7 | Hard cuts between shots; the motion lives inside the frame, not in fancy transitions? | almost every change in the 20 reels is a hard cut |
| W8 | Something changes every 0.5 to 1 s early, every 1 to 1.5 s later (check.py measures it)? | 20 Oct pacing note; RULES 15 to 17 |
| W9 | A plug-in moment (two logos slide together) when one tool joins another? | 5 of 20 (R13, R17, R10) |
| W10 | The picture builds itself (lines draw, icons assemble) instead of fading in whole? | 5 of 20 (R08, R11); his JS1 node diagrams build every 0.5 s |

## Scoring

- Any NO on J1 to J15 = FAIL for that scene. Fix it, re-render, re-run check.py and this rubric.
- WARNs go in the fix list. Three or more WARNs in one video = fix at least the cheapest one before shipping.
- When Jack gives a new verdict, add or edit a question here with his quote, and add a line to
  `~/code/jack-youtube-system/ledger/RULES.md`. Newest verdict wins when two disagree (r6 liked the left-aligned
  "Build today"; r7 asked for all text centred: J11 follows r7).
