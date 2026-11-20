---
name: shorts-studio
description: Turn a raw talking-head recording into a finished, captioned 9:16 Short with Claude Code, edited the way high-baseline creators edit. It finds the Shorts in a long recording, syncs a camera with a separate mic or screen recording, cleans the voice (Auphonic, optional), cuts stutters, repeats and retakes by listening, cuts on meaning, never shows you looking down, builds motion graphics as a few objects that carry across cuts (in YOUR style), adds sound effects that each have a visible cause and an optional music bed (Epidemic Sound in Claude's browser, optional), and will not ship until 29 automatic checks and a 20-test visual gate pass. Your notes become rules. Trigger on /shorts-studio, "edit my short", "make a short from this", "find shorts in this video", "cut this into shorts".
---

# Shorts Studio (v2, 27 Oct 2026)

Raw recording in, finished Short out. The rules come from measured data, not taste:
- `references/BASELINE.md`: what creators with a HIGH BASELINE and frequent outliers do (36 creators, 1,971 reels, 58 measured frame by frame).
- `references/PRINCIPLES.md`: 99 principles (hook, timing, layout, cutting, motion, captions, sound, ending), each with its source.
- `references/CHECKS.md`: 119 checks. `scripts/qa.py` runs every automatic one.
- `references/AUDIO.md`, `HOOKS.md`, `CLIPS.md`: sound, hook templates, finding Shorts.

S = this skill's folder. E = `$S/engine`. Work in a project folder P (`P/edit.json`, `P/work/`, `P/deliver/`).
**Read PRINCIPLES.md and BASELINE.md before designing anything. Ship only at QA PASS. Look at the frames, not just the numbers.**

## 0. Ask (once, one message)
Send `questions.md` word for word (7 questions: files, long or short, look, layout, graphics, ending word, Epidemic Sound).
Run `bash $S/scripts/doctor.sh` and fix what it prints.

## 1. Sources
- Camera + separate mic or screen recording: `python3 $S/scripts/sync.py --video cam.mov --audio screen.mov --out work/` (lines up to the ms).
- Long recording: find the Shorts (`references/CLIPS.md`), then `python3 $S/scripts/clip_cut.py synced.mp4 --words words_raw.json --clips clips.json --out clips --also screen.mp4`.

## 2. The cut (by listening, not by reading)
1. `python3 $S/scripts/repeat_check.py <clip>/words.json --audio <clip>/source.mp4` finds stutters, repeats, restarts and whole-sentence
   retakes (whisper merges repeats, so it re-listens in 3 s windows). Keep the LAST take of each.
2. Pick the drops at quiet points (lowest level near each edge) and cut: `python3 $S/scripts/silence_cut.py source.mp4 --out cut1 --words words_raw.json --drop drops.json --min-silence 0.6`.
3. Clean the voice once, on the cut: `python3 $S/scripts/auphonic.py work/cut.mp4 --out work/cut.mp4` (optional, strongly recommended).
4. Re-transcribe the cut (`captions.py ... --model medium.en`) and run `repeat_check.py` again. 0 found, or cut again.
Target: 30 to 55 s, 4+ spoken words per second, no dead air (BL11, BL18).

## 3. Face, look-downs, camera cuts
- `$S/bin/face_track work/cut.mp4 work/face.json 10` (Apple Vision, on the Mac).
- Look-downs: head tipped 9 deg+ below his usual for 0.2 s+ (blinks are not look-downs). Write `work/eyes_down.json`.
  Check the borderline ones BY EYE (a frame strip): a head tilt with the eyes on the lens is fine; eyes on the desk is not.
- Camera joins (every cut point in the cut): `work/joins.json`.
- Framing: `python3 $E/short/bases.py <P>` (face 37 % of the frame or panel, measured from the face box).

## 4. Director pass: the layout comes from the sentences
Write `edit.json` "layout" (untrimmed times, `"timeline": "pretrim"`): windows [start, end, split|anim|jack, world].
- **One idea per shot, 2 to 5 s, none under 1.5 s.** Median about 3 s (BL06). 6 to 18 switches per 40 s.
- **Switch on a phrase end, or ON the word the next shot shows.** Never mid-phrase for no reason.
- **The speaker:** never on screen while looking down (a graphic covers it); never gone more than 4.5 s; full screen only on the
  turns and punchlines (8 to 22 %); speaker on screen at most 56 % (approved Short) to 70 % (BL08).
- **Every camera join** lands on a switch or under a full graphic (never inside a split or full-speaker window).
- **Frame 0** shows a clear object and the speaker talks from 0.0 s (BL12). Proof first when there is proof (BL09).
Check it before building: `python3 $S/scripts/layout_check.py <P>` (look-downs, joins, shot lengths, presence, shares). LAYOUT OK first.

## 5. Motion: worlds, not cards
Write `P/scenes.js` (see `examples/draw/scenes.js`). The library (`$E/short/lib`) gives you:
- `world(id)`: ONE object that lives across several windows. Each split <-> full switch inside it uses one move from a kit (R46):
  `cut` (hard cut, the camera settles from a 5 % punch-in), `wipe` / `wipeR` (the full frame wipes in sideways, 0.34 s), `grow` (the
  panel grows up or down). Mostly cuts; never the same non-cut move twice in a row. Set the order in edit.json
  `"transitions": ["grow", "cut", "wipe", ...]` (one per switch, in time order). Next to a look-down use `grow` (it covers the face
  first); a sideways wipe leaves the face on screen until half way. The sound follows the move: cut silent, wipe swoosh, grow whoosh.
- `camera(Wd, framesPerWindow, moves)`: the camera re-frames the same world per window and glides inside a window (never under 0.6 s).
- `land`, `fadeUp`, `enter`: calm entrances (opacity in 0.12 s, never a grey half-faded frame). `sketchPath`, `sketchRect`,
  `sketchCircle`, `sketchArrow`, `drawOn`: hand-drawn strokes that draw themselves. `typer`, `press`, `ring`, `mkTick`, `tickAt`.
- `sfx(t, role, cause)`: every sound names what moves on screen (a key, a click, a card landing, a message arriving).
Rules: 5 to 8 worlds per Short; each world carries on (a browser types a URL and changes page, a phone changes screen).
Text in about half the frames, 1 to 2 overlay words (BL01, BL02); at most 3 designed animations in the first 5 s (BL03); at most
2 new things in any 0.5 s; no idle wobble after a landing; the moving thing is the proof (real UI, the real output).
Real assets only (`scripts/capture_ui.mjs --shot "selector"` captures one real element sharp). Never grey stand-in bars.

## 6. Build, render, sound
```bash
cd $E && python3 shared/run.py <P> --only trim,prep,gen,check
bash short/render.sh <P> final
python3 audio/sound.py <P> [--music <licensed track>]
```
`check` = the DOM spacing check (32 px gaps, 48 px margins, captions clear, hero 65 %+). `sound.py` levels effects by event loudness
(median 12 dB under the voice), music 13.5 dB under, -14 LUFS, then runs the lip sync test. Music: `references/AUDIO.md` (Epidemic
Sound in Claude's browser if they said yes to question 7; they sign in themselves; ask before "Confirm & Download").

## 7. QA: nothing ships until it passes
```bash
python3 $S/scripts/qa.py <P> --accents "#accent1,#accent2"
```
29 checks in one list (voice, eyes, timing, motion, sound, text, export, the 20-test visual gate). Fix every FAIL, re-run.
Then look at a contact sheet (2 frames a second) like a hawk: empty frames, grey frames, tiny graphics, text over the face, anything
glitchy. A check that passes on a bad frame means the check is wrong: fix the check, write the rule down.

## 8. Notes become rules
Save every note from the creator word for word (`scripts/learn.py note`). A note that repeats becomes a rule, a check in qa.py and
a line in PRINCIPLES.md. Fix the template, not just the video.
