#!/usr/bin/env python3
"""bases.py: frame the speaker for the two Short layouts, automatically, from the tracked face. No camera moves (R13).

usage: bases.py <project> [--video work/cut.mp4] [--face work/face.json]

Writes work/bases_pre/base-full.mp4 (1080x1920) and work/bases_pre/base-split.mp4 (1080x960), video only, 30 fps, -g 30.
Targets (measured from top Shorts, rules M2 / M5, check.py):
  full  : face height 38 to 42% of the frame (aim 40), eyes 33 to 42% down (aim 37)
  split : face height 40 to 44% of the panel (aim 41), eyes 32 to 39% down (aim 35), head + shoulders + mic in shot
One fixed crop per base (median face over the clip), so the camera never drifts or punches in.
If the source is too tight to frame that wide, the speaker is scaled to fit over a blurred fill of the same shot (R33: full-bleed).
"""
import json, os, statistics as st, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

# Calibrated with this skill's own face tracker (Apple Vision box: brows to chin) on an approved AI-edited Short (25 Oct 2026):
# full speaker face 0.372 of the frame height, face top 0.226; split face 0.368 of the panel, face top 0.284 of the panel.
TARGETS = {'full': dict(W=1080, H=1920, face=0.37, eyes=0.37), 'split': dict(W=1080, H=960, face=0.37, eyes=0.42)}


def plan(src_w, src_h, box, eyes_y, tgt):
    """scale + top-left crop offset (in scaled pixels) so the face lands on target. box = median [x0, y0, x1, y1] in 0..1."""
    W, H = tgt['W'], tgt['H']
    face_px = (box[3] - box[1]) * src_h
    s = tgt['face'] * H / face_px
    sw, sh = src_w * s, src_h * s
    cx = (box[0] + box[2]) / 2 * sw
    ox = cx - W / 2
    oy = eyes_y * sh - tgt['eyes'] * H
    # 27 Oct (creator: "the bottom part of the screen is kind of blurry"): never show the blurred fill. Cover the frame first
    # (scale up if the shot is too small), then slide the crop inside the picture; the eyes may move off target to do it.
    if sw < W or sh < H:
        k = max(W / sw, H / sh); s *= k; sw, sh = src_w * s, src_h * s; cx = (box[0] + box[2]) / 2 * sw; ox = cx - W / 2; oy = eyes_y * sh - tgt['eyes'] * H
    ox = min(max(ox, 0), sw - W); oy = min(max(oy, 0), sh - H)
    fill = False
    return s, ox, oy, fill


def render(video, out, s, ox, oy, W, H, fps):
    src = jy.probe(video)
    vs = [x for x in src['streams'] if x['codec_type'] == 'video'][0]
    sw, sh = round(vs['width'] * s / 2) * 2, round(vs['height'] * s / 2) * 2
    # blurred fill of the same shot behind, the framed speaker on top (only visible where the crop runs out of picture)
    fc = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=40:2,eq=brightness=-0.06[bg];"
          f"[b]scale={sw}:{sh}:flags=lanczos[fg];[bg][fg]overlay={-ox:.1f}:{-oy:.1f},fps={fps},format=yuv420p[v]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-filter_complex', fc, '-map', '[v]', '-an', '-c:v', 'libx264',
                    '-crf', '14', '-preset', 'slow', '-g', str(fps), '-r', str(fps), out], check=True)


def main(project, video=None, face=None):
    E = jy.load_edit(project); WD = jy.P(E, 'work'); fps = E.get('fps', 30)
    video = video or os.path.join(WD, 'cut.mp4'); face = face or os.path.join(WD, 'face.json')
    if not os.path.exists(face):
        subprocess.run([jy.skill('..', 'bin', 'face_track'), video, face, '10'], check=True)
    F = json.load(open(face))
    boxes = [f['box'] for f in F['frames'] if f.get('box')]
    if not boxes:
        sys.exit('no face found in the video: frame the bases by hand (or check the file)')
    med = [st.median(b[k] for b in boxes) for k in range(4)]
    eyes_y = med[1] + 0.38 * (med[3] - med[1])     # eyes sit about 38% down the face box
    os.makedirs(os.path.join(WD, 'bases_pre'), exist_ok=True)
    rep = {}
    for name, tgt in TARGETS.items():
        s, ox, oy, fill = plan(F['w'], F['h'], med, eyes_y, tgt)
        render(video, os.path.join(WD, 'bases_pre', f'base-{name}.mp4'), s, ox, oy, tgt['W'], tgt['H'], fps)
        rep[name] = dict(scale=round(s, 3), offset=[round(ox), round(oy)], blurred_fill=fill)
        print(f"base-{name}: scale {s:.2f}, face {tgt['face']*100:.0f}% of height, eyes {tgt['eyes']*100:.0f}% down"
              + (' ' if fill else ''))
    json.dump(dict(face_median=med, **rep), open(os.path.join(WD, 'bases_pre', 'framing.json'), 'w'), indent=1)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    main(a[0], opt('--video'), opt('--face'))
