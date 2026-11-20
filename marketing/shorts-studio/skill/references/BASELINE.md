# Baseline study: what high-baseline, frequent-outlier creators do in the edit

26 Oct 2026. Read-only study (no network, no lab.py runs). Data: IG Outlier Lab clone (43 creators, 1,971 reels, 28-day window)
and the reel hook lab (58 reels measured frame by frame). Scripts and data in this folder (`scripts/`, `data/`, `rules.json`).

## Who
- Baseline = a creator's median plays. Breakout = 15x their median. Only creators with 10+ reels (36).
- **CORE = median 10k+ AND 5%+ Breakouts:** chase.h.ai, wassimyounes_, opusjake, mavgpt, cooper.simson, kayvon.ai (436 reels).
- The very top baselines (rpn, nick_saraev, nateherkai) rarely break out: consistent, not spiky.
- A low median makes 15x easy: half the top Breakout rates are creators under 3,500 median.

## The short answer
1. CORE outliers are **less busy** than low-baseline outliers: less text, fewer animations in the first 5 s, more hard cuts, shorter shots.
2. Across all 36 creators, a **news first line** ("X just launched / just killed Y") tracks baseline (Spearman 0.64, p < 0.001).
3. Caveat: the hook lab measured only outliers. These rules are how high-baseline creators edit; they are not yet proven to cause a breakout.

## Rules (BL01 to BL19, full evidence in rules.json)
| id | rule | evidence | confidence |
|---|---|---|---|
| BL01 | Text on screen in at most 70% of body frames (aim ~55%) | CORE 0.53 (n=7) vs low base 0.92 (n=22), p=0.008; 10k+ 0.79 vs 0.93, p=0.004 | strong |
| BL02 | At most 2 overlay words per frame (median) | CORE 1 vs 4 (p=0.052) | medium |
| BL03 | At most 3 designed animations in 0 to 5 s (target 2) | CORE 2 vs 5 (p=0.048) | medium |
| BL04 | No forced animation in the first second; the motion is the proof | 12/24 10k+ animate by 1 s vs 20/25 (p=0.033) | medium |
| BL05 | Body hard cuts 2+ per 10 s | CORE 3.27 vs 1.68 (p=0.11) | medium |
| BL06 | Median shot 3.0 s or less | CORE 2.67 s; 10k+ 3.05 vs 6.03 (p=0.077) | medium |
| BL07 | First cut by 3.5 s | 10k+ 3.34 vs 7.37 (p=0.031); CORE alone 5.47 | weak |
| BL08 | Speaker face on screen at most 70% of the body; cut away to the proof | 10k+ 0.63 vs 1.00 (p=0.033) | weak |
| BL09 | Open on the proof (greenscreen over the post, split with proof on top, or proof first) | CORE 6/7 vs 14/22 | weak |
| BL10 | First spoken line is a news drop (named product + "just launched...") | rho 0.64 with baseline, n=36 creators, 1,962 transcripts | strong (baseline) |
| BL11 | Spoken pace 4.0+ words/s; cut dead air | CORE 4.28 (n=430) vs 3.51 (n=1,532) | medium |
| BL12 | Speech, face and text all start at 0.0 s | median 0.0 s in every group | strong (norm) |
| BL13 | 10 to 14 spoken words in 0 to 3 s | median 10 (n=55) | medium (norm) |
| BL14 | Burned-in captions optional; if used, word by word, no keyword colour | CORE no captions 6/10 vs 5/24 | weak |
| BL15 | Few SFX (CORE median 0 per 10 s); none required in 0 to 5 s | detector catches ~1 in 4 | weak |
| BL16 | Music optional; if used, from 0.0 s, 12 to 16 dB under the voice | n=24 / n=18 | medium (norm) |
| BL17 | Mix at -14 LUFS +-0.5 | median -14.2, n=55 | strong (norm) |
| BL18 | Length 30 to 55 s; outliers run 2.4 s longer than the creator's typical | 19 of 33 creators | medium |
| BL19 | End on "follow + comment [WORD]" (default, no proven lift) | no lift within creators, n=33 | weak |

## Gaps
- No typical (non-outlier) CORE reels are measured yet. Adding 36 (4 typical + 2 outliers per CORE creator, list in data/to_add.json)
  costs about $0.08 of Apify credit and would move BL01 to BL06 from "house style" to "tested". Not run: needs Jack's go.
- Not measurable from outside: retention, saves, shares. SFX detector catches ~1 in 4.
