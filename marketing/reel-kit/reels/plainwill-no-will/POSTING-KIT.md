# Posting kit: "No will? Your state already wrote yours."

Everything needed to post the reel in `export/`, and what to decide before you do.

| File                                 | What it is                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| `export/plainwill-no-will.mp4`       | the reel: 1080 × 1920, 30 fps, H.264 High, AAC 48 kHz, 34.6 s      |
| `export/plainwill-no-will--list.mp4` | the same reel with the comment-keyword end card (test version B)   |
| `export/cover.png`                   | cover: a real frame of the reel (hook caption fully lit)           |
| `export/captions.srt`                | subtitles, one cue per beat plus the end card's on-screen sentence |
| `export/checklist.pdf`               | the one-page checklist the caption offers                          |
| `export/checklist.png`               | the same page as an image, in case a reply cannot carry a PDF      |

## Before you post: seven decisions only the owner can make

1. **The service is not live.** The reel is written as an educational, brand-attributed piece:
   no price, no "start today", no availability or state-coverage claim, no time claim. Keep it
   that way until `docs/LAUNCH_CHECKLIST.md` is done.
2. **No attorney has reviewed this reel.** Every statement is general, hedged and sourced (table
   below), and the sources were researched and then independently re-checked, but that is not
   legal review. Have counsel look at it alongside the site copy. Tell them plainly about two
   pieces of imagery: the mascot is a cartoon gold certificate seal (the kind seen on notarised
   or official documents), and a gavel appears once, inside a card titled "Guardianship
   hearing", to show what a court does. Ask about North Carolina, Louisiana and California in
   particular. An organic reel cannot be limited by state; excluding states is only possible for
   paid placement.
3. **Organic only, as built.** Do not boost it or run it as an ad until counsel has signed off,
   the gavel is swapped for the document version ("Who raises them? / Decided by: a judge"), and
   the question openers ("No will?", "Not married?", "Kids?", "Unsigned?") have been checked against Meta's
   personal-attributes ad policy.
4. **Clear the name and the handle first.** "Plainwill" is a working name and it is in the
   video (eyebrow, end card) and on the checklist. A published reel cannot be edited. If the
   name changes, edit `eyebrow`, `endcard.brand` and `endcard.disclaimer` in `reel.json` and
   rebuild.
5. **Profile and link.** Until launch the profile bio should say "Not open yet. Not a law firm."
   and should not link to the site. The site's "valid will", "15 minutes", "files it properly"
   and "Start your will" lines need fixing before any link goes up, because the reel's net
   impression is formed together with the page it sends people to.
6. **The checklist offer is a promise.** The caption tells people to comment `LIST`. Everyone
   who does must receive the checklist and nothing else: no price, no purchase link. Test the
   delivery on a private post first. Meta's Private Replies API allows one message per comment
   within 7 days, and whether a PDF can be attached in that message is not confirmed: if it
   cannot, send `export/checklist.png`, or a link to a page that hosts only the PDF. If you
   cannot deliver, remove that line from the caption and change `endcard.sub` in `reel.json`.
7. **The voice is synthetic.** Turn on "Add AI label" when publishing on Instagram and the
   AI-generated content label on TikTok. Meta requires the label for realistic-sounding AI
   audio. Instagram's head has said Instagram does not throttle content just for being AI;
   there is no independent data on whether the label changes reach. To avoid the label, record
   the script yourself and rebuild with `--skip-vo` (see the kit README, "Voice options").

## Caption

```
What happens if you die without a will? Your state already has an answer.

Every state has default rules (intestacy law) for who inherits when there's no will. Close relatives are ranked. An unmarried partner usually isn't on the list. And if no parent is left, a judge decides who raises the kids.

These default rules only cover what goes through probate. Accounts with a named beneficiary and jointly owned property usually pass separately.

A will is where you decide instead: who gets what, who you'd name for your kids, who's in charge. It only counts once it's signed, and in most states that means two witnesses.

Which one did you not know?

Want the one-page checklist? Comment LIST and I'll send it.

General information, not legal advice. Plainwill is not a law firm and is not a substitute for the advice of an attorney. Laws vary by state. Plainwill isn't open yet: we're still building it.

#estateplanning #lastwillandtestament #personalfinance #newparents #adulting
```

- The first sentence is the search query the reel answers: Instagram search and Google both read
  captions, not comments.
- Five hashtags is Instagram's cap, and they classify the post rather than add reach.
- The keyword ask lives here and not in the video. See "What the reel asks for" below.

Pinned comment:

```
Which default surprised you most: 1) the ranking, 2) the partner rule, or 3) the judge?
```

## Reply sent to people who comment LIST

```
Here's the one-page checklist: the three decisions a will covers, plus how signing usually works.

It's general information, not legal advice, and laws vary by state. Plainwill isn't a law firm and isn't a substitute for the advice of an attorney. We're still building the service; follow along if you'd like to hear when it opens.
```

Attach `checklist.pdf` (or `checklist.png`, or the link: see decision 6).

**Replying to comments and DMs.** Never answer a question about someone's own state, family or
property: from a brand that is not a law firm, that is individual legal advice. Do not confirm
or deny what a commenter says their state does. Use:

```
That depends on your state and your family, and I can't speak to individual situations. A licensed attorney in your state can.
```

## Upload

- Upload the MP4 as is: do not re-export, add a border, or run it through another app's
  watermark. Turn on "Upload at highest quality" and use Wi-Fi.
- Set `cover.png` as the cover. Its title sits inside the centre 3:4 crop used by the profile
  grid.
- The reel already has its own music bed under the voice. If you add a trending track in the
  editor, keep it far below the voice (the built-in bed sits about 19 dB under).
- Audio is mastered to about −14 LUFS, −1 dBTP.

## What the reel asks for, and why

- **Spoken ask: a send** ("Send this to the person you'd actually pick"). Instagram has named
  watch time, likes and sends as its top ranking signals, with sends per reach weighing most for
  reaching people who don't follow you.
- **End card: a follow, spoken** ("Follow for the rules nobody reads, in plain English"). The
  card is voiced and the music runs to the loop, so the reel never ends in silence.
- **The comment keyword is in the caption only.** Instagram has given "comment a specific word"
  as an example of engagement bait, then said genuine deliver-something flows are not treated
  that way. A new account gets all of its reach from recommendations, so the default cut keeps
  the keyword off the screen and out of the voice. Version B puts it on the end card (the
  comment is typed and liked on screen): test it rather than assume.

### Test versions

| Version | What changes                                                       | How to build                                                                    |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| A       | as built (follow-only end card)                                    | `export/plainwill-no-will.mp4`                                                  |
| B       | end card shows the comment keyword `LIST`                          | `export/plainwill-no-will--list.mp4`                                            |
| C       | last line: "Send this to someone with _no will._"                  | `npm run reel:build -- --reel plainwill-no-will --variant ask-no-will --export` |
| D       | a different hook, e.g. "No will? Your state _already_ has a plan." | add a variant under `variants` in `reel.json`                                   |

Trial Reels show a reel to non-followers first, and are reported to need about 1,000 followers
(not confirmed by Instagram). Until the account qualifies, post A; once it does, run B and C as
Trial Reels and promote the winner after 24–72 hours. Other scripts the writing panel rated as
worth a reel of their own: the guardian angle ("The car seat got more research than this") and
the unmarried-couples angle ("Shared dog. On paper? Usually strangers.").

### What to read in Insights

| Metric                | What it tells you                      | Where to look if it is weak                                                            |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Skip rate (first 3 s) | whether the hook holds                 | test a hook variant (D)                                                                |
| Retention graph       | the exact second people leave          | beat starts: 0.0, 2.5, 4.4, 7.8, 11.2, 14.4, 17.1, 20.1, 23.3, 26.5 s; end card 29.2 s |
| Sends per reach       | the strongest non-follower signal      | test ask variant C                                                                     |
| Likes per reach       | matters most for followers             |                                                                                        |
| Non-follower share    | whether it is being recommended at all | compare A against B                                                                    |

## Other platforms

- **TikTok:** its interface covers more of the bottom and right than Instagram's. The caption
  and fine print are clear of it. Prop text in the right third of the pad (the $0 card, the
  gavel card) may sit under TikTok's action rail, and the footnote chips may sit under its
  caption: check on a phone before posting there. Label the AI voice.
- **YouTube Shorts:** give it a keyword-led title ("What happens if you die without a will?").
  Links in Shorts descriptions and comments are not clickable, so point to the channel profile.
  Loops do not count as engaged views there.

## Claims file

Every factual statement in the reel, with the source it rests on. Keep this with the reel: an
advertiser is expected to hold its substantiation before the ad runs.

| On screen / spoken                                                                                                                                                    | Basis                                                                                                                                                                                                                                                      | Source                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No will? Your state already wrote yours." + chip "your state's default rules (intestacy law)"                                                                        | With no will, the state's intestacy statute determines who inherits. A metaphor, labelled as one on screen.                                                                                                                                                | [Cornell LII, Intestate succession](https://www.law.cornell.edu/wex/intestate_succession)                                                                                                                                                                               |
| "It ranks who gets your stuff. Yes, that sibling too." + card "Typical order": spouse & kids, parents, siblings, other relatives; chip "order + shares vary by state" | Spouse and children have priority, then parents and siblings, then more remote relatives; the rules vary by state. The card shows a typical order only, never shares.                                                                                      | [Cornell LII](https://www.law.cornell.edu/wex/intestate_succession)                                                                                                                                                                                                     |
| "Not married? Your partner usually gets nothing." + card "$0 · no will, most states" + chip "joint accounts + named beneficiaries pass separately"                    | Heirs under intestacy do not include an unmarried partner. Exceptions (registered partners in some states, common-law marriage) are why it says "usually". The default rules cover probate property only, which is what the chip and the post caption say. | [TexasLawHelp, Planning who gets your property](https://texaslawhelp.org/article/estate-planning-planning-who-gets-your-property); for what passes outside the default rules, [Florida Bar, consumer pamphlet](https://www.floridabar.org/public/consumer/pamphlet026/) |
| "Kids? If no parent is left, a judge decides." + chip "a surviving parent normally keeps custody"                                                                     | If no parent survives and no guardian was named, a court appoints one under a best-interests standard.                                                                                                                                                     | [Alaska Court System, Surviving minor children](https://courts.alaska.gov/shc/probate/minors.htm)                                                                                                                                                                       |
| "Usually a relative. Maybe not your pick."                                                                                                                            | Courts generally look to relatives first; a will lets a parent name their own choice.                                                                                                                                                                      | same                                                                                                                                                                                                                                                                    |
| "You can replace it. A will is where you decide."                                                                                                                     | A will replaces the default rules for the property it covers.                                                                                                                                                                                              | [Cornell LII](https://www.law.cornell.edu/wex/intestate_succession)                                                                                                                                                                                                     |
| "Who you'd name for kids" + chip "you name your choice; a court may still OK it"                                                                                      | A will nominates a guardian. Whether a court must appoint or confirm that person depends on the state.                                                                                                                                                     | [Alaska Court System](https://courts.alaska.gov/shc/probate/minors.htm)                                                                                                                                                                                                 |
| "Unsigned? The state's version is still yours." + chip "your will: unsigned"                                                                                          | A will has to be signed by the person making it in every form the sources cover; without a will that meets the signing rules, the default rules apply.                                                                                                     | [N.D. Cent. Code 30.1-08-02](https://ndlegis.gov/cencode/t30-1c08.pdf); [20 Pa.C.S. 2502](https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/20/00.025..HTM); [Cornell LII](https://www.law.cornell.edu/wex/intestate_succession)                                          |
| Chip "most states: signed by you + 2 witnesses"; caption "in most states that means two witnesses"                                                                    | The Uniform Probate Code pattern: in writing, signed, two witnesses. Pennsylvania, Colorado, North Dakota and Louisiana differ, and some states accept handwritten wills without witnesses, which is why it says "most states".                            | [N.D. Cent. Code 30.1-08-02](https://ndlegis.gov/cencode/t30-1c08.pdf)                                                                                                                                                                                                  |
| Caption: "an unmarried partner usually isn't on the list"                                                                                                             | as above                                                                                                                                                                                                                                                   | TexasLawHelp                                                                                                                                                                                                                                                            |

Deliberately **not** in the reel: any price or time claim, any statement that the state "takes"
property (it does so only when there are no legal heirs: [Florida Bar](https://www.floridabar.org/public/consumer/pamphlet026/)),
any fixed share for a spouse, any promise that a will made with the service will hold up, and
any statistic. (A sourced one is available if you want it in the caption: about one in three
U.S. adults has a will, [Pew Research Center, 2025](https://www.pewresearch.org/social-trends/2025/11/06/experiences-with-estate-planning-and-discussing-end-of-life-preferences/).)

Platform statements above come from Instagram's and Meta's own posts and help pages, and from
trade-press transcriptions of statements by Instagram's head (2024–2026). Nothing in them supports
a guarantee of reach: a reel is shown to a small audience first and widened only if people watch,
like and send it.
