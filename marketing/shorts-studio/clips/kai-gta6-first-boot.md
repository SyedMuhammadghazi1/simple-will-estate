# Clip: "Kai Cenat prays before GTA 6"

Source: [Kai Cenat's First Time Playing GTA 6!](https://www.youtube.com/watch?v=7mjhCbFi9Wk) on
Kai Cenat Live (2 h 05 min, uploaded 18 Nov 2026). The clip is 29 seconds built from the first 76
seconds of the stream.

## Make it

On a computer that YouTube lets download (your own, not a cloud machine):

```
brew install yt-dlp ffmpeg          # once; plus Node 22+ and numpy (pip3 install numpy)
npm run shorts:clip -- marketing/shorts-studio/clips/kai-gta6-first-boot.json
```

The finished file lands in `marketing/shorts-studio/clips/out/kai-gta6-first-boot/deliver/`,
next to a cover frame, a contact sheet and the gate report. If the download is refused, save the
video from a browser and add `--source <file>`.

## The cut

| Piece | Source time  | What he says                                                                  |
| ----- | ------------ | ----------------------------------------------------------------------------- |
| 1     | 0:00 to 0:02 | "I did not sleep tonight, bro."                                               |
| 2     | 0:02 to 0:05 | "This is the first time in a long time where it felt like Christmas."         |
| 3     | 0:20 to 0:29 | "I'm just seeing GTA 6 is out... I got FOMO... I changed servers immediately" |
| 4     | 0:38 to 0:42 | "God, thank you so much for this moment. I waited 13 years..."                |
| 5     | 0:50 to 0:52 | "Our Father, who art in heaven, hallowed be thy name,"                        |
| 6     | 1:00 to 1:02 | "Amen. God, thank you so much."                                               |
| 7     | 1:09 to 1:16 | "Everybody clap it up. Here we go. Oh my god. Oh my god. Oh my god."          |

Why this moment and not a later one:

- **Viewers point at it.** Of the 30 timestamps in the top 400 comments, 7 are inside the first
  45 seconds ("0:00 to 0:35", "00:00–00:45", "0:37"), the largest cluster in the video.
- **The top comments are about the same two things the clip says:** the 13-year wait ("we got GTA 6
  before GTA 7", 104 likes; "the 13 years is worth the wait", 98) and how he is playing early
  ("how are all these guys getting GTA 6 a day early?", 39).
- **It needs no context and no spoilers**, opens on a line anyone understands, and ends on his
  reaction to the game starting, which loops straight back into "I did not sleep tonight".
- **It is clean.** No bleeped words inside any piece, so nothing limits who it can be shown to.

## What the tool does to it

- Cuts land on the quietest instant near each planned time, so no word is clipped.
- Dead air is removed between pieces; 12 words are spoken in the first 3 seconds.
- While the camera is full screen he fills the frame, with a punch-in on every other cut.
- Once the stream shows the console with a small camera box, the box is enlarged on top and the
  screen sits below. The switch is found to the exact frame.
- Word-by-word captions with the spoken word highlighted, a hook title for the first 3 seconds,
  and a small source credit, none of them over his face.
- Sound levelled to -14 LUFS. Then the skill's quality gate runs.

## Check before posting

This plan was written from the video's captions, comments and thumbnails, because the cloud
session that wrote it could not download the footage. The cut times and the layout were tested on
real frames of the stream but not on the moving video. So after the first render:

1. Watch it with sound. If a cut clips a word, nudge that piece's `from` or `to` in the JSON by
   0.1 s and run it again (about two minutes).
2. Read the captions against what he says. They come from YouTube's auto-captions with obvious
   mishearings corrected ("booting", "who art in heaven").
3. If the tool prints "the cam view lasts only ... s", the stream switches view inside a piece.
   Move that piece's start past the switch.
4. The gate's "ending" line will warn that there is no ask. That is deliberate: the clip loops.
   Put the ask in the post caption instead.

## Post caption

```
13 years of waiting and this is how Kai Cenat started GTA 6 😭🙏

Would you have prayed too?

🎥 Kai Cenat Live on YouTube
#gta6 #kaicenat #gtavi #gaming #streamer
```

## Before you post

- **Rights.** This is Kai Cenat's stream and Rockstar's game. I found no published clipping
  programme or permission from Kai Cenat; check his channels or your agreement before posting.
  The on-screen credit and the caption credit stay on either way.
- **Timing.** GTA 6 launch-week interest fades by the day. Post as soon as it passes your check.
- **No guarantee.** Nobody can promise a clip goes viral. What this clip has is the things that are
  known to matter: a hook in the first two seconds, no dead air, captions, a payoff, and a loop.

## Next clips from the same stream

Ranked by how well they stand alone. Times are in the source.

| Time    | Moment                                                                      | Note                                    |
| ------- | --------------------------------------------------------------------------- | --------------------------------------- |
| 1:40:19 | "This is literally like if GTA and Red Dead made a baby."                   | His verdict in one line; clean          |
| 1:27:25 | Police chase, "it's so much harder, chat... this is like real"              | Action plus reaction; ends in a bust    |
| 1:02:00 | "Yo, this map is huge, bro."                                                | First look at the map                   |
| 1:33:30 | "I was raised by Michael, Franklin and Trevor."                             | Very quotable; heavy language around it |
| 2:02:56 | Viewers' most-timestamped late moment (four comments between 2:00 and 2:05) | Story spoiler; check the scene first    |
