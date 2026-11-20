#!/usr/bin/env python3
"""lipsync_check.py: is the picture of him from the SAME moment as the voice? (rule R42, 26 Oct 2026: "there's no lip sync on it")

usage: lipsync_check.py <project> [--video deliver/final.mp4] [--json out.json]

What broke on test-6: the page reused an old camera file (made before a repeat was cut), so after 3.6 s his lips ran 1.37 s
off the voice. The gate did not test this. This test does, exactly:
- the voice is cut from work/cut_audio.wav with the frames in trim.json; the camera files work/base-split.mp4 and
  work/base-full.mp4 have the same frames dropped. So the picture is in sync when the final shows base frame k at frame k.
- for every split and him-full window (work/design.json), it matches each 0.5 s piece of the final's speaker panel against
  the base file slid +-2 s, and reads off the offset that matches best.
PASS: every piece's offset is 0 frames (1 frame allowed) and the base files are as long as the voice.
Source sync (camera vs screen-recording mic) is set earlier by scripts/sync.py; this test checks everything after it.
"""
import json, os, subprocess, sys
import numpy as np

W, H = 64, 57   # small grey frames: enough to tell moments apart, fast


def frames(path, crop=None, fps=30):
    vf = (f'crop={crop},' if crop else '') + f'scale={W}:{H},format=gray'
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-r', str(fps), '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)


def main(project, video=None, out=None):
    WD = os.path.join(project, 'work'); video = video or os.path.join(project, 'deliver', 'final.mp4')
    L = json.load(open(os.path.join(WD, 'design.json')))['layout']
    fin_s = frames(video, '1080:960:0:960'); fin_f = frames(video)
    base = {'split': frames(os.path.join(WD, 'base-split.mp4')), 'jack': frames(os.path.join(WD, 'base-full.mp4'))}
    vd = dur(os.path.join(WD, 'cut_audio.wav')); TR = json.load(open(os.path.join(WD, 'trim.json')))
    rows, bad = [], []
    # transitions (27 Oct): a world grows over his split for 0.45 s before a split -> full switch, shrinks for 0.45 s after
    # full -> split, and slides over his full shot around a jack switch. No face to match there: skip those pieces.
    TRZ = []
    for i in range(1, len(L)):
        a0, ty0, ty1 = L[i][0], L[i - 1][2], L[i][2]
        if ty0 != ty1: TRZ.append((a0 - 0.5, a0 + 0.5))
    in_tr = lambda t0, t1: any(t0 < z1 and t1 > z0 for z0, z1 in TRZ)
    for a, b, ty, sc in L:
        if ty not in ('split', 'jack'): continue
        F = fin_s if ty == 'split' else fin_f; B = base[ty]
        k0, k1 = int(round(a * 30)) + 2, int(round(min(b, len(F) / 30) * 30)) - 2
        for s in range(k0, k1 - 7, 15):
            e = min(k1, s + 15); seg = F[s:e]
            if len(seg) < 8 or in_tr(s / 30, e / 30): continue
            best = None
            for lag in range(-60, 61):
                if s + lag < 0 or e + lag > len(B): continue
                err = float(np.mean((B[s + lag:e + lag] - seg) ** 2))
                if best is None or err < best[1]: best = (lag, err)
            if best is None: continue
            r = dict(t=round(s / 30, 2), layout=ty, scene=sc, offset_frames=best[0], offset_ms=round(best[0] / 30 * 1000), err=round(best[1], 1))
            rows.append(r)
            if abs(best[0]) > 1: bad.append(r)
    base_len = len(base['split']) / 30
    length_ok = abs(base_len - TR['duration']) < 0.1
    for r in rows: print(f"{r['t']:6.2f} s  {r['layout']:5s} {r['scene']:5s}  offset {r['offset_ms']:+5d} ms ({r['offset_frames']:+d} fr)" + ('   OFF' if r in bad else ''))
    print(f"camera file {base_len:.2f} s vs trimmed voice {TR['duration']:.2f} s: {'ok' if length_ok else 'MISMATCH'}")
    ok = not bad and length_ok and rows
    if out: json.dump(dict(pass_=bool(ok), pieces=rows, base_s=base_len, voice_trimmed_s=TR['duration']), open(out, 'w'), indent=1)
    print(f'LIP SYNC PASS ({len(rows)} pieces, all on frame)' if ok else f'LIP SYNC FAIL: {len(bad)} of {len(rows)} pieces off frame (stale camera media? rerun prep, then render)')
    return ok


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    sys.exit(0 if main(a[0], opt('--video'), opt('--json')) else 1)
