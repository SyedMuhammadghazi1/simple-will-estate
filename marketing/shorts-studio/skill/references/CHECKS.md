# Checks: community Shorts rulebook

Every check that exists anywhere in the sources, plus the 26 Oct notes. Built 26 Oct 2026.
Same data as `checks.json`.

Totals: 119 checks. 83 exist (61 by code or build step, 22 by eye test in JUDGE.md). 36 missing.

How to read a line:
- **Tool** names the exact script and test. `::` separates the file from the test name.
- "eye test" = a written YES/NO question a reviewer answers per scene. It exists, but no code runs it.
- "WARN only" = the tool prints it but does not block the ship.
- **MISSING** = no script or question enforces it today.
- Where two thresholds disagree, the newest note wins (26 Oct beats 20 Oct).

Out of scope: long-form checks (side card, picture-in-picture, no burned-in captions, long-form pacing in `check.py pacing` long mode).

## Voice & cut

1. **V01 Doubled word or phrase**
   - Catches: The speaker says the same word or phrase twice in a row ("the the", "and fixes and fixes").
   - Measure: Normalised transcript words, phrases of 4, 3, 2, 1 words compared with the next copy.
   - Threshold: 0 repeats. Drop the FIRST copy, keep the clean take.
   - Tool: `scripts/repeat_check.py :: kind 'repeat'`

2. **V02 Restart**
   - Catches: The speaker restarts a line ("it is, it's live"): the same 2+ words again with up to 2 words between.
   - Measure: Same as V01 with a skip of 1 or 2 words, inside --gap seconds.
   - Threshold: 0 restarts within 1.5 s (--gap 1.5).
   - Tool: `scripts/repeat_check.py :: kind 'restart'`

3. **V03 Cut-off start**
   - Catches: A clipped word right before the full word ("Man- ManyChat").
   - Measure: A short word that is the start of the next word.
   - Threshold: 0.
   - Tool: `scripts/repeat_check.py :: cut-off start`

4. **V04 Repeats found by listening**
   - Catches: Repeats the transcriber tidied away (whisper returned "and fixes and fixes" as one "and fixes").
   - Measure: Re-transcribe the voice in 3 s windows, 1.5 s step (small.en), find repeats per window, map back to the cut. Run before the edit AND on the final.
   - Threshold: 0 repeats on both runs.
   - Tool: `scripts/repeat_check.py --audio <voice> (deep mode)`

5. **V05 Pause anywhere over 0.2 s**
   - Catches: Dead air left in the voice, including pauses hidden under a full graphic.
   - Measure: Silence scan on the final voice stem (deliver/audio/voice.wav), not only where the speaker is on screen. trim.py trims pauses over 0.15 s but it is a fixer: nothing scans the final.
   - Threshold: No silence over 0.2 s anywhere.
   - Tool: **MISSING**

6. **V06 Silent stare**
   - Catches: The speaker is on screen but not talking.
   - Measure: Audio in 50 ms hops; quiet = 22 dB under the 90th-percentile speech level (floor -55 dB); speaker layout in 60%+ of those samples.
   - Threshold: No silence of 0.2 s or more while the speaker is on screen.
   - Tool: `gate/check.py :: no_silent_stare`

7. **V07 Naked jump cut**
   - Catches: A jump in the speaker's footage with nothing covering it.
   - Measure: 30 fps: face position jumps while the room behind stays put, outside footage ranges.
   - Threshold: 0 uncovered jump cuts. Every jump hides under a layout switch, a second angle, footage or a graphic.
   - Tool: `gate/check.py :: no_naked_jump_cut`

8. **V08 Source jump cuts before layout**
   - Catches: Jump cuts already inside the raw clip that the layout plan does not cover.
   - Measure: Run the jump detector on the cut BEFORE the layout is planned; list every jump so each gets a switch.
   - Threshold: Every source jump has a switch on it.
   - Tool: **MISSING**

9. **V09 Lip sync**
   - Catches: The picture of the speaker is not from the same moment as the voice (stale camera file after a re-cut).
   - Measure: Every 0.5 s of speaker panel in the final matched against the trimmed camera file slid +-2 s; base files as long as the voice. sound.py runs it last.
   - Threshold: Offset 0 frames (1 allowed) on every piece.
   - Tool: `scripts/lipsync_check.py <project>`

10. **V10 Cut on meaning**
   - Catches: A layout switch that lands mid-phrase instead of on a phrase boundary or on the word the next graphic is about.
   - Measure: Compare each switch time with word times and phrase boundaries (named switch_on_phrase in R43, never built).
   - Threshold: Every switch on a phrase boundary or on its keyword.
   - Tool: **MISSING**

11. **V11 Rough head or tail**
   - Catches: A rough cut, warm-up or clipped word at the very start or end.
   - Measure: Eye and ear test on the first and last second.
   - Threshold: No rough cut. The first second is cut as hard as the rest.
   - Tool: `gate/JUDGE.md :: J12 (eye test, per R32)`

12. **V12 Repeat heard by the judge**
   - Catches: Any doubled word that slipped past the scripts.
   - Measure: Listen to the final. Any word or phrase said twice in a row = NO.
   - Threshold: 0.
   - Tool: `gate/JUDGE.md :: 'Added 26 Oct' R37 question (eye test)`

## Eyes & face

13. **E01 Looking down**
   - Catches: The speaker on screen while looking at a script, desk or floor.
   - Measure: Per-frame head pitch and pupil position (face_track.swift writes pitch, yaw and gaze at 10 fps, but no test reads them).
   - Threshold: 0 frames of the speaker looking down. Cut tight or cover with a short full graphic.
   - Tool: **MISSING**

14. **E02 Eyes off the lens**
   - Catches: The speaker turned away (side angle, looking off).
   - Measure: Apple Vision yaw vs the speaker's usual angle, 0.5 s rolling median.
   - Threshold: Fail at yaw 12 deg or more for 0.8 s or more.
   - Tool: `gate/check.py :: eyes_on_lens`

15. **E03 Face not visible**
   - Catches: The back of the head or an over-the-shoulder shot: the speaker's room fills the frame with no face.
   - Measure: Room correlation 0.45+ and no face found.
   - Threshold: 0 samples.
   - Tool: `gate/check.py :: face_visible`

16. **E04 Graphics over the face**
   - Catches: Text or graphics placed on the face.
   - Measure: Apple Vision text boxes vs the tracked face box (never a guessed box).
   - Threshold: 0 text boxes on the face.
   - Tool: `gate/check.py :: face_clear`

17. **E05 Punch-in or slow zoom on the speaker**
   - Catches: Camera zooms or punch-ins on the speaker (pushes on product footage are fine).
   - Measure: 10 fps ORB on the speaker's picture, body masked.
   - Threshold: Scale step under 2% between frames; under 1.5% change over 1 s or 3 s of one shot.
   - Tool: `gate/check.py :: no_camera_zoom`

18. **E06 Drift on the speaker**
   - Catches: The speaker's picture slides around.
   - Measure: Same ORB tracking, horizontal movement.
   - Threshold: At most 2% of frame width over 3 s.
   - Tool: `gate/check.py :: no_camera_drift`

19. **E07 Fast zoom in and out**
   - Catches: Nauseous zoom transitions on the speaker.
   - Measure: Face size change per 0.5 s.
   - Threshold: At most 12% per 0.5 s.
   - Tool: `gate/check.py :: no_fast_zoom`

20. **E08 Face size in a split**
   - Catches: Speaker zoomed in too close (or too far) in the split panel.
   - Measure: Face box (forehead to chin) / speaker panel height; eye line = box top + 38% of box height.
   - Threshold: Face 40 to 44% of the panel (aim 41%, fail over 44%); eyes 32 to 39% down; shoulders and mic in shot.
   - Tool: **MISSING**

21. **E09 Face size full screen**
   - Catches: Speaker framed wrong when full screen.
   - Measure: Face box / frame height; eye line as E08.
   - Threshold: Face 38 to 42% of frame height; eyes 33 to 42% down.
   - Tool: **MISSING**

22. **E10 Speaker absent too long**
   - Catches: The speaker vanishes behind graphics (one test went 15 s without him).
   - Measure: Longest run with no split or speaker-full layout (named presence_gap in R38, never built).
   - Threshold: Never more than 2.5 s without the face.
   - Tool: **MISSING**

23. **E11 Face judge**
   - Catches: Face covered, silent stare, back of head or side angle seen by eye.
   - Measure: Per scene YES/NO.
   - Threshold: Any NO = fail.
   - Tool: `gate/JUDGE.md :: J13 (eye test)`

## Timing & pacing

24. **T01 Talk from frame 0**
   - Catches: A slow start: no voice in the opening.
   - Measure: Time of the first transcribed word.
   - Threshold: First word by 0.5 s.
   - Tool: `scripts/gate.py :: 'talk from frame 0'`

25. **T02 Words in the first 3 s**
   - Catches: A thin hook with too few words.
   - Measure: Count of words starting before 3.0 s.
   - Threshold: 7 or more (viral norm 10, middle half 8.5 to 14). WARN only.
   - Tool: `scripts/gate.py :: 'words in 0 to 3 s'`

26. **T03 First movement**
   - Catches: Nothing moves in the opening.
   - Measure: Earliest graphic or caption time.
   - Threshold: By 0.7 s (viral norm 0.2 s). WARN only.
   - Tool: `scripts/gate.py :: 'first movement'`

27. **T04 Hook visual**
   - Catches: No title, number or proof in the first second.
   - Measure: A title, media or stat graphic starting by 1.0 s.
   - Threshold: Present. WARN only (36 of 55 viral Reels show a headline).
   - Tool: `scripts/gate.py :: 'hook visual'`

28. **T05 Frame 0 is legible**
   - Catches: Frame 0 is a void, a wall of text or something unreadable.
   - Measure: Eye test on frame 0: a big title, the real logos or the real UI.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: W1 (eye test, WARN)`

29. **T06 Hook template named**
   - Catches: The opening invents a hook instead of copying a proven recipe.
   - Measure: Director row 1 names one of the 5 hook-lab templates and copies its shot list. director.py check only requires a reference frame per row.
   - Threshold: Row 1 names a template.
   - Tool: **MISSING**

30. **T07 Length**
   - Catches: A Short far outside the viral window.
   - Measure: Duration of the final.
   - Threshold: 15 to 60 s PASS, up to 90 s WARN, over FAIL (viral middle 27 to 62 s, most near 39 s).
   - Tool: `scripts/gate.py :: 'length'`

31. **T08 Dead gaps (current gate)**
   - Catches: Stretches where nothing visibly changes.
   - Measure: 10 fps frame diffs with the speaker's body and caption bands masked; a change = a cut, a layout switch or 0.4%+ of the graphic area moving.
   - Threshold: Short: gap in first 3 s <= 1.0 s, later gaps <= 3.0 s, average gap <= 1.1 s. gate.py also runs pacing_check.py --max-gap 1.5.
   - Tool: `gate/check.py :: pacing ; scripts/pacing_check.py (dead gaps)`

32. **T09 Tighter Shorts pacing**
   - Catches: The current gate lets a 3 s still through; the creator's Shorts never hold that long early.
   - Measure: Same as T08 with Shorts limits.
   - Threshold: Longest gap 1.5 s, average 0.8 s, first 3 s: 4 to 6 changes and no gap over 1.0 s.
   - Tool: **MISSING**

33. **T10 Flash frames**
   - Catches: A shot or element that blinks in and out.
   - Measure: 30 fps: a shot between two hard cuts, or an element that pops in and out again.
   - Threshold: Nothing shorter than 0.3 s (--min-hold 0.3).
   - Tool: `scripts/pacing_check.py :: nothing flashes`

34. **T11 Shot under 1.5 s**
   - Catches: Frantic cutting (12 of 26 shots under 1.2 s was rejected; the approved Short had 1 of 18).
   - Measure: Shot list from hard cuts and layout switches; length of each shot.
   - Threshold: No shot under 1.5 s.
   - Tool: **MISSING**

35. **T12 Shot length window**
   - Catches: Shots too short or too long for one idea.
   - Measure: Median and spread of shot lengths.
   - Threshold: Each shot 2 to 5 s; median near 2.1 s.
   - Tool: **MISSING**

36. **T13 One idea per shot**
   - Catches: A shot that carries two messages, or one message split over many shots.
   - Measure: Director row check: one message per shot.
   - Threshold: 1 idea per shot.
   - Tool: **MISSING**

37. **T14 Layout holds**
   - Catches: One layout held too long.
   - Measure: Layout labelled per 0.5 s sample.
   - Threshold: Speaker full <= 6 s; split <= 7.5 s.
   - Tool: `gate/check.py :: layout_holds`

38. **T15 Speaker share (upper)**
   - Catches: Speaker on screen too much (reads as "too close").
   - Measure: Share of samples in split or speaker-full layouts.
   - Threshold: At most 56% (+2% tolerance).
   - Tool: `gate/check.py :: layout_holds`

39. **T16 Layout shares (lower and mix)**
   - Catches: Speaker on screen too little, or the wrong layout mix.
   - Measure: Share of runtime per layout.
   - Threshold: Speaker 45 to 56%; split 31 to 40%; graphics about 49%; speaker full 11 to 20%.
   - Tool: **MISSING**

40. **T17 Layout switch count**
   - Catches: Too few (or too many) layout switches.
   - Measure: Count switches per 40 s.
   - Threshold: 8 to 12 switches in 40 s; a cut or switch every 1.5 to 2.7 s.
   - Tool: **MISSING**

41. **T18 First hard cut**
   - Catches: Hard cuts crowding the first seconds.
   - Measure: Time of the first hard cut.
   - Threshold: Near 4.4 s (middle half 2.4 to 9.1 s); motion lives inside the frame first.
   - Tool: **MISSING**

42. **T19 Word sync**
   - Catches: A graphic that lands late or early on its word.
   - Measure: sync.json from bbox_check.mjs: each beat's event time vs its word time.
   - Threshold: Within 2 frames; fail at 3.
   - Tool: `gate/check.py :: sync (needs --sync from engine/short/checks/bbox_check.mjs)`

43. **T20 End card time (minimum)**
   - Catches: An end card that flashes past.
   - Measure: Hold of the 'end' graphic.
   - Threshold: 1.5 s or more.
   - Tool: `scripts/gate.py :: 'end card time'`

44. **T21 End card time (target)**
   - Catches: End card the wrong length.
   - Measure: Hold of the end card.
   - Threshold: 4.0 to 4.5 s; no goodbye.
   - Tool: **MISSING**

## Layout & graphics

45. **L01 Director plan complete**
   - Catches: Building without a plan.
   - Measure: Every 3 s row has a message, a frame type, a hero visual, a real asset and a reference frame.
   - Threshold: 0 problems.
   - Tool: `engine/shared/director.py check`

46. **L02 Sentence type picks the layout**
   - Catches: A layout that does not fit the line (a number not shown as a count-up, an opinion not on the face).
   - Measure: Row-by-row: product named -> logo or real UI full; number -> count-up full; list -> checklist; how it works -> small diagram; proof -> split; opinion or punchline -> speaker full; CTA -> speaker or end card.
   - Threshold: Every row matches the table.
   - Tool: **MISSING**

47. **L03 Four layouts rotate**
   - Catches: One talking-head shot with cards on top.
   - Measure: Layout labels over time.
   - Threshold: Split, full graphic, footage and speaker full all used; holds per T14.
   - Tool: `gate/check.py :: layout_holds (partial: hold limits only)`

48. **L04 Split geometry**
   - Catches: A divider, gap, margin or off-centre seam in the split.
   - Measure: Seam position and divider width.
   - Threshold: Seam 49.6 to 50.2% of height, divider 0 px, both panels edge to edge.
   - Tool: **MISSING**

49. **L05 Near-empty frame**
   - Catches: White bands, empty panels, a tiny card in a void.
   - Measure: Designed content area / panel area, held 1 s.
   - Threshold: Graphics cover 8%+ of the panel.
   - Tool: `gate/check.py :: not_empty`

50. **L06 Graphic size**
   - Catches: Graphics too small for the panel.
   - Measure: Content span / panel width, after the first 1.5 s of a build.
   - Threshold: 65%+ full screen, 58%+ split top, 55%+ side card.
   - Tool: `gate/check.py :: graphic_size`

51. **L07 Hero width (DOM)**
   - Catches: The scene's hero element too narrow.
   - Measure: DOM box of data-hero / its panel width, max per scene.
   - Threshold: 65%+ of the panel.
   - Tool: `engine/short/checks/bbox_check.mjs :: hero`

52. **L08 Hero fills a full graphic**
   - Catches: A full graphic with a modest hero ("small cards floating in empty space").
   - Measure: Hero width on full-graphic scenes.
   - Threshold: 80%+ wide.
   - Tool: **MISSING**

53. **L09 Grey placeholders**
   - Catches: Grey wireframes or stand-in bars.
   - Measure: Saturation of designed samples.
   - Threshold: Colour on 0.4%+ of the panel; never grey for 2 s.
   - Tool: `gate/check.py :: not_grey`

54. **L10 Accent colours (user's style)**
   - Catches: Graphics that lose the user's accents.
   - Measure: Share of designed samples where each accent covers 0.3%+ of the panel; no 2 s stretch with neither.
   - Threshold: Each accent in 30%+ of designed samples. Today hard-coded to the creator's two colours: the community skill must read the accents from the user's style.
   - Tool: `gate/check.py :: orange_and_blue (hard-coded, swap in the user's accents)`

55. **L11 Gap between blocks**
   - Catches: Graphic blocks jammed together.
   - Measure: DOM boxes every 5th frame.
   - Threshold: 32 px or more.
   - Tool: `engine/short/checks/bbox_check.mjs :: gap`

56. **L12 Outer margin**
   - Catches: A block jammed against its panel edge.
   - Measure: DOM box vs its panel.
   - Threshold: 48 px or more.
   - Tool: `engine/short/checks/bbox_check.mjs :: margin`

57. **L13 Inner padding**
   - Catches: Content crammed inside a card.
   - Measure: Child box inside parent box.
   - Threshold: 28 px or more.
   - Tool: `engine/short/checks/bbox_check.mjs :: pad`

58. **L14 Touching**
   - Catches: Two blocks partly overlapping.
   - Measure: Box intersection that is not full containment.
   - Threshold: 0.
   - Tool: `engine/short/checks/bbox_check.mjs :: touch`

59. **L15 Text margin**
   - Catches: Text hugging the panel edge.
   - Measure: Text boxes vs panel edge.
   - Threshold: 3.5% of panel width or more.
   - Tool: `gate/check.py :: text_margin`

60. **L16 Text centred**
   - Catches: Headline text off-centre.
   - Measure: Text 4.5%+ of frame height: centre vs panel centre.
   - Threshold: Within 7% of the width.
   - Tool: `gate/check.py :: text_centred`

61. **L17 Safe zones**
   - Catches: Graphics in the caption band or platform UI.
   - Measure: Box positions vs zones.
   - Threshold: Full graphics out of y 1250 to 1360; split-top content above y 886; clear of the platform's top and bottom UI.
   - Tool: **MISSING**

62. **L18 Label chips**
   - Catches: Label pills or the spoken word typed beside the speaker.
   - Measure: Text under 9.5% of height on a flat fill (60%+ of the ring) beside the speaker.
   - Threshold: 0 chips of 2+ words.
   - Tool: `gate/check.py :: text_chips_on_speaker`

63. **L19 AI cliches (code)**
   - Catches: Decorative sparkle stars.
   - Measure: 4 fps star detector, full size.
   - Threshold: 0.
   - Tool: `gate/check.py :: no_sparkle_stars`

64. **L20 One hero**
   - Catches: Stacked panels or a small card in empty space.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J1 (eye test)`

65. **L21 Real, not placeholder; real UI moves**
   - Catches: Stand-in art, still screenshots, text cards about the UI.
   - Measure: Per scene YES/NO (R02, R31).
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J2 (eye test)`

66. **L22 Show, don't echo**
   - Catches: Typing the word just said, label chips.
   - Measure: Per scene YES/NO.
   - Threshold: YES. Big centred kinetic text is the one exception.
   - Tool: `gate/JUDGE.md :: J3 (eye test)`

67. **L23 AI cliches (eye)**
   - Catches: Crossed-out icons, restart arrows, sparkle stars, glowing orbs, the generic one-prompt look.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J4 (eye test)`

68. **L24 Pointers point, overlays clear**
   - Catches: Arrows that miss; text covering the thing being shown.
   - Measure: Per scene YES/NO (R05, R34).
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J5 (eye test)`

69. **L25 It does something**
   - Catches: A static card that just sits there.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J6 (eye test)`

70. **L26 Calm proof**
   - Catches: Credentials as chips, stamps, avatar rings or a busy count-up.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J7 (eye test)`

71. **L27 Progress is a picture**
   - Catches: A text counter instead of a moving picture.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J8 (eye test)`

72. **L28 Means something, lands on its word**
   - Catches: A graphic unrelated to the line.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J14 (eye test)`

73. **L29 Concrete example**
   - Catches: An abstract label or icon tiles for an idea.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J18 (eye test)`

74. **L30 Clean logos**
   - Catches: Cropped favicons, stretched or boxed logos.
   - Measure: Per logo YES/NO (logo_clean named in R40, no code).
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: 'Added 26 Oct' R40 question (eye test)`

75. **L31 Fills the frame**
   - Catches: A full graphic without real UI or one strong object.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: 'Added 26 Oct' R41 question (eye test)`

76. **L32 One style system (user's style)**
   - Catches: Many grounds, many accents, extra fonts.
   - Measure: Per scene: one ground, one accent, at most 2 fonts, all from the user's style.
   - Threshold: YES. J9, J11 and J17 hard-code the creator's look: rewrite them to read the user's style.
   - Tool: `gate/JUDGE.md :: W6 (eye test, WARN)`

77. **L33 Ship it**
   - Catches: A frame a design studio would not ship.
   - Measure: Per scene vs the GREAT/SLOP board.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J15 (eye test)`

## Motion

78. **M01 Continuity**
   - Catches: A hard cut from one unrelated graphic to another.
   - Measure: Per scene YES/NO: each graphic grows out of the one before.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: J16 (eye test)`

79. **M02 Worlds, not cards**
   - Catches: A new unrelated card on every cut ("spasming").
   - Measure: Track object ids across scenes (named worlds_not_cards in R44, no code).
   - Threshold: 5 to 8 objects per Short; each lives 2.5 to 10 s and carries across switches.
   - Tool: **MISSING**

80. **M03 Idle wobble**
   - Catches: Graphics that wobble, swing, hop or drift while resting.
   - Measure: Motion of an element after it has landed (named calm in R44, no code or JUDGE question).
   - Threshold: 0 idle motion after the landing settles.
   - Tool: **MISSING**

81. **M04 Pop cluster**
   - Catches: Many small things popping on at once.
   - Measure: Count element arrivals in a sliding 0.5 s window.
   - Threshold: At most 2 new elements in any 0.5 s.
   - Tool: **MISSING**

82. **M05 Hard snap on a layout change**
   - Catches: An object that jumps when the layout changes.
   - Measure: Object box before and after each layout switch.
   - Threshold: The graphic grows from the top panel to full, the speaker slides. No snap mid-object.
   - Tool: **MISSING**

83. **M06 Squeezed camera move**
   - Catches: A camera move inside a graphic that is too fast.
   - Measure: Duration of each camera move.
   - Threshold: No move under 0.6 s; about 1 move per second at most; hold the result 0.3 to 0.8 s; soft eases.
   - Tool: **MISSING**

84. **M07 Entrance style**
   - Catches: Slides, wipes or typewriter on the main element; slow fades.
   - Measure: Entrance type and duration per element.
   - Threshold: Pop or build, 0.1 to 0.3 s per element; count-up about 0.6 s.
   - Tool: **MISSING**

85. **M08 Harsh zoom on footage**
   - Catches: Harsh zooms even on product footage.
   - Measure: Zoom rate on footage ranges (E05 to E07 only cover the speaker).
   - Threshold: Soft ease in and out.
   - Tool: **MISSING**

86. **M09 Hard cuts, motion inside**
   - Catches: Fancy transitions between shots.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: W7 (eye test, WARN)`

87. **M10 Builds itself**
   - Catches: A picture that fades in whole.
   - Measure: Per scene YES/NO.
   - Threshold: YES.
   - Tool: `gate/JUDGE.md :: W10 (eye test, WARN)`

## Sound

88. **S01 SFX stem level**
   - Catches: Sound effects louder than the speaker.
   - Measure: SFX stem LUFS vs voice LUFS.
   - Threshold: 12 to 17 dB under the voice.
   - Tool: `engine/audio/sound.py :: LEVELS OK`

89. **S02 Median cue level**
   - Catches: Cues set by the quiet attack, so the gain runs away.
   - Measure: Event loudness (loudest 100 ms, K-weighted) per cue vs voice.
   - Threshold: Median cue -10 to -14 dB; big hits -6 to -9; keys and clicks -16 to -20.
   - Tool: `engine/audio/sound.py :: LEVELS OK`

90. **S03 SFX density**
   - Catches: Too many or too few effects.
   - Measure: Cues per sliding 10 s window and on average.
   - Threshold: At most 8 in any 10 s; at most 6 per 10 s on average.
   - Tool: `engine/audio/sound.py :: LEVELS OK`

91. **S04 SFX spacing**
   - Catches: Two effects stacked on each other.
   - Measure: Gap between cues.
   - Threshold: Never 2 within 0.2 s.
   - Tool: `engine/audio/sound.py (placement rule)`

92. **S05 Same file twice**
   - Catches: One file repeated back to back.
   - Measure: Consecutive cue files.
   - Threshold: Never the same file twice in a row.
   - Tool: `engine/audio/sound.py (placement rule)`

93. **S06 SFX names a visible action**
   - Catches: A sound on an abstract word, or with nothing on screen causing it.
   - Measure: Each cue's 'why' (sound.py logs sfx(t, role, why) to events.json) must name a visible action (click, type, land, swipe) and that action must be on screen at t.
   - Threshold: 100% of cues.
   - Tool: **MISSING**

94. **S07 SFX on its frame**
   - Catches: A sound that lands before or after its event.
   - Measure: Cue time vs event frame.
   - Threshold: 0 frames off (the approved Short measured 0.0).
   - Tool: **MISSING**

95. **S08 Music bed**
   - Catches: No bed, or a bed that fights the voice.
   - Measure: Bed loudness vs voice.
   - Threshold: From 0 s, 13 to 14 dB under (sound.py sets 13.5), +4 dB in gaps, 0.8 s fade.
   - Tool: `engine/audio/sound.py (sets it; no pass/fail)`

96. **S09 Loudness**
   - Catches: Mix too loud or too quiet; clipping.
   - Measure: ffmpeg ebur128 on the final.
   - Threshold: -15.5 to -12.5 LUFS and peak <= -0.9 dBTP (aim -14 / -1). WARN only.
   - Tool: `scripts/gate.py :: 'loudness'`

97. **S10 Licences**
   - Catches: Unlicensed or draft-only files in a publish mix; home-made synth whooshes.
   - Measure: licences.json lists every file; draft-only files must block a publish.
   - Threshold: 0 draft or unknown licences at publish.
   - Tool: **MISSING**

98. **S11 Sound judge**
   - Catches: Harsh or loud hits, sounds not matched to what moves.
   - Measure: Listen to the final. Any harsh hit = NO.
   - Threshold: 0 NO.
   - Tool: `gate/JUDGE.md :: 'Added 26 Oct' R39 question (eye test)`

## Text & captions

99. **X01 Words per graphic**
   - Catches: Too much text in one graphic.
   - Measure: Words and numbers per text block (typed code and real UI excluded).
   - Threshold: At most 3 words + 1 number.
   - Tool: `gate/check.py :: words_per_screen ; engine/short/checks/bbox_check.mjs :: words`

100. **X02 Words per screen**
   - Catches: A heavy screen overall.
   - Measure: All text on screen, held 1 s.
   - Threshold: At most 8 words (10 on a real clip).
   - Tool: `gate/check.py :: words_per_screen`

101. **X03 Words per card (legacy)**
   - Catches: A card with a sentence on it.
   - Measure: Words in text, label and sub of each card.
   - Threshold: At most 6 (looser than X01: X01 wins).
   - Tool: `scripts/gate.py :: 'words per card'`

102. **X04 Text early**
   - Catches: No words on screen in the opening.
   - Measure: Earliest caption or graphic.
   - Threshold: By 1.0 s.
   - Tool: `scripts/gate.py :: 'words on screen'`

103. **X05 Captions one at a time**
   - Catches: Two caption lines stacked.
   - Measure: Each caption ends before the next starts.
   - Threshold: 0 overlaps.
   - Tool: `scripts/gate.py :: 'captions one at a time'`

104. **X06 Caption length**
   - Catches: Long subtitles.
   - Measure: Words per caption chunk (gen.py builds 1 to 3 word chunks; nothing tests the final).
   - Threshold: 1 to 3 words, mostly 2.
   - Tool: **MISSING**

105. **X07 Caption placement**
   - Catches: Captions mid-face or in the wrong band.
   - Measure: Caption pill centre vs layout.
   - Threshold: On the seam in a split (y 960); 66 to 68% down otherwise (y 1306); never on the face.
   - Tool: **MISSING**

106. **X08 Caption size**
   - Catches: Captions too small or too big.
   - Measure: Text and pill height.
   - Threshold: Text 54 to 70 px (2.8 to 3.6% of height); pill about 75 px; in the user's style.
   - Tool: **MISSING**

107. **X09 Caption clear of graphics**
   - Catches: A caption touching a graphic.
   - Measure: DOM gap caption pill to blocks.
   - Threshold: 32 px or more.
   - Tool: `engine/short/checks/bbox_check.mjs :: cap`

108. **X10 Card spacing**
   - Catches: Stat or callout cards crowding each other.
   - Measure: Time between card starts.
   - Threshold: 2.5 s or more. WARN only.
   - Tool: `scripts/gate.py :: 'card spacing'`

109. **X11 Names and grammar**
   - Catches: Misheard names in captions; bad grammar on screen.
   - Measure: Check every proper noun against the source; read every line.
   - Threshold: 0 errors.
   - Tool: **MISSING**

110. **X12 Ending ask**
   - Catches: No call to action.
   - Measure: An end card, or comment/follow/subscribe/link/save in the last 6 s.
   - Threshold: Present (37 of 55 viral Reels end on "comment a word"). WARN only.
   - Tool: `scripts/gate.py :: 'ending'`

## Delivery

111. **D01 Aspect ratio**
   - Catches: Wrong shape.
   - Measure: Width x 16 = height x 9.
   - Threshold: 9:16.
   - Tool: `scripts/gate.py :: 'format'`

112. **D02 Resolution and frame rate**
   - Catches: Wrong size or frame rate.
   - Measure: ffprobe.
   - Threshold: 1080x1920 at 30 fps.
   - Tool: **MISSING**

113. **D03 Sharp export**
   - Catches: A soft or blurry render.
   - Measure: Sharpness measure on stills.
   - Threshold: Sharp.
   - Tool: **MISSING**

114. **D04 Page errors**
   - Catches: A JS error or missing asset in the graphics page.
   - Measure: Headless Chrome: page errors, console errors, missing files.
   - Threshold: 0.
   - Tool: `engine/short/checks/bbox_check.mjs :: page`

115. **D05 Layers rebuild the final**
   - Catches: Layers that do not stack back into the final.
   - Measure: Stack base + graphics + captions and compare (layertest in layout.json).
   - Threshold: Match.
   - Tool: `(the original system) (layertest)`

116. **D06 Stems sum to the mix**
   - Catches: Stems that do not add up.
   - Measure: voice + sfx + music vs mix.
   - Threshold: Sum = mix (no limiter on stems).
   - Tool: `engine/audio/stems.py (by construction; no test)`

117. **D07 Editor pack**
   - Catches: Missing hand-off files.
   - Measure: Files present: final.mp4, layers (ProRes 4444 + VP9), 3 stems, layout.json, 2 fps contact sheet, licences.json, gate report, timeline.xml + timeline.csv.
   - Threshold: All present.
   - Tool: `(the original system)`

118. **D08 Contact sheet**
   - Catches: Nobody looks at the frames.
   - Measure: 2 fps sheet, failing frames framed in red.
   - Threshold: Written and looked at.
   - Tool: `gate/check.py :: contact.jpg`

119. **D09 Ship gate**
   - Catches: Shipping with a failure.
   - Measure: check.py exit code and judge.json.
   - Threshold: GATE PASS and 0 NO. Borderline = NO.
   - Tool: `gate/check.py (exit 0) + gate/JUDGE.md (judge.json)`

## Built 27 Oct 2026: `scripts/qa.py` runs these (they were MISSING above)
One command runs every automatic check and prints one PASS/FAIL list: `python3 scripts/qa.py <project> --accents "#hex,#hex"`.
- V05 pauses: no silence over 0.25 s between the first and last word (final voice)
- V repeats: `repeat_check.py --audio` on the FINAL (stutters, repeats, restarts and whole-sentence retakes, by listening)
- V lip sync: `lipsync_check.py` (frame-exact, transitions skipped)
- E01 looking down: head tipped 9 deg+ below his usual for 0.3 s+ while on screen (blinks excluded)
- E08 / E09 face size in the split and full screen
- E10 presence: never gone more than 4.5 s
- T11 / T12 no shot under 1.5 s, median shot 1.8 to 5 s
- T16 shares: speaker 40 to 72 %, full screen 8 to 22 %
- T17 switches: 6 to 18 per 40 s (the approved Short: 17.9)
- V10 switches land on a phrase end or on the keyword the new shot shows
- M04 at most 2 new things in any 0.5 s
- M05 no hard snap inside a shot (designed grows and slides excluded)
- S06 / S07 every sound names its visible cause and lands within 0.15 s of an event
- S10 no draft-only licence in licences.json
- X06 / X07 captions 1 to 3 words, on the seam in a split
- D02 / D03 1080x1920 at 30 fps, sharp
Still by eye (JUDGE.md): worlds not cards, calm motion, one idea per shot, real assets, the hook.
