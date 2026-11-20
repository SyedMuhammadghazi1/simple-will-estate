#!/usr/bin/env python3
"""Word times for the director pass and the word sync.

usage: transcribe.py <voice.wav> <out words.json> [--model medium.en] [--refine]

Runs the local whisper CLI (models cached in ~/.cache/whisper; free, on-device) with word timestamps, temperature 0.
--refine moves every word that follows a pause (>= 80 ms) to its audio onset (where the sound actually starts), the same
refinement the Short (round 4) and the intro sync used. Output: [{w, s, e, p}] (seconds, probability).
Long mode can use forced alignment instead when the script is known (wav2vec2, grokbot-intro-r4/work/fa.py; needs torchaudio).
"""
import json, os, subprocess, sys, tempfile
import numpy as np

def main(a):
    src, out = a[0], a[1]; model = a[a.index('--model') + 1] if '--model' in a else 'medium.en'
    tmp = tempfile.mkdtemp(prefix='jy-whisper-')
    wav = os.path.join(tmp, 'v16.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '16000', wav], check=True)
    subprocess.run(['whisper', wav, '--model', model, '--language', 'en', '--word_timestamps', 'True', '--output_format', 'json',
                    '--output_dir', tmp, '--fp16', 'False', '--temperature', '0', '--condition_on_previous_text', 'False', '--verbose', 'False'], check=True)
    R = json.load(open(os.path.join(tmp, 'v16.json')))
    W = [dict(w=x['word'].strip(), s=round(x['start'], 3), e=round(x['end'], 3), p=round(x.get('probability', 0), 2)) for sg in R['segments'] for x in sg.get('words', [])]
    if '--refine' in a:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', wav, '-f', 's16le', '-'], capture_output=True).stdout
        x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768; hop = 80; n = len(x) // hop
        db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-7); dbs = np.convolve(db, np.ones(3) / 3, mode='same')
        for i, w in enumerate(W):
            if i and w['s'] - W[i - 1]['e'] < 0.08: continue
            ic = int(w['s'] / 0.005); i0 = max(0, ic - 30); m = i0 + int(np.argmin(dbs[i0:ic + 1])); base = dbs[m]; j = m
            while j < min(len(dbs), ic + 6) and dbs[j] < base + 6: j += 1
            w['s'] = round(min(j * 0.005, w['s']), 3)
    json.dump(W, open(out, 'w'), indent=1)
    print(len(W), 'words ->', out); print(R.get('text', '').strip()[:300])


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a)
