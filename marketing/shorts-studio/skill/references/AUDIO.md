# Sound

## Two recordings, one take (camera + screen recorder)
Many setups film on a camera but record the good microphone with the screen recorder.
`scripts/sync.py --video camera.mov --audio screen-recording.mov --out work/` lines them up by the shape of your voice
(to the millisecond), keeps the camera picture and the good mic, and trims the screen recording to match (screen.mp4).
It stops if the two files are not the same take.

## Clean voice: Auphonic (optional, strongly recommended)
Auphonic removes room noise and hum, evens out your level and makes the voice sound "studio".
Without it the Short still works, but the sound is noticeably worse.
1. Make a free account at https://auphonic.com (2 hours of audio a month free).
2. Account > API Access: copy your key.
3. Put it in a file called `.env` in your work folder: `AUPHONIC_API_KEY=your_key`. Never paste it into the chat.
4. Run it once, on the final cut: `python3 scripts/auphonic.py work/cut.mp4 --out work/cut.mp4`
   (it keeps the original as cut-raw-voice.mp4 and checks the new sound lines up to the millisecond).

## Epidemic Sound in the browser (question 7 = yes)
Use the website, not the Epidemic API: the free API key has no commercial licence (prototypes only, 50 downloads ever),
and it makes them sign up for a developer account. Their normal subscription is what licenses the music for their channel.
1. Open https://www.epidemicsound.com in Claude's built-in browser (preview_start with the url). Mute every video and audio
   element on the page first, and never press play: their speakers are theirs.
2. If it is not signed in, ask them to sign in in that browser pane themselves. Never type their password.
3. Search for the music: one upbeat track with no vocals, 105 to 125 BPM, that fits the topic (or the track they name).
   Sound effects: search the Sound effects tab for the actions in the edit (whoosh, click, keyboard typing, notification, impact).
4. Click the download arrow, pick Full track, Full mix, MP3, Continue.
5. Epidemic then shows "First, confirm your plan covers your licensing needs" (what their plan covers: social media,
   sponsored content, ads, and so on). Read it to them and ask before you press "Confirm & Download": that click accepts
   licence terms for them, so it is theirs to approve, every time.
6. The file lands in their Downloads folder. Use it with `--music` (14 dB under the voice) and log it in licences.json
   (title, artist, Epidemic, the plan that covers it).

## Final level and music
`python3 scripts/mix.py out/final.mp4 --out out/final-mixed.mp4 [--music bed.mp3]`
-14 LUFS, peaks under -1 dBTP. Music about 14 dB under you, dipping while you talk, fading out at the end.
Use only music you have the rights to (your Epidemic Sound plan, your own licence, YouTube Audio Library, Pixabay Music).
