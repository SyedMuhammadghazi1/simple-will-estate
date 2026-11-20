"""shared helpers: audio envelopes and the lag between two recordings of the same voice."""
import subprocess
import numpy as np

SR = 16000


def load(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def env_db(x, sr=SR, hop=0.001):
    """log loudness envelope, one value per millisecond (survives noise removal and EQ)."""
    h = int(sr * hop); n = len(x) // h
    return 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-6)


def lag_ms(a, b, max_ms):
    """lag in ms so that b[t + lag] lines up with a[t]; returns (lag, match score 0..1)."""
    a = np.clip(a, -60, None); b = np.clip(b, -60, None); a = a - a.mean(); b = b - b.mean()
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    lags = np.concatenate([np.arange(0, max_ms + 1), np.arange(-max_ms, 0)])
    vals = np.concatenate([c[:max_ms + 1], c[n - max_ms:]])
    i = int(np.argmax(vals))
    return int(lags[i]), float(vals[i] / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
