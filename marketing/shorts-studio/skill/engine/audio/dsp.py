"""Audio maths shared by kit.py and stems.py (same method as ~/code/sound-research, so the levels mean the same thing).

Needs numpy, scipy, soundfile, pyloudnorm. They live in ~/code/sound-research/.venv; ensure_venv() re-launches the
calling script there when the current Python lacks them. On a Mac without that venv:
    python3 -m venv ~/code/sound-research/.venv && ~/code/sound-research/.venv/bin/pip install numpy scipy soundfile pyloudnorm
"""
import os, sys, subprocess

VENV = os.path.expanduser('~/code/sound-research/.venv/bin/python')
SR = 48000


def ensure_venv():
    try:
        import numpy, scipy, soundfile, pyloudnorm  # noqa
    except ImportError:
        if os.path.exists(VENV) and os.path.realpath(sys.executable) != os.path.realpath(VENV) and not os.environ.get('JY_AUDIO_REEXEC'):
            os.environ['JY_AUDIO_REEXEC'] = '1'
            os.execv(VENV, [VENV] + sys.argv)
        print('needs numpy, scipy, soundfile and pyloudnorm (see audio/dsp.py for the one-line venv setup)'); sys.exit(2)


def load(path, sr=SR):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def kw(x):
    """K-weighting (ITU-R BS.1770), the filters pyloudnorm uses."""
    import pyloudnorm as pyln, scipy.signal as ss
    m = pyln.Meter(SR); y = x.copy()
    for f in m._filters.values():
        y = f.passband_gain * ss.lfilter(f.b, f.a, y, axis=0)
    return y


def ev_loud(x):
    """event loudness: the loudest 100 ms K-weighted window, in LUFS (how loud a sound effect reads)."""
    import numpy as np
    z = (kw(x) ** 2).sum(1); w = int(0.1 * SR)
    if len(z) < w: z = np.pad(z, (0, w - len(z)))
    c = np.concatenate([[0], np.cumsum(z)]); ms = (c[w:] - c[:-w]) / w
    return -0.691 + 10 * np.log10(ms.max() + 1e-12)


def mom(x, win=0.4, hop=0.01):
    """momentary loudness (0.4 s window) every 10 ms, in LUFS."""
    import numpy as np
    z = (kw(x) ** 2).sum(1); c = np.concatenate([[0], np.cumsum(z)])
    h = int(hop * SR); w = int(win * SR); n = len(z) // h
    ctr = np.arange(n) * h; a = np.clip(ctr - w // 2, 0, len(z)); b = np.clip(ctr + w // 2, 0, len(z))
    return -0.691 + 10 * np.log10((c[b] - c[a]) / np.maximum(b - a, 1) + 1e-12)


def integrated(x):
    import pyloudnorm as pyln
    return pyln.Meter(SR).integrated_loudness(x)


def write(path, x, subtype='PCM_24'):
    import numpy as np, soundfile as sf
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, np.clip(x, -1.0, 1.0).astype(np.float32) if subtype != 'FLOAT' else x.astype(np.float32), SR, subtype=subtype)


def normalise_event(src, dst, ref=-20.0, max_s=None):
    """trim lead silence (45 dB under the peak), cap the length with a short fade, set the event loudness to ref LUFS (the kit rule)."""
    import numpy as np
    x = load(src)
    env = 20 * np.log10(np.abs(x).max(1) + 1e-9)
    on = int(np.argmax(env > max(env.max() - 45, -60)))
    x = x[max(0, on - int(0.002 * SR)):]
    if max_s and len(x) > max_s * SR:
        x = x[:int(max_s * SR)]; f = int(0.03 * SR); x[-f:] *= np.linspace(1, 0, f)[:, None]
    g = ref - ev_loud(x); x = x * 10 ** (g / 20)
    write(dst, x)
    return dict(event_loudness_lufs=round(ev_loud(x), 1), dur_s=round(len(x) / SR, 3))
