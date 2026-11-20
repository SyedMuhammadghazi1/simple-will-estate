# The rules

Where they come from: 55 viral Reels measured frame by frame (Oct 2026, 15x to 288x their creator's normal views),
plus every note from many rounds of real Short edits. Your own notes add to these in ~/.shorts-studio/MY-RULES.md
(scripts/learn.py). If one of yours disagrees with one here, yours wins.

## The first 3 seconds
1. Talk from frame 0. The first word by 0.5 s. No "hey guys", no logo, no intro.
2. About 10 words in the first 3 s. Say the payoff, not the setup.
3. Words on screen by 1.0 s: a 2 to 6 word title that says the promise.
4. Something moves by 0.7 s (the title landing counts). The first hard cut can wait: viral hooks cut at about 4.4 s.
5. Show proof early: the real app, the real number, the real result. Polish does not separate the winners. Proof does.

## The body
6. One idea per Short. If you need "and also", it is two Shorts.
7. A visible change every 1 to 3 s (a caption, a card, a cut, the screen moving). Never a dead stare.
8. One card at a time. 6 words per card at most, best 3 words plus 1 number.
9. A graphic lands on the word it is about (0.1 s before the word starts), holds 2 to 3 s, then leaves.
10. Show a concrete example, never a label. "a pirate ship on a beach", not "any sentence".
11. Never cover the face. Captions and cards go above or below it (the builder refuses anything else).
12. Captions: 1 to 3 words at a time, the spoken word in the accent colour, each chunk up at least 0.3 s.
13. Fix misheard names before captions go on (scripts/fix_words.py). A wrong product name looks careless.
14. Calm beats busy. If a stretch feels rapid, use fewer, slower moves and let one thing hold.

## The ending
15. End on an ask: "Comment WORD and I'll send you X" (37 of 55 viral Reels). One short word in capitals.
16. Ending on your face with the word big at chest height is the most common close. A graphic end card works too.
    Neither is proven to convert better: test both on your own channel.
17. No goodbye, no "that's it". The ask is the last thing.

## Sound
18. Voice at -14 LUFS, peaks under -1 dBTP (scripts/mix.py).
19. Clean the voice once, on the final cut (Auphonic: scripts/auphonic.py). It is the biggest jump in quality for the least work.
20. Music is optional (56% of viral Reels have none). If you use it: from 0 s, about 14 dB under the voice, ducked while you talk,
    and only music you have the rights to.
21. Sound effects only on things you can see happen, quietly (about 12 dB under the voice).

## Length and layout
22. 27 to 62 s is the viral middle; about 39 s is typical.
23. Split (proof on top, you below) is the most common viral layout (14 of 55). Full face is next.
24. Keep 80 px margins and the bottom 300 px clear (the app's buttons sit there).
