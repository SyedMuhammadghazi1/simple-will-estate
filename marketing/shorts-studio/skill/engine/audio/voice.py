#!/usr/bin/env python3
"""Voice step: clean Jack's voice with Auphonic, then line it up with the cut to the millisecond.

usage:
  voice.py enhance <raw.wav> <out.wav> [--title T]   Auphonic (leveler, dynamic denoise, studio voice, gate, -14 LUFS), then align
  voice.py align <raw.wav> <enhanced.wav> <out.wav>  align only (when the Auphonic file already exists)

The raw file is the voice on the cut (Short: work/cut_audio.wav before the trim; Long: the clean cut's audio).
Gotcha (memory reference_auphonic_token_location.md, 21 Oct): this Auphonic account PREPENDS a ~6.42 s intro clip to every
output. align cuts it and re-aligns by log-envelope cross-correlation at 1 ms (raw waveform correlation fails after
"studio voice"), then checks the residual lag is 0 ms before anything is muxed.
Key: AUPHONIC_API_KEY in ~/.shorts-studio/.env (read by auphonic.sh, never printed). Auphonic costs account credit
(about 2 h left on 21 Oct): run it once per round, on the final cut only.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dsp
dsp.ensure_venv()
import numpy as np


def env_db(x, sr, hop=0.001):
    """log RMS envelope, one value per ms."""
    m = x.mean(1) if x.ndim > 1 else x; h = int(sr * hop); n = len(m) // h
    return 20 * np.log10(np.sqrt((m[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-6)


def lag_ms(a, b, max_ms):
    """best lag (ms) of b against a: b[t + lag] ~ a[t]. FFT cross-correlation of the zero-mean, clipped envelopes."""
    a = np.clip(a, -60, None); b = np.clip(b, -60, None); a = a - a.mean(); b = b - b.mean()
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    lags = np.concatenate([np.arange(0, max_ms + 1), np.arange(-max_ms, 0)])
    vals = np.concatenate([c[:max_ms + 1], c[n - max_ms:]])
    i = int(np.argmax(vals)); return int(lags[i]), float(vals[i] / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def align(raw, enh, out):
    SR = dsp.SR
    r = dsp.load(raw); e = dsp.load(enh)
    L, score = lag_ms(env_db(r, SR), env_db(e, SR), max_ms=int(12000))    # the intro is ~6.42 s; search up to 12 s
    s = int(L * SR / 1000)
    e2 = e[s:] if s >= 0 else np.concatenate([np.zeros((-s, 2)), e])
    e2 = e2[:len(r)] if len(e2) >= len(r) else np.concatenate([e2, np.zeros((len(r) - len(e2), 2))])
    resid, _ = lag_ms(env_db(r, SR), env_db(e2, SR), max_ms=50)
    dsp.write(out, e2)
    rep = dict(raw=raw, enhanced=enh, out=out, intro_cut_ms=L, correlation=round(score, 3), residual_lag_ms=resid, ok=resid == 0)
    json.dump(rep, open(os.path.splitext(out)[0] + '.align.json', 'w'), indent=1)
    print(f"aligned: cut {L} ms from the start, residual lag {resid} ms ({'OK' if resid == 0 else 'NOT ALIGNED, do not mux'})")
    return rep


def enhance(raw, out, title='jack-youtube voice'):
    tmp = os.path.splitext(out)[0] + '.auphonic.wav'
    subprocess.run(['zsh', os.path.join(HERE, 'auphonic.sh'), raw, tmp, title], check=True)
    return align(raw, tmp, out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    if a[0] == 'align': rep = align(a[1], a[2], a[3])
    elif a[0] == 'enhance': rep = enhance(a[1], a[2], a[a.index('--title') + 1] if '--title' in a else 'jack-youtube voice')
    else: print('unknown command'); sys.exit(2)
    sys.exit(0 if rep['ok'] else 1)
