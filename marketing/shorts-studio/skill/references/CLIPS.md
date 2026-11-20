# Finding Shorts inside a long recording

1. Transcribe it (scripts/captions.py). Read the whole thing with the word numbers (#n).
2. Skip anything that is instructions to an editor, setup, or a retake. Keep the last good take of any line said twice.
3. A good Short is ONE idea that stands alone:
   - it opens on a strong line (a result, a number, a surprise, a "most people get this wrong"),
   - it has a payoff the viewer can use or repeat (a prompt, a step, a number, a rule),
   - it needs no earlier context ("as I said before" means start earlier or skip it),
   - 20 to 60 s of speech.
4. Score each candidate 1 to 5 on: hook, payoff, stands alone, energy. Keep the top ones (4+ on hook and payoff).
5. If the best opening line sits in the middle, start the clip there and drop the warm-up words (drops.json).
6. Write clips.json with word numbers and one line on why each works. Show the person the list and the opening line of each.
7. `python3 scripts/clip_cut.py <recording> --words <work>/words_raw.json --clips clips.json --out <work>/clips [--also <work>/screen.mp4]`
