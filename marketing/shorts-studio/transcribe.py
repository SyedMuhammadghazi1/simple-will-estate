"""transcribe.py: word-by-word transcript with faster-whisper, for computers without whisper.cpp.

usage: python3 transcribe.py <recording> --out <work dir> [--model small.en]

Writes <work>/words_raw.json in the same shape as the skill's scripts/captions.py:
[{"i", "text", "start", "end"}], times in seconds of the original recording."""
import argparse
import json
import os
import subprocess

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--out", required=True)
ap.add_argument("--model", default="small.en")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402  (imported late so --help needs nothing installed)

# ffmpeg decodes the sound to 16 kHz mono samples, so no other audio library is needed
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(raw, dtype=np.float32)
print(f"loading the speech model ({a.model}); the first run downloads it", flush=True)
model = WhisperModel(a.model, device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, word_timestamps=True, language="en" if a.model.endswith(".en") else None,
                               condition_on_previous_text=False)
out = []
for seg in segments:
    for w in seg.words or []:
        text = w.word.strip()
        if text:
            out.append({"i": len(out), "text": text, "start": round(float(w.start), 3), "end": round(float(w.end), 3)})
    print(f"[{seg.start:7.2f} - {seg.end:7.2f}] {seg.text.strip()}", flush=True)

json.dump(out, open(os.path.join(a.out, "words_raw.json"), "w"), indent=0)
print(f"\n{len(out)} words -> {os.path.join(a.out, 'words_raw.json')}")
