# Shorts Studio web app

A local page that runs the `shorts-studio` skill's pipeline without typing commands: upload a raw
talking video, and it transcribes it, cuts the dead air, lets you remove retakes, pick a look,
place a title, cards and an end card, then renders a captioned 9:16 Short and runs the quality gate.

Everything runs on your computer. Nothing is uploaded anywhere, with two exceptions the skill
already had: the renderer loads its animation library and your chosen font from public CDNs, and the
optional Auphonic voice clean-up sends the sound to Auphonic if you add a key.

## Run it

```
npm run shorts:studio          # or: python3 marketing/shorts-studio/server.py
```

Then open http://127.0.0.1:8765. Stop it with Ctrl+C.

It needs what the skill needs: Node 22+, ffmpeg, Python 3 with numpy, and a speech-to-text tool.
The page shows a row of checks at the top right and says what to install for anything missing.

| Speech-to-text | Install                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| whisper.cpp    | macOS: `brew install whisper-cpp` (what the skill uses)                       |
| faster-whisper | `pip3 install faster-whisper`, used automatically when whisper.cpp is missing |

Settings (environment variables): `PORT` (default 8765), `SHORTS_STUDIO_HOME` (where projects are
kept, default `./projects`, never committed), `SHORTS_WHISPER_PYTHON` (a Python that has
faster-whisper, if it is not the one running the server), `HF_VERSION` (HyperFrames version).

## The five steps

1. **Recording.** Drop in the video. Optional: a screen recording or picture (shown above you in the
   split layout) and a music track you have the rights to. Press "Transcribe and cut".
2. **Cut.** Every word of the recording, with the cut-out ones struck through. Click a word, then
   another, and remove the retake between them; fix misheard names; trim the start and end.
3. **Look.** Four presets (clean, night, bold, paper), your accent colour, the layout, caption size,
   and a box you drag around your face so nothing is ever placed over it.
4. **Graphics.** A hook title, cards that land on a spoken word (a short line, or a number that
   counts up), and an end card ("Comment WORD").
5. **Make.** Preview frames in seconds, then render. The quality gate lists every check as pass,
   warn or fail, and the finished MP4, captions file and contact sheet are there to download.

## Clipping a long video

`clip.py` turns a moment from a long stream or video into a finished Short from a small plan file:

```
npm run shorts:clip -- marketing/shorts-studio/clips/<name>.json
```

A plan lists the pieces of the source to keep, the hook title and the words spoken. The script
downloads only those seconds (yt-dlp), moves every cut to a quiet instant, re-frames each shot for
a phone (the camera full height, or the camera box stacked over the game), adds captions and the
title through the skill, levels the sound and runs the quality gate. `clips/*.md` explains each
plan: why that moment, what to check, and the post caption. Renders go to `clips/out/`, which is
not committed.

## What is in this folder

| Path            | What it is                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| `server.py`     | The local server (Python standard library only). Runs the steps, serves the page. |
| `transcribe.py` | Speech-to-text with faster-whisper, for computers without whisper.cpp.            |
| `clip.py`       | Cuts a moment out of a long video and builds the Short from a plan in `clips/`.   |
| `clips/`        | Clip plans (JSON) and their notes.                                                |
| `web/`          | The page: plain HTML, CSS and JavaScript, no build step.                          |
| `skill/`        | The `shorts-studio` skill exactly as delivered (scripts, rules, styles, licence). |
| `projects/`     | Your uploads and renders. Created on first run, ignored by git.                   |

## What the page does not do

The skill has two layers. The page runs the first: the scripted pipeline (`skill/scripts`), where
every step is a fixed command. The second layer needs Claude's judgement and stays a Claude skill:

- finding the best Shorts inside a long recording, and spotting retakes by listening;
- the director pass and custom motion graphics ("worlds") of the v2 engine (`skill/engine`);
- face tracking and the 20-test visual gate, which use Apple Vision and only run on a Mac;
- Epidemic Sound search, and turning your notes into new rules.

To use those, install the skill for Claude Code: copy `skill/` to `~/.claude/skills/shorts-studio`
(or `.claude/skills/shorts-studio` in this repository) and say "edit my short".

## Safety

- The server listens on 127.0.0.1 only, refuses requests addressed to any other host name, and
  refuses writes that come from another website.
- Files are served only from inside a project folder.
- HyperFrames' anonymous usage reporting is switched off when the server starts.
- `skill/bin/face_track` and `skill/gate/bin/vision` are prebuilt macOS programs that came with the
  skill. The page never runs them. Their Swift sources are next to them if you prefer to build
  them yourself.
