#!/usr/bin/env python3
"""Build the final audio for a reel: narration + synthesised sound effects, loudness-normalised.

Reads   reels/<slug>/vo.wav         from scripts/vo.py
        reels/<slug>/cues.json      sound cues exported by the player (same clock as the picture)
Writes  reels/<slug>/mix.wav        48 kHz stereo, about -14 LUFS integrated, -1 dBTP

Every effect is generated here from oscillators and filtered noise, so there is nothing to
license and the mix is reproducible. Add an effect by writing a function and registering it in
SFX; trigger it from reel.json ("sfx": [{ "at": "w:judge", "name": "gavel" }]) or from a prop's
sfx() hook.

  python marketing/reel-kit/scripts/mix.py --reel plainwill-no-will
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

KIT = Path(__file__).resolve().parent.parent
SR = 48_000


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def env_exp(dur: float, decay: float, attack: float = 0.002) -> np.ndarray:
    t = t_axis(dur)
    return np.minimum(1.0, t / max(attack, 1e-4)) * np.exp(-t / decay)


def noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n).astype(np.float64)


def svf_bandpass(x: np.ndarray, freq: np.ndarray, q: float = 1.2) -> np.ndarray:
    """State-variable band-pass with a per-sample cutoff (lets noise sweep like a whoosh)."""
    low = band = 0.0
    out = np.empty_like(x)
    f = 2 * np.sin(np.pi * np.clip(freq, 20, SR / 6) / SR)
    damp = 1 / q
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - damp * band
        band += f[i] * high
        out[i] = band
    return out


def one_pole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    out = np.empty_like(x)
    y = 0.0
    for i in range(len(x)):
        y = (1 - a) * x[i] + a * y
        out[i] = y
    return out


def sweep_sine(f0: float, f1: float, dur: float) -> np.ndarray:
    t = t_axis(dur)
    freq = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


# ---- effects ---------------------------------------------------------------------------------


def whoosh(seed=1, rising=True, dur=0.34, **_):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    f = 380 * (7.5 ** t) if rising else 2600 * (0.16 ** t)
    body = svf_bandpass(noise(n, seed), f, q=1.6)
    peak = 0.62 if rising else 0.22
    shape = np.where(t < peak, (t / peak) ** 2.2, ((1 - t) / (1 - peak)) ** 1.6)
    return body * shape * 0.55


def whoosh_in(seed=1, **kw):
    return whoosh(seed, rising=True, dur=0.36)


def whoosh_out(seed=2, **kw):
    return whoosh(seed, rising=False, dur=0.3)


def pop(seed=3, pitch=1.0, **_):
    dur = 0.11
    return sweep_sine(980 * pitch, 300 * pitch, dur) * env_exp(dur, 0.028) * 0.8


def tick(seed=4, pitch=1.0, **_):
    dur = 0.035
    click = noise(int(dur * SR), seed) * env_exp(dur, 0.0025)
    tone = np.sin(2 * np.pi * 2300 * pitch * t_axis(dur)) * env_exp(dur, 0.007)
    return (click * 0.35 + tone * 0.5) * 0.6


def key(seed=5, **_):
    rng = np.random.default_rng(seed)
    pitch = 1 + (rng.random() - 0.5) * 0.25
    dur = 0.06
    thock = np.sin(2 * np.pi * 620 * pitch * t_axis(dur)) * env_exp(dur, 0.011)
    click = noise(int(dur * SR), seed) * env_exp(dur, 0.002)
    return (thock * 0.6 + click * 0.3) * 0.55


def ding(seed=6, pitch=1.0, **_):
    dur = 0.9
    t = t_axis(dur)
    f = 1318.5 * pitch
    partials = [(1.0, 1.0, 0.32), (2.76, 0.38, 0.16), (5.4, 0.16, 0.07)]
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in partials)
    return out * np.minimum(1, t / 0.002) * 0.42


def chime(seed=7, **_):
    a = ding(pitch=1.0)
    b = ding(pitch=1.335)
    out = np.zeros(len(a) + int(0.11 * SR))
    out[: len(a)] += a * 0.9
    out[int(0.11 * SR) :] += b
    return out


def counter(seed=8, dur=0.8, **_):
    """A run of ticks that slows as the number lands, rising slightly in pitch."""
    out = np.zeros(int((dur + 0.1) * SR))
    t = 0.0
    step = 0.035
    i = 0
    while t < dur:
        s = tick(seed + i, pitch=0.85 + 0.35 * (t / dur)) * (0.45 + 0.4 * (t / dur))
        at = int(t * SR)
        out[at : at + len(s)] += s[: len(out) - at]
        step = 0.034 + 0.07 * (t / dur) ** 3
        t += step
        i += 1
    return out


def thud(seed=9, **_):
    dur = 0.3
    body = sweep_sine(130, 48, dur) * env_exp(dur, 0.075, attack=0.001)
    slap = one_pole_lp(noise(int(dur * SR), seed), 1400) * env_exp(dur, 0.012)
    return body * 0.95 + slap * 0.5


def stamp(seed=10, **_):
    hit = thud(seed)
    paper_tail = paper(seed + 1) * 0.35
    out = np.zeros(max(len(hit), len(paper_tail) + int(0.03 * SR)))
    out[: len(hit)] += hit
    out[int(0.03 * SR) : int(0.03 * SR) + len(paper_tail)] += paper_tail
    return out


def gavel(seed=11, **_):
    def knock(s):
        dur = 0.2
        wood = (
            np.sin(2 * np.pi * 410 * t_axis(dur)) * env_exp(dur, 0.03)
            + 0.5 * np.sin(2 * np.pi * 930 * t_axis(dur)) * env_exp(dur, 0.014)
            + 0.8 * sweep_sine(150, 70, dur) * env_exp(dur, 0.05)
        )
        return wood + one_pole_lp(noise(int(dur * SR), s), 2500) * env_exp(dur, 0.006) * 0.6

    a, b = knock(seed), knock(seed + 1)
    out = np.zeros(len(a) + int(0.19 * SR))
    out[: len(a)] += a
    out[int(0.19 * SR) :] += b * 0.85
    return out * 0.75


def paper(seed=12, **_):
    dur = 0.24
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    body = svf_bandpass(noise(n, seed), 2400 + 1800 * np.sin(t * 9), q=0.9)
    flutter = 0.6 + 0.4 * np.abs(np.sin(t * 34 + seed))
    return body * flutter * np.sin(t * np.pi) ** 0.8 * 0.4


def scribble(seed=13, dur=0.6, **_):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    body = svf_bandpass(noise(n, seed), 3200 + 900 * np.sin(t * 40), q=1.4)
    strokes = np.clip(np.sin(t * dur * 2 * np.pi * 7.5), 0, 1) ** 0.6
    return body * strokes * np.minimum(1, (1 - t) * 8) * 0.3


def coin(seed=14, pitch=1.0, **_):
    dur = 0.4
    t = t_axis(dur)
    out = np.sin(2 * np.pi * 3140 * pitch * t) * np.exp(-t / 0.09) + 0.6 * np.sin(2 * np.pi * 4720 * pitch * t) * np.exp(-t / 0.06)
    return out * np.minimum(1, t / 0.001) * 0.3


def buzz(seed=15, **_):
    dur = 0.24
    t = t_axis(dur)
    sq = np.sign(np.sin(2 * np.pi * 148 * t)) * 0.5 + np.sin(2 * np.pi * 148 * t) * 0.5
    gate = ((t < 0.09) | (t > 0.13)).astype(float)
    return one_pole_lp(sq * gate, 1800) * np.minimum(1, (dur - t) / 0.02) * 0.4


def swell(seed=16, dur=0.55, **_):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    air = svf_bandpass(noise(n, seed), 500 * (9 ** t), q=1.1) * t**2.4
    tone = sweep_sine(196, 392, dur) * t**2 * 0.35
    tail = np.minimum(1, (1 - t) / 0.06)
    return (air * 0.6 + tone) * tail * 0.6


def sub(seed=17, dur=1.1, **_):
    t = t_axis(dur)
    body = sweep_sine(74, 40, dur) * np.minimum(1, t / 0.012) * np.exp(-t / 0.42)
    rumble = one_pole_lp(noise(len(t), seed), 160) * np.exp(-t / 0.3) * 1.6
    hit = one_pole_lp(noise(len(t), seed + 1), 900) * env_exp(dur, 0.02) * 0.8
    # 150-400 Hz thump: the part of the hit that survives a phone speaker
    thump = (sweep_sine(360, 150, dur) + 0.5 * sweep_sine(720, 300, dur)) * env_exp(dur, 0.06, attack=0.001) * 0.7
    return (body + rumble + hit + thump) * 0.9


def cut(seed=20, **_):
    """The soft low swell under every caption cut: felt on headphones, invisible on a phone speaker."""
    dur = 0.6
    t = np.linspace(0, 1, int(dur * SR))
    # fixed seed and a two-pole low-pass: the same sample on every cut, nothing above ~80 Hz
    rumble = one_pole_lp(one_pole_lp(noise(len(t), 20), 70), 70) * 14.0
    body = rumble + np.sin(2 * np.pi * 46 * t * dur) * 0.6
    return body * t**1.6 * np.minimum(1, (1 - t) / 0.04) * 0.5


def drone(seed=21, dur=2.0, **_):
    """Held rumble for a dark beat."""
    t = t_axis(dur)
    shape = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)
    body = np.sin(2 * np.pi * 49 * t) * 0.5 + np.sin(2 * np.pi * 73.5 * t) * 0.18
    air = one_pole_lp(noise(len(t), seed), 120) * 2.2
    return (body + air) * shape * 0.5


def click(seed=18, **_):
    dur = 0.03
    return (noise(int(dur * SR), seed) * env_exp(dur, 0.0018) * 0.5 + np.sin(2 * np.pi * 1500 * t_axis(dur)) * env_exp(dur, 0.004) * 0.4) * 0.6


def sparkle(seed=19, **_):
    out = np.zeros(int(0.7 * SR))
    rng = np.random.default_rng(seed)
    for i in range(6):
        d = ding(pitch=1.5 + rng.random() * 1.6)[: int(0.35 * SR)] * (0.5 - i * 0.05)
        at = int(i * 0.055 * SR)
        out[at : at + len(d)] += d[: len(out) - at]
    return out * 0.6


SFX = {
    "whoosh-in": (whoosh_in, 0.3),
    "whoosh-out": (whoosh_out, 0.26),
    "pop": (pop, 0.4),
    "tick": (tick, 0.55),
    "key": (key, 0.5),
    "click": (click, 0.55),
    "ding": (ding, 0.55),
    "chime": (chime, 0.5),
    "sparkle": (sparkle, 0.45),
    "counter": (counter, 0.5),
    "thud": (thud, 0.5),
    "stamp": (stamp, 0.5),
    "gavel": (gavel, 0.5),
    "paper": (paper, 0.55),
    "scribble": (scribble, 0.55),
    "coin": (coin, 0.5),
    "buzz": (buzz, 0.5),
    "swell": (swell, 0.55),
    "sub": (sub, 0.85),
    "cut": (cut, 0.28),
    "drone": (drone, 0.45),
}


# ---- music bed ----------------------------------------------------------------------------------
# An original four-bar loop, synthesised: soft electric-piano chords over a sine bass with a felt
# kick. It sits far under the voice (see BED_DB) and stops before the call to action so the ask
# lands on dry voice. Swap PROGRESSION / BPM to re-key it for another brand.

BPM = 78
BED_DB = -19.0  # relative to the voice
PROGRESSION = [
    (38, [57, 61, 64, 66]),  # Dmaj9
    (47, [57, 59, 62, 66]),  # Bm7
    (43, [55, 59, 62, 66]),  # Gmaj7
    (45, [55, 57, 62, 64]),  # A7sus4
]


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def epiano(note: int, dur: float, vel: float = 1.0) -> np.ndarray:
    t = t_axis(dur)
    f = midi(note)
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.05) * 0.35  # short bell-like bite
    tone = np.sin(2 * np.pi * f * t + tine) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.7)
    trem = 1 + 0.07 * np.sin(2 * np.pi * 4.3 * t)
    return tone * np.minimum(1, t / 0.006) * np.exp(-t / 1.35) * trem * vel


def music_bed(n: int, until: float, seed: int = 7, fade: float | None = None) -> np.ndarray:
    beat = 60 / BPM
    bar = beat * 4
    out = np.zeros(n)
    bars = int(np.ceil(until / bar))

    def add(sound: np.ndarray, at: float) -> None:
        i = int(at * SR)
        if i >= n:
            return
        sound = sound[: n - i]
        out[i : i + len(sound)] += sound

    for b in range(bars):
        bass, chord = PROGRESSION[b % len(PROGRESSION)]
        t0 = 0.04 + b * bar
        for k, note in enumerate(chord):
            add(epiano(note, bar * 1.1, 0.5) * 0.3, t0 + k * 0.014)
            add(epiano(note, beat * 1.6, 0.3) * 0.22, t0 + beat * 2.5 + k * 0.011)  # soft re-voice
        tb = t_axis(bar)
        add(np.sin(2 * np.pi * midi(bass) * tb) * np.minimum(1, tb / 0.012) * np.exp(-tb / 1.1) * 0.55, t0)
        for kick_at in (0.0, beat * 2):
            add(sweep_sine(92, 44, 0.2) * env_exp(0.2, 0.06) * 0.5, t0 + kick_at)
    out = one_pole_lp(out, 3000)
    # one-bar fade so the bed is gone exactly where the ask begins (or a short one into the loop)
    fade_len = int(min(bar if fade is None else fade, until) * SR)
    end = int(until * SR)
    env = np.ones(n)
    env[max(0, end - fade_len) : end] = np.linspace(1, 0, min(fade_len, end)) ** 1.5
    env[end:] = 0
    return out * env


# ---- synthwave bed (music.style: "synthwave") ---------------------------------------------------
# An original 100 BPM loop in A minor (Am - F - C - G): pulsing saw bass, a soft detuned pad, a
# 16th-note arpeggio and a drum machine (kick on every beat, clap on 2 and 4, closed hats).

SYNTH_BPM = 100
SYNTH_PROG = [
    (45, [57, 60, 64]),  # Am
    (41, [53, 57, 60]),  # F
    (48, [55, 60, 64]),  # C
    (43, [55, 59, 62]),  # G
]


def saw(f: float, dur: float, harmonics: int = 10) -> np.ndarray:
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * 0.6


def synth_bed(n: int, until: float, fade: float = 1.0) -> np.ndarray:
    beat = 60 / SYNTH_BPM
    bar = beat * 4
    bars = int(np.ceil(until / bar))
    rng = np.random.default_rng(3)
    # one buffer per instrument, each filtered once at the end
    pad_bus, bass_bus, arp_bus, drum_bus = (np.zeros(n) for _ in range(4))

    def add(bus: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0) -> None:
        i = int(at * SR)
        if i >= n:
            return
        sound = sound[: n - i]
        bus[i : i + len(sound)] += sound * gain

    hat = noise(int(0.04 * SR), 4)
    hat = (hat - one_pole_lp(hat, 7000)) * env_exp(0.04, 0.012)
    clap = noise(int(0.22 * SR), 5)
    clap = svf_bandpass(clap, np.full(len(clap), 1500.0), 0.9) * env_exp(0.22, 0.07)
    kick = sweep_sine(120, 42, 0.28) * env_exp(0.28, 0.09)
    tp = t_axis(bar * 1.05)
    pad_env = np.minimum(1, tp / 0.35) * np.exp(-tp / 3.0)
    tb = t_axis(beat * 0.45)
    ta = t_axis(beat * 0.22)
    for b in range(bars):
        root, chord = SYNTH_PROG[b % len(SYNTH_PROG)]
        t0 = 0.02 + b * bar
        for note in chord:  # pad: detuned saws an octave below the chord
            for det in (-0.06, 0.06):
                add(pad_bus, saw(midi(note - 12 + det), bar * 1.05, 6) * pad_env, t0, 0.07)
        for k in range(8):  # bass: 8th-note pulses on the root
            add(bass_bus, saw(midi(root - 12), beat * 0.45, 8) * np.exp(-tb / 0.16), t0 + k * beat / 2, 0.32)
        pattern = [0, 1, 2, 1, 2, 0, 1, 2]
        for k in range(16):  # arpeggio: 16ths, an octave up
            note = chord[pattern[k % 8]] + 12
            add(arp_bus, saw(midi(note), beat * 0.22, 5) * np.exp(-ta / 0.05), t0 + k * beat / 4, 0.09)
        for k in range(4):
            add(drum_bus, kick, t0 + k * beat, 0.55)
            if k % 2 == 1:
                add(drum_bus, clap, t0 + k * beat, 0.25)
        for k in range(8):
            add(drum_bus, hat, t0 + k * beat / 2 + beat / 4, 0.08 + 0.03 * rng.random())
    out = one_pole_lp(pad_bus, 1400) + one_pole_lp(bass_bus, 700) + one_pole_lp(arp_bus, 2600) + drum_bus
    fade_len = int(min(fade, until) * SR)
    end = int(until * SR)
    env = np.ones(n)
    env[max(0, end - fade_len) : end] = np.linspace(1, 0, min(fade_len, end)) ** 1.5
    env[end:] = 0
    return out * env


def ffmpeg(*args: str) -> str:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg failed:\n{proc.stderr[-1500:]}")
    return proc.stderr


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--reel", required=True)
    ap.add_argument("--sfx-gain", type=float, default=1.0, help="scale all effects (0 = voice only)")
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--no-music", action="store_true", help="voice and effects only")
    args = ap.parse_args()

    reel_dir = KIT / "reels" / args.reel
    cues = json.loads((reel_dir / "cues.json").read_text())["sfx"]
    timeline = json.loads((reel_dir / "timeline.resolved.json").read_text())
    reel = json.loads((reel_dir / "reel.json").read_text())
    duration = timeline["duration"]
    n = int(round(duration * SR))

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # narration: resample, tame rumble, even out the level, add a touch of presence
        vo48 = tmp / "vo48.wav"
        ffmpeg(
            "-y", "-i", str(reel_dir / "vo.wav"), "-ar", str(SR), "-ac", "1",
            "-af",
            "highpass=f=75,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3,"
            "equalizer=f=3200:t=q:w=1.1:g=2,equalizer=f=220:t=q:w=1:g=-1.5,alimiter=limit=0.9:latency=1",
            str(vo48),
        )
        vo, _ = sf.read(vo48, dtype="float64")
        voice = np.zeros(n)
        voice[: min(n, len(vo))] = vo[:n]

        left = voice * 0.707
        right = voice * 0.707

        # "music": false (or null) turns the bed off; true or a missing key means the defaults
        music_cfg = reel.get("music", {})
        if music_cfg is True:
            music_cfg = {}
        if not args.no_music and isinstance(music_cfg, dict) and music_cfg.get("enabled", True):
            beats = timeline["beats"]
            stop_id = music_cfg.get("until")
            synth = music_cfg.get("style") == "synthwave"
            if stop_id == "end":
                # under a spoken end card too, fading out through the closing dissolve
                bed = synth_bed(n, duration) if synth else music_bed(n, duration, fade=1.0)
            else:
                if stop_id is not None and stop_id not in {b["id"] for b in beats}:
                    raise SystemExit(f'music.until "{stop_id}" is not a beat id (or "end")')
                stop = next((b["start"] for b in beats if b["id"] == stop_id), beats[-1]["start"])
                bed = synth_bed(n, stop) if synth else music_bed(n, stop)
            # dip the bed under dark beats so the low hit owns the bottom end
            duck = np.ones(n)
            for b in beats:
                if b.get("mood") == "dark":
                    a, z = int(b["start"] * SR), min(n, int(b["end"] * SR))
                    duck[a:z] = 0.45
            duck = one_pole_lp(duck, 6)
            active = voice[np.abs(voice) > 0.02]
            voice_rms = float(np.sqrt(np.mean(active**2))) if len(active) else 0.1
            bed_rms = float(np.sqrt(np.mean(bed[bed != 0] ** 2))) if np.any(bed) else 1.0
            gain = voice_rms / bed_rms * 10 ** ((music_cfg.get("db", BED_DB)) / 20)
            left += bed * duck * gain * 0.707
            right += bed * duck * gain * 0.707
        unknown = set()
        for i, cue in enumerate(cues):
            entry = SFX.get(cue["name"])
            if entry is None:
                unknown.add(cue["name"])
                continue
            fn, base = entry
            kwargs = {k: cue[k] for k in ("dur", "pitch") if k in cue}
            sound = fn(seed=101 + i * 7, **kwargs) * base * cue.get("gain", 1.0) * args.sfx_gain
            at = int(round(cue["t"] * SR))
            if at >= n:
                continue
            if at < 0:  # starts before the reel: keep the part that is inside it
                sound = sound[-at:]
                at = 0
            sound = sound[: n - at]
            pan = float(np.clip(cue.get("pan", 0.0), -1, 1))
            left[at : at + len(sound)] += sound * (0.5 - pan * 0.28)
            right[at : at + len(sound)] += sound * (0.5 + pan * 0.28)
        if unknown:
            print(f"warning: no such effect(s): {', '.join(sorted(unknown))}")

        stereo = np.stack([left, right], axis=1)
        # tame the few low hits that tower over everything else, then leave ~6 dB of headroom:
        # with that, the gain to reach the loudness target is a plain (linear) level change
        stereo = np.tanh(stereo * 1.6) / 1.6
        peak = float(np.max(np.abs(stereo))) or 1.0
        stereo *= 0.5 / peak
        # no click at the loop point
        fade = int(0.03 * SR)
        stereo[-fade:] *= np.linspace(1, 0, fade)[:, None]
        premix = tmp / "premix.wav"
        sf.write(premix, stereo, SR, subtype="PCM_24")

        # two-pass loudness normalisation so the result lands on target without pumping
        target = f"loudnorm=I={args.lufs}:TP=-1.0:LRA=7"
        report = ffmpeg("-i", str(premix), "-af", f"{target}:print_format=json", "-f", "null", "-")
        m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", report, re.S).group(0))
        if "inf" in str(m["input_i"]):
            raise SystemExit("the mix is silent: is vo.wav empty? Re-run the voice step.")
        second = ffmpeg(
            "-y", "-i", str(premix),
            "-af",
            f"{target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json",
            "-ar", str(SR), "-c:a", "pcm_s16le", str(reel_dir / "mix.wav"),
        )
        mode = re.search(r'"normalization_type"\s*:\s*"(\w+)"', second)
        if mode and mode.group(1) != "linear":
            print("warning: loudness normalisation fell back to dynamic mode (peaks too close to the target)")
    check = ffmpeg("-i", str(reel_dir / "mix.wav"), "-af", "loudnorm=print_format=summary", "-f", "null", "-")
    lines = [ln.strip() for ln in check.splitlines() if ln.startswith(("Input Integrated", "Input True Peak", "Input LRA"))]
    print(f"mix.wav: {duration:.2f}s, {len(cues)} effect cues | " + " | ".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
