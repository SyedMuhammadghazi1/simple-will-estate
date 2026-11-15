#!/usr/bin/env python3
"""Generate the voiceover for a reel and measure when every caption word is spoken.

Each beat is synthesised on its own (so pauses between beats are ours to set), trimmed, and laid
on a single clock. Two files are written next to reel.json:

  vo.wav          the narration, mono, at its final position in time
  timeline.json   beat start/end and per-word start/end; the player reads this, which is what
                  keeps the karaoke captions, the props and the sound effects in sync

Voice engine: Kokoro (Apache-2.0, runs locally on CPU, gives native word timestamps).
Setup (Python 3.10-3.12):  pip install "kokoro>=0.9.4" soundfile numpy
Kokoro downloads its model (and spaCy's small English model) on first run; in a venv without
pip, install that model yourself (see the kit README, "Troubleshooting").
To use a human or another TTS instead, write the same two files yourself: timeline.json's shape
is documented in docs/TEMPLATE-SPEC.md.

  python marketing/reel-kit/scripts/vo.py --reel plainwill-no-will
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

KIT = Path(__file__).resolve().parent.parent
SR = 24_000  # Kokoro's native rate; the mixer resamples to 48 kHz


def parse_caption(markup: str) -> list[str]:
    """Mirror of parseCaption() in player/js/captions.js: one entry per whitespace token."""
    words = []
    for raw in markup.strip().split():
        text = raw[1:] if raw.startswith("*") else raw
        m = re.match(r"^(.*?)\*([.,!?;:…”\"')]*)$", text)
        if m:
            text = m.group(1) + m.group(2)
        words.append(text)
    return words


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def trim(audio: np.ndarray, threshold_db: float = -42.0, pad: float = 0.012):
    """Trim leading/trailing near-silence. Returns (audio, seconds removed from the front)."""
    level = 10 ** (threshold_db / 20)
    win = int(SR * 0.008)
    env = np.sqrt(np.convolve(audio**2, np.ones(win) / win, mode="same"))
    loud = np.nonzero(env > level)[0]
    if len(loud) == 0:
        return audio, 0.0
    a = max(0, loud[0] - int(pad * SR))
    b = min(len(audio), loud[-1] + int(pad * SR * 3))
    out = audio[a:b].copy()
    fade = int(SR * 0.004)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out, a / SR


def align(words: list[str], tokens: list[tuple[str, float, float]]):
    """Give every caption word the start/end of the synthesised tokens that spell it."""
    timed = []
    ti = 0
    last_end = tokens[0][1] if tokens else 0.0
    for word in words:
        target = norm(word)
        if not target:  # a lone dash or ampersand: nothing is spoken for it
            timed.append((last_end, last_end, True))
            continue
        acc = ""
        start = end = None
        while ti < len(tokens) and len(acc) < len(target):
            text, ts, te = tokens[ti]
            ti += 1
            n = norm(text)
            if not n:
                continue
            if start is None:
                start = ts
            end = te
            acc += n
        timed.append((start, end, acc == target))
        if end is not None:
            last_end = end
    return timed


def spread(words: list[str], t0: float, t1: float):
    """Fallback when alignment fails: share the voiced span by word length."""
    weights = [len(norm(w)) + 2 for w in words]
    total = sum(weights)
    out = []
    t = t0
    for w in weights:
        d = (t1 - t0) * w / total
        out.append((t, t + d * 0.9))
        t += d
    return out


def ensure_espeak_data() -> None:
    """Kokoro's fallback phonemiser (espeak-ng, bundled by espeakng-loader) can ignore the data
    path it is handed and abort with "phontab: No such file". espeak-ng also looks in
    ~/espeak-ng-data, so point that at the bundled data when nothing is there yet."""
    link = Path.home() / "espeak-ng-data"
    if link.exists():
        return
    try:
        import espeakng_loader

        if link.is_symlink():  # dangling link from a deleted environment: re-point it
            link.unlink()
        link.symlink_to(espeakng_loader.get_data_path(), target_is_directory=True)
        print(f"  note: linked {link} -> bundled espeak-ng data")
    except Exception as err:  # best effort: Kokoro may work without it on this machine
        print(f"  note: could not link espeak-ng data ({err})", file=sys.stderr)


def speak(pipe, say: str, voice: str, speed: float):
    """Synthesise one line. Returns (trimmed audio, tokens with times, seconds trimmed off the front)."""
    chunks, tokens, offset = [], [], 0.0
    for result in pipe(say, voice=voice, speed=speed, split_pattern=r"\n+"):
        audio = result.audio.numpy() if hasattr(result.audio, "numpy") else np.asarray(result.audio)
        for tk in result.tokens or []:
            if tk.start_ts is not None and tk.end_ts is not None:
                tokens.append((tk.text, offset + tk.start_ts, offset + tk.end_ts))
        chunks.append(audio.astype(np.float32))
        offset += len(audio) / SR
    if not chunks:
        raise SystemExit(f"the voice engine returned no audio for {say!r}")
    audio, cut = trim(np.concatenate(chunks))
    return audio, tokens, cut


def place_words(words: list[str], tokens, cut: float, vo_at: float, dur: float, label: str, aligned_ok: bool = True):
    """Per-word start/end on the reel's clock, kept inside the clip and strictly increasing."""
    timed = align(words, tokens)
    if aligned_ok and all(s is not None and good for s, _, good in timed):
        word_times = [(vo_at + s - cut, vo_at + e - cut) for s, e, _ in timed]
    else:
        if aligned_ok:
            print(f"  note: {label}: could not align words, spreading evenly", file=sys.stderr)
        word_times = spread(words, vo_at, vo_at + dur)
    fixed = []
    prev = vo_at
    for s, e in word_times:
        s = min(max(s, prev), vo_at + dur)
        e = min(max(e, s + 0.03), vo_at + dur + 0.05)
        fixed.append({"t0": round(s, 3), "t1": round(e, 3)})
        prev = s + 0.02
    return fixed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--reel", required=True, help="folder name under marketing/reel-kit/reels")
    ap.add_argument("--voice", help="override reel.json voice.voice (e.g. af_heart, am_michael)")
    ap.add_argument("--speed", type=float, help="override reel.json voice.speed")
    args = ap.parse_args()

    reel_dir = KIT / "reels" / args.reel
    reel = json.loads((reel_dir / "reel.json").read_text())
    vcfg = reel.get("voice", {})
    voice = args.voice or vcfg.get("voice", "af_heart")
    speed = args.speed or vcfg.get("speed", 1.1)
    lead = vcfg.get("lead", 0.1)
    gap = vcfg.get("gap", 0.16)
    fps = reel.get("fps", 30)

    ensure_espeak_data()
    from kokoro import KPipeline  # imported late so --help works without the model

    pipe = KPipeline(lang_code=vcfg.get("lang", "a"), repo_id="hexgrad/Kokoro-82M")

    cursor = 0.0
    placed = []  # (start_sample, audio)
    beats_out = []
    for beat in reel["beats"]:
        words = parse_caption(beat["caption"])
        say = beat.get("say") or " ".join(words)
        audio, tokens, cut = speak(pipe, say, voice, beat.get("speed", speed))
        dur = len(audio) / SR

        start = cursor
        vo_at = start + beat.get("lead", lead)
        # a beat with its own `say` is spoken differently from its caption: spread the words
        fixed = place_words(words, tokens, cut, vo_at, dur, f"beat {beat['id']}", "say" not in beat)
        end = vo_at + dur + beat.get("gap", gap)
        # snap beat boundaries to frames so captions swap exactly on a frame
        end = round(end * fps) / fps
        beats_out.append({
            "id": beat["id"],
            # the wording these timings belong to: the player refuses them if the caption changes
            "text": " ".join(words),
            "start": round(start, 6),
            "end": round(end, 6),
            "vo": [round(vo_at, 3), round(vo_at + dur, 3)],
            "words": fixed,
        })
        placed.append((int(round(vo_at * SR)), audio))
        wpm = len(words) / max(dur, 1e-6) * 60
        print(f"  {beat['id']:<12} {start:6.2f}-{end:6.2f}s  {len(words):2d} words  {wpm:5.0f} wpm  {say}")
        cursor = end

    card = reel.get("endcard") or {}
    hold = card.get("hold", 2.5) if card else 0.0
    end_out = None
    if card.get("say"):
        # a spoken end card: same voice, starting just after the card appears
        say_words = parse_caption(card["say"])
        say = " ".join(say_words)
        audio, tokens, cut = speak(pipe, say, voice, card.get("speed", speed))
        dur = len(audio) / SR
        vo_at = cursor + card.get("lead", 0.3)
        end_out = {
            "text": say,
            "vo": [round(vo_at, 3), round(vo_at + dur, 3)],
            "words": place_words(say_words, tokens, cut, vo_at, dur, "end card"),
        }
        placed.append((int(round(vo_at * SR)), audio))
        # the card never ends before the line does (the same rule as player/js/timeline.js)
        hold = max(hold, vo_at + dur + 0.9 - cursor)
        print(f"  {'endcard':<12} {cursor:6.2f}-{cursor + hold:6.2f}s  {len(say_words):2d} words  {say}")
    total = round((cursor + hold) * fps) / fps
    track = np.zeros(int(total * SR) + SR // 10, dtype=np.float32)
    for at, audio in placed:
        track[at : at + len(audio)] += audio[: len(track) - at]
    peak = float(np.max(np.abs(track))) or 1.0
    track *= 0.89 / peak
    sf.write(reel_dir / "vo.wav", track[: int(total * SR)], SR, subtype="PCM_16")

    spoken = sum(len(parse_caption(b["caption"])) for b in reel["beats"])
    timeline = {
        "generated_by": "scripts/vo.py",
        "voice": {"engine": "kokoro", "voice": voice, "speed": speed},
        "fps": fps,
        "duration": total,
        "beats": beats_out,
    }
    if end_out:
        timeline["endcard"] = end_out
    (reel_dir / "timeline.json").write_text(json.dumps(timeline, indent=2) + "\n")
    print(f"vo.wav + timeline.json written: {total:.2f}s total, narration ends {cursor:.2f}s, "
          f"{spoken} words, {spoken / cursor * 60:.0f} wpm overall")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
