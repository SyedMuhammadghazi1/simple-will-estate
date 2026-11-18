# Posting kit: "Buying GTA 6 could actually save you $5,968."

An Echelons AI reel in the "boy maths" format, styled as a neon sunset city with official GTA VI artwork (logo, key art, Jason and Lucia, the animated stickers), a game-style cash counter and a synthwave bed: what GTA 6 costs per hour, what the same
nights would cost as date nights, and what that money would have done in Take-Two stock,
depending on when it was bought.

| File                            | What it is                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `export/echelons-gta-maths.mp4` | the reel: 1080 × 1920, 30 fps, H.264 High, AAC 48 kHz, 63 s |
| `export/cover.png`              | cover: a real frame of the reel (the hook figure)           |
| `export/captions.srt`           | subtitles, plus the end card's on-screen disclaimer         |

## Before you post

1. **The stock figures are as of the 17 November 2026 close** ($203.93). The share price
   moves every day. If you post later, rebuild with the latest close (see "Updating the
   numbers"), or the "$7,724" and "$4,754" lines will be out of date.
2. **No performance claims for Echelons AI.** The reel says what Echelons is ("your own AI
   market research assistant") and nothing about returns, picks or accuracy. Keep it that way
   unless you have documented results and a compliance review: financial promotions are
   regulated.
3. **The disclaimers stay on.** "Not financial advice · not affiliated with Rockstar" is on
   screen for the whole reel, and the end card adds "For education only. Not financial
   advice. Past performance does not predict future results."
4. **Official GTA VI artwork, used under your permission.** The reel uses Rockstar's GTA VI
   logo, key art, character art and the animated stickers from rockstargames.com/VI, on your
   word that your creator agreement allows commercial use. Keep that agreement on file: this
   reel promotes Echelons, and Rockstar's public fan-content policy on its own covers
   non-commercial use and excludes advertisements. The artwork is not committed to the repo;
   `fetch-assets.sh` downloads and prepares it before a rebuild. Keep the "not affiliated with
   Rockstar" line unless your agreement says otherwise.
5. **The voice is synthetic.** Turn on Instagram's AI label when you publish.
6. **What is the kit's own:** the animated sunset city, the cash counter, the captions (Anton,
   an open-licence font, not the GTA font) and the synthwave music.
7. **The earlier minimal look** is still available: `npm run reel:build -- --reel echelons-gta-maths --variant minimal --export`.
8. **On the reference reel:** this is a new reel in the same format, not a copy. The script,
   the graphics and the numbers are new (the numbers are recalculated from today's prices and
   a different assumption: 5 hours a night instead of 4).

## Caption

```
Buying GTA 6 could actually save you money. Boy maths, but the stock part is real.

The game: $79.99. One Rockstar studio head's own playthrough took about 80 hours. Add side missions and say 160 hours: that's 50 cents an hour.

At 5 hours a night that's 32 nights. The average US date night now costs $189 all-in (BMO, 2026), so 32 of them is $6,048. Minus the game: $5,968 "saved".

Put $5,968 into Take-Two on December 4, 2023, the day GTA 6's first trailer dropped, and it's worth about $7,724 today. Put it in on January 1 this year and it's about $4,754. Same stock, different timing.

Echelons AI is your own AI market research assistant. Follow for more money maths.

For education only. Not financial advice. Past performance does not predict future results. Share prices are closing prices, price only, as of November 17, 2026. Not affiliated with Rockstar Games or Take-Two Interactive.

#gta6 #investing #stockmarket #personalfinance #moneytips
```

## Rebuilding

The official artwork is not in the repo. Fetch it first, then build:

```
bash marketing/reel-kit/reels/echelons-gta-maths/fetch-assets.sh
npm run reel:build -- --reel echelons-gta-maths --export
```

## Updating the numbers

The stock maths is: shares = $5,968 ÷ the close on the buy date; value = shares × the latest
close. With Take-Two's closes of $157.56 (4 Dec 2023), $256.03 (31 Dec 2025) and the latest
close, change the two captions ("today" and "jan-value" beats), the two figures in the "same"
beat, the chart's `foot` label and its `data` (the last point), then rebuild:
`npm run reel:build -- --reel echelons-gta-maths --export`.

## Claims file

| On screen / spoken                                             | Basis                                                                                                                                                                                                     | Source                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The game itself is $79.99."                                   | US standard edition list price.                                                                                                                                                                           | [Take-Two, 24 Jun 2026](https://www.take2games.com/ir/news/rockstar-games-announces-pre-orders-grand-theft-auto-vi)                                                                                                                                                               |
| "Rockstar's studio head said his own run took about 80 hours." | Rob Nelson, co-studio head of Rockstar North, said his own playthrough (story plus some optional goals) took about 80 hours. One person's run, not an official time to beat; the card says "as reported". | Reported widely from his interview, e.g. [VICE](https://www.vice.com/en/article/gta-6-how-long-to-complete-80-hours/), [TechRadar](https://techradar.com/gaming/gta-6-will-be-a-massive-game-and-rockstars-longest-yet-as-the-studio-confirms-it-can-take-up-to-80-hours-to-beat) |
| "say it doubles to 160"                                        | An assumption, labelled "let's say" on screen.                                                                                                                                                            | —                                                                                                                                                                                                                                                                                 |
| "Play five hours a night… 32 nights"                           | 160 ÷ 5 = 32. An assumption.                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                 |
| "the average date night in America is now $189"                | BMO Real Financial Progress Index: average all-in date $189 in 2026 (survey Dec 2025 to Jan 2026).                                                                                                        | [BMO, 11 Feb 2026](https://usnewsroom.bmo.com/2026-02-11-Date-flation-Hits-Hard-Average-Date-Spend-Nears-200-BMO-Real-Financial-Progress-Index)                                                                                                                                   |
| "32 dates is $6,048… $5,968 saved"                             | 32 × $189 = $6,048; minus $79.99 = $5,968.01.                                                                                                                                                             | arithmetic                                                                                                                                                                                                                                                                        |
| "the day trailer one dropped"                                  | Trailer 1 was released on 4 December 2023 (evening, after an online leak). The reel uses that day's close, $157.56.                                                                                       | [CNBC, 4 Dec 2023](https://www.cnbc.com/2023/12/04/take-two-stock-slips-as-rockstar-games-posts-grand-theft-auto-trailer.html)                                                                                                                                                    |
| "today it'd be worth $7,724"                                   | $5,968 ÷ $157.56 × $203.93 (17 Nov 2026 close) = $7,724. Price only; Take-Two pays no dividend.                                                                                                           | Yahoo Finance daily closes for TTWO                                                                                                                                                                                                                                               |
| "Bought on January 1st… $4,754"                                | Markets are closed on 1 January, so the reel uses the 31 Dec 2025 close, $256.03: $5,968 ÷ $256.03 × $203.93 = $4,754.                                                                                    | Yahoo Finance; [StockScan](https://stockscan.io/stocks/TTWO/price-history)                                                                                                                                                                                                        |
| Chart                                                          | Weekly closing prices of TTWO, 4 Dec 2023 to 17 Nov 2026, scaled to the value of $5,968.                                                                                                                  | Yahoo Finance daily closes                                                                                                                                                                                                                                                        |
