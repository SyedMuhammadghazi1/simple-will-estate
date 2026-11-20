#!/usr/bin/env python3
"""motion-slop-gate, layer 1: binary, code-measured tests on a rendered video.

usage:
  check.py <video.mp4> [short|long] [--out DIR] [--sync sync.json] [--footage "a-b,c-d"] [--transitions "a-b,..."] [--quiet]

  short|long     default: 9:16 -> short, anything else -> long
  --out DIR      where frames, report.json and the contact sheet go (default: <video dir>/<stem>-slopgate/)
  --sync FILE    list of {word, word_t, event, event_t} in seconds. Checks every beat lands on its word.
  --footage S    time ranges (seconds) that are REAL footage: product clips, launch films, screen recordings.
                 Design tests skip them, except text (a cropped clip may carry at most 10 words unless it fills
                 the panel). Never list designed graphics here: the judge checks every footage range on the sheet.

Prints one PASS or FAIL line per test with the number and the frame times, then GATE PASS or GATE FAIL.
Writes <out>/report.json, <out>/flags.json (every sample measured) and <out>/contact.jpg (2 fps, failing frames
framed in red with the test names). Exit code 0 = every test passed, 1 = at least one FAIL, 2 = could not run.

Every threshold lives in RULES with the verdict it comes from. Change a number only with a new verdict.
Runs on the research venv (OpenCV): ~/code/jack-youtube-system/rules/.venv.nosync/bin/python (it re-launches itself there).
Faces and text use Apple Vision through bin/vision (compiled from vision.swift on first run). Free, on-device.
"""
import os, sys, json, subprocess, math, shutil, glob

VENV = os.path.expanduser('~/.shorts-studio/venv/bin/python')
try:
    import numpy as np, cv2
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    if os.path.exists(VENV) and os.path.realpath(sys.executable) != os.path.realpath(VENV) and not os.environ.get('SLOPGATE_REEXEC'):
        os.environ['SLOPGATE_REEXEC'] = '1'
        os.execv(VENV, [VENV] + sys.argv)
    print('needs numpy, opencv-python and pillow (or the venv at ' + VENV + ')'); sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------------------------
# RULES. Sources:
#   [MS]  memory feedback_motion_spacing_pacing.md (Jack's verdicts, newest wins)
#   [R]   ~/code/jack-youtube-system/rules/RULES.md + rules.json (measured from his top Shorts, Nick Saraev, Kallaway)
#   [V3S] round 3 short "shockingly bad"   [V5S] round 5 short "AI sloppy"
#   [V6S] round 6 short "getting really good" except 10 s and 28.5-31 s
#   [V5I] GrokBot intro round 5 notes      [V6I] GrokBot intro round 6 notes (21 Oct)
#   [V7I] GrokBot intro round 7 "Really cool" with three fixes (21 Oct)
# ---------------------------------------------------------------------------------------------
RULES = {
    'words_max': 3,             # [V5S] "max 3 words per graphic" (+1 number); [R] rule 12. A graphic = one text block.
    'numbers_max': 1,
    'screen_words_max': 8,      # and the whole screen stays light: [V5S] "too much text"; [R] checklists reach about 7
    'footage_words_max': 10,    # a real clip in a card may carry its own title; [V5S] the cropped "@Claude ..." paragraph had 25+
    'words_min_s': 1.0,         # held for 1 s (2 samples) so a word that is typing on does not count twice
    'text_contrast_min': 90,    # faint background UI text (light grey on white) is not "text on screen"
    'chip_text_h_max': 0.095,   # [V6I] "Built & sold" (3.8%), "Easy part" (4.6%), [V5I] "New AI startup" (6.6%), "The easy part"
                                # (8.6%): label pills beside him. Kinetic text he liked ("Build today", 10.3%) sits on the footage.
    'chip_fill_min': 0.6,       # a "pill": >= 60% of the ring around the text is one flat fill (chips 0.62-0.98; text on
                                # footage such as "Build today" or "Jack Roberts" 0.21-0.25)
    'grey_sat_min': 0.004,      # [V3S] grey wireframe placeholders; [V5S] grey "Motion designer / Pay" card
    'grey_min_s': 2.0,          # a short grey beat inside a colourful build is fine ([V7I] grey track before the level-up, loved)
    'brand_min': 0.003,         # [V5S] "What happened to my orange and blue?": a colour counts at >= 0.3% of the panel
    'brand_share_min': 0.30,    # each of orange and blue in >= 30% of designed samples (r6 short: 74% / 65%; r5: 0% / 58%)
    'brand_gap_s': 2.0,         # and never 2 s of designed graphics with neither
    'span_full': 0.65,          # [R] rule 7: main element >= 65% of frame width (median 86%)
    'span_split': 0.58,         # [R] rule 6: split top content 58-87% wide
    'span_side': 0.55,          # side card: graphics fill the left zone; [MS] "big and visual, not small cards floating"
    'span_min_s': 1.5,          # the first second of a build may start small ([V7I] Grok Bot mark pops first, loved)
    'empty_area': 0.08,         # [MS] "no empty frames"; [V5I] "13 to 14 s zoom with nothing either side"
    'empty_min_s': 1.0,
    'text_margin_min': 0.035,   # [MS] spacing: 32-48 px at 1080 wide = 3-4.4% of width; text never hugs the panel edge
    'zoom_step_max': 0.02,      # [V5I] "weird camera jumping": a punch-in is a >= 2% scale step between two frames of him
    'zoom_max': 0.015,          # [V5I] "keeps zooming in": scale change on him over 1 s or 3 s of one shot
    'drift_max': 0.02,          # [V5I] drift on him over 3 s of one shot, share of frame width
    'zoom_rate_max': 0.12,      # [V6I] "fast zoom in and out ... makes you feel nauseous": face size change per 0.5 s
    'silence_min_s': 0.2,       # [V6S] 10.0-10.3 s "I'm just looking at the camera, not doing anything"
    'silence_db_below_speech': 22,
    'room_corr_min': 0.45,      # [V5I] over-the-shoulder angle: his room fills the frame (0.54-0.58) but no face is visible;
                                # designed graphics score <= 0.19 against his room
    'yaw_max': 12,              # [V7I] "remove the b-roll where I'm looking off to the side": his face turned >= 12 deg away
                                #       from his usual angle (0.5 s rolling median; the second angles sit at +17 to +29)
    'yaw_min_s': 0.8,           #       for 0.8 s or more (his natural head turns are shorter)
    'centre_tol': 0.07,         # [V7I] "I told you I wanted all text centralised": headline text centred within 7% of the panel width
    'headline_h': 0.045,        #       headline = text at least 4.5% of the frame height
    'sync_ok_frames': 2,        # [MS] SYNC: within 2 frames of the word, fail over 3
    'sync_fail_frames': 3,
    'short': {'gap_first3': 1.0, 'gap_after': 3.0, 'avg_gap': 1.1, 'speaker_hold': 6.0, 'split_hold': 7.5,
              'speaker_share_max': 0.56},     # [R] rules 15, 16, 4 and the rules.json pacing note
    'long': {'gap_first30': 3.5, 'gap_after': 15.0, 'avg_gap_first30': 1.0},   # [R] rule 17
}
VERT_CAPTION_BANDS = [(0.455, 0.545), (0.625, 0.715)]   # [R] rule 18: seam in a split, 66-68% full screen

# ---------------------------------------------------------------------------------------------
def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, **kw)

def probe(v):
    j = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration',
                        '-of', 'json', v]).stdout)
    vs = [s for s in j['streams'] if s['codec_type'] == 'video'][0]
    a = any(s['codec_type'] == 'audio' for s in j['streams'])
    n, d = vs['r_frame_rate'].split('/')
    return int(vs['width']), int(vs['height']), float(n) / float(d), float(j['format']['duration']), a

def decode_gray(v, fps, w, h):
    raw = run(['ffmpeg', '-v', 'error', '-i', v, '-vf', f'fps={fps},scale={w}:{h}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']).stdout
    a = np.frombuffer(raw, np.uint8); n = a.size // (w * h)
    return a[:n * w * h].reshape(n, h, w)

def vision_bin():
    b = os.path.join(HERE, 'bin', 'vision'); src = os.path.join(HERE, 'vision.swift')
    if not os.path.exists(b) or os.path.getmtime(b) < os.path.getmtime(src):
        os.makedirs(os.path.dirname(b), exist_ok=True)
        r = run(['swiftc', '-O', src, '-o', b])
        if r.returncode:   # Command Line Tools can ship an SDK newer than their compiler: try the older SDKs next to it
            sdks = sorted(glob.glob('/Library/Developer/CommandLineTools/SDKs/MacOSX1*.sdk'), reverse=True)
            for sdk in sdks:
                r = run(['swiftc', '-O', '-sdk', sdk, src, '-o', b])
                if r.returncode == 0: break
        if r.returncode: print(r.stderr.decode()[-1500:]); sys.exit(2)
    return b

def vision(mode, files):
    b = vision_bin(); out = {}
    for i in range(0, len(files), 150):
        for line in run([b, mode] + files[i:i + 150]).stdout.decode().splitlines():
            try:
                d = json.loads(line); out[d['f']] = d
            except Exception:
                pass
    return out

def fmt(ts, n=8):
    ts = sorted(set(round(t, 1) for t in ts))
    return ', '.join(f'{t:g}s' for t in ts[:n]) + (f' (+{len(ts) - n} more)' if len(ts) > n else '')

def runs_of(times, step, min_len):
    """group sample times into runs [start, end); keep runs at least min_len long"""
    out = []
    for t in sorted(times):
        if out and t - out[-1][1] <= step * 1.01: out[-1][1] = t
        else: out.append([t, t])
    return [(a - step / 2, b + step / 2) for a, b in out if b - a + step >= min_len - 1e-6]

def parse_ranges(s):
    out = []
    for part in (s or '').split(','):
        if '-' in part:
            a, b = part.split('-'); out.append((float(a), float(b)))
    return out

# ---------------------------------------------------------------------------------------------
def _hue(hexc):
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    import colorsys
    return colorsys.rgb_to_hsv(r, g, b)[0] * 360

# the user's accent colours (--accents "#hex,#hex", from their style). Two accents = both must show up; one = it must.
ACCENTS = [a for a in os.environ.get('SS_ACCENTS', '').split(',') if a.strip()]
ACC_H = [_hue(a) for a in ACCENTS[:2]] or [None, None]
if len(ACC_H) == 1:
    ACC_H.append(ACC_H[0])


def hsv_masks(rgb):
    """accent definition: each accent = its hue +- 12 deg, S > 0.5, V > 0.5 (round 6 style board).
    'sat' = any saturated colour (S > 0.45, V > 0.4): logos and accents of any hue count as colour."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    H = hsv[..., 0].astype(np.int16) * 2; S = hsv[..., 1] / 255.0; V = hsv[..., 2] / 255.0
    ok = (S > 0.5) & (V > 0.5)
    def near(h0):
        if h0 is None:
            return np.zeros(H.shape, bool) | True & ok   # no accent given: any saturated colour counts
        d = np.abs(H - h0); d = np.minimum(d, 360 - d)
        return ok & (d <= 12)
    return (S > 0.45) & (V > 0.4), near(ACC_H[0]), near(ACC_H[1]), H, S, V

def flat_share(rgb):
    """share of bright pixels sitting in a flat area. Designed graphics are mostly flat fills; footage is not."""
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    m = cv2.blur(g, (5, 5)); m2 = cv2.blur(g * g, (5, 5))
    sd = np.sqrt(np.maximum(m2 - m * m, 0)); br = g > 40
    return float(((sd < 1.5) & br).sum() / max(1, br.sum()))

def content_mask(rgb):
    """not-background pixels: edges plus colour far from the dominant colour. Dot grids and vignettes drop out."""
    q = (rgb // 16).reshape(-1, 3).astype(np.int32)
    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    bgk = np.bincount(key).argmax()
    bg = np.array([(bgk // 256) * 16 + 8, ((bgk // 16) % 16) * 16 + 8, (bgk % 16) * 16 + 8])
    diff = np.abs(rgb.astype(np.int16) - bg).max(axis=2) > 40
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edge = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)) > 60
    m = cv2.morphologyEx((diff | edge).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return m.astype(bool), bg

def elements(mask):
    ph, pw = mask.shape
    k = max(3, int(pw * 0.018))
    c = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(c, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = (int(v) for v in st[i])
        if a < pw * ph * 0.0015: continue
        bleed = x <= 2 and y <= 2 and x + w >= pw - 2 and y + h >= ph - 2
        out.append(dict(x=x, y=y, w=w, h=h, a=a, bleed=bleed))
    return out

def find_stars(rgb, face):
    """small 4-point sparkle stars in Jack's orange or blue on a calm ground: low solidity, square box,
    4 deep convexity defects, not in his hair or face."""
    H, W = rgb.shape[:2]
    _, _, _, Hh, S, V = hsv_masks(rgb)
    ok = (S > 0.5) & (V > 0.5)
    masks = [ok & (np.abs(Hh - 30) <= 9), ok & (np.abs(Hh - 216) <= 12)]
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    found = []
    for m in masks:
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for c in cs:
            x, y, w, h = cv2.boundingRect(c)
            if not (W * 0.007 <= w <= W * 0.05 and H * 0.007 <= h <= H * 0.09): continue
            if not (0.6 <= w / max(h, 1) <= 1.6): continue
            if face:
                fx0, fx1 = face['x'] - 0.6 * face['w'], face['x'] + 1.6 * face['w']   # his hair, cap, face and shirt
                fy0, fy1 = face['y'] - 1.0 * face['h'], face['y'] + 2.5 * face['h']
                if fx0 * W < x + w and x < fx1 * W and fy0 * H < y + h and y < fy1 * H: continue
            a = cv2.contourArea(c); hull = cv2.convexHull(c); ha = cv2.contourArea(hull)
            if ha <= 0: continue
            sol = a / ha; fill = a / (w * h)
            if not (0.25 <= sol <= 0.68 and 0.15 <= fill <= 0.55): continue
            try:
                d = cv2.convexityDefects(c, cv2.convexHull(c, returnPoints=False))
            except cv2.error:
                continue
            if d is None or not (4 <= int((d.reshape(-1, 4)[:, 3] / 256.0 > 0.12 * max(w, h)).sum()) <= 5): continue
            # a designed sparkle is a pure brand colour (hair highlights and footage are duller)
            cm_ = np.zeros((H, W), np.uint8); cv2.drawContours(cm_, [c], -1, 1, -1); cm_ = cm_.astype(bool)
            if float(S[cm_].mean()) < 0.7 or float(V[cm_].mean()) < 0.8: continue
            # a calm ground around it (a sparkle placed as decoration, not texture in footage)
            X0, Y0, X1, Y1 = max(0, x - w), max(0, y - h), min(W, x + 2 * w), min(H, y + 2 * h)
            win = g[Y0:Y1, X0:X1]; sm = m[Y0:Y1, X0:X1]
            if win.size == 0 or float(win[~sm].std()) > 45: continue
            found.append((x / W, y / H, w / W, h / H))
    return found

# ---------------------------------------------------------------------------------------------
def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'): print(__doc__); sys.exit(2)
    vid = os.path.abspath(os.path.expanduser(args[0])); mode = None; out = None; sync = None; quiet = False; foot = []; trans = []; cutpts = None; approved = []
    i = 1
    while i < len(args):
        a = args[i]
        if a in ('short', 'long'): mode = a
        elif a == '--out': out = args[i + 1]; i += 1
        elif a == '--sync': sync = args[i + 1]; i += 1
        elif a == '--footage': foot = parse_ranges(args[i + 1]); i += 1
        elif a == '--transitions': trans = parse_ranges(args[i + 1]); i += 1   # designed slides/grows (engine world()): not jump cuts
        elif a == '--cuts': cutpts = [float(x) for x in args[i + 1].split(',') if x.strip()]; i += 1   # real cut points: jumps only count there
        elif a == '--quiet': quiet = True
        elif a == '--accents': pass   # read at import time through SS_ACCENTS (set by gate.py)
        elif a == '--approved': approved = json.load(open(os.path.expanduser(args[i + 1]))); i += 1
        i += 1
    if not os.path.exists(vid): print('no such video:', vid); sys.exit(2)
    VW, VH, FPS, DUR, has_audio = probe(vid)
    vert = VH > VW
    mode = mode or ('short' if vert else 'long')
    out = os.path.abspath(os.path.expanduser(out or os.path.join(os.path.dirname(vid), os.path.splitext(os.path.basename(vid))[0] + '-slopgate')))
    os.makedirs(out, exist_ok=True)
    f2d = os.path.join(out, 'frames2'); f10d = os.path.join(out, 'frames10')
    for d in (f2d, f10d):
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)

    # ---- frames: 2 fps full size (text, faces, design), 10 fps small (motion, faces) ----
    run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', 'fps=2', '-q:v', '3', os.path.join(f2d, '%05d.jpg')])
    sw, sh = (270, 480) if vert else (480, 270)
    run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', f'fps=10,scale={sw}:{sh}:flags=area', '-q:v', '3', os.path.join(f10d, '%05d.jpg')])
    F2 = sorted(glob.glob(os.path.join(f2d, '*.jpg'))); F10 = sorted(glob.glob(os.path.join(f10d, '*.jpg')))
    T2 = [(k + 0.5) / 2 for k in range(len(F2))]     # ffmpeg's fps filter keeps the frame near the end of each slot
    T10 = [(k + 0.5) / 10 for k in range(len(F10))]
    V2 = vision('all', F2); V10 = vision('faces', F10)

    def face_of(d, minh=0.05):
        fs = [f for f in (d or {}).get('faces', []) if f['h'] >= minh and f['c'] >= 0.5]
        return max(fs, key=lambda f: f['w'] * f['h']) if fs else None

    def layout(face):
        if face is None: return 'graphic'
        cx, cy = face['x'] + face['w'] / 2, face['y'] + face['h'] / 2
        if vert: return 'split' if cy > 0.5 else 'full'
        if cx > 0.62 and face['h'] < 0.33: return 'side'
        return 'full'

    in_foot = lambda t: any(a - 0.05 <= t <= b + 0.05 for a, b in foot)
    in_trans = lambda t: any(a <= t <= b for a, b in trans)
    bands = VERT_CAPTION_BANDS if vert else []
    S = []; ref_hists = []
    for fp, t in zip(F2, T2):
        d = V2.get(fp, {}); face = face_of(d)
        img = np.asarray(Image.open(fp).convert('RGB'))
        aw = 540 if vert else 960; ah = int(round(aw * img.shape[0] / img.shape[1]))
        small = cv2.resize(img, (aw, ah), interpolation=cv2.INTER_AREA)
        lay = layout(face)
        s = dict(t=t, file=fp, layout=lay, face=face, flat=flat_share(small), foot=in_foot(t), stars=[])
        if lay == 'graphic' and s['flat'] < 0.35: s['layout'] = lay = 'footage'
        panel = {'graphic': (0, 0, 1, 1), 'split': (0, 0, 1, 0.5), 'side': (0, 0, 0.62, 1)}.get(lay)
        s['panel'] = panel
        if panel:
            x0, y0, x1, y1 = panel
            P = small[int(y0 * ah):int(y1 * ah), int(x0 * aw):int(x1 * aw)]
            ph, pw = P.shape[:2]
            keep = np.ones((ph, pw), bool)
            for b0, b1 in bands:
                r0 = int((b0 - y0) / (y1 - y0) * ph); r1 = int((b1 - y0) / (y1 - y0) * ph)
                keep[max(0, r0):max(0, min(ph, r1)), :] = False
            sat, o, b, _, _, _ = hsv_masks(P)
            s['sat'] = float(sat[keep].mean()); s['orange'] = float(o[keep].mean()); s['blue'] = float(b[keep].mean())
            cm_, bgc = content_mask(P)
            s['bg'] = [int(v) for v in bgc]
            el = [e for e in elements(cm_ & keep)]
            s['bleed'] = any(e['bleed'] for e in el)
            el = [e for e in el if not e['bleed']]
            if el:
                X0 = min(e['x'] for e in el); X1 = max(e['x'] + e['w'] for e in el)
                Y0 = min(e['y'] for e in el); Y1 = max(e['y'] + e['h'] for e in el)
                s['span_w'] = (X1 - X0) / pw; s['span_h'] = (Y1 - Y0) / ph; s['span_area'] = s['span_w'] * s['span_h']
                big = max(el, key=lambda e: e['w'] * e['h'])
                s['big_w'] = big['w'] / pw; s['big_h'] = big['h'] / ph
            else:
                s['span_w'] = s['span_h'] = s['span_area'] = s['big_w'] = s['big_h'] = 0.0
            s['n_el'] = len(el)
        # ---- text (Apple Vision OCR) ----
        lines = []
        for L in d.get('text', []):
            if L['c'] < 0.5: continue
            txt = L['s'].strip()
            toks = [w for w in txt.replace('/', ' ').split() if sum(ch.isalnum() for ch in w) >= 2 or (w.isdigit() and len(txt.split()) == 1)]
            if not toks: continue
            cx, cy = L['x'] + L['w'] / 2, L['y'] + L['h'] / 2
            cap = vert and any(b0 <= cy <= b1 for b0, b1 in bands) and abs(cx - 0.5) < 0.22 and len(toks) <= 4
            head = False
            if face:
                hx0, hx1 = face['x'] - 0.2 * face['w'], face['x'] + 1.2 * face['w']   # his cap and shirt print, not chips beside him
                hy0, hy1 = face['y'] - 1.0 * face['h'], face['y'] + 3.2 * face['h']
                head = L['x'] < hx1 and L['x'] + L['w'] > hx0 and L['y'] < hy1 and L['y'] + L['h'] > hy0
            if lay == 'side': head = head or cx > 0.62
            if lay == 'split': head = head or cy > 0.5
            X0, Y0 = int(L['x'] * aw), int(L['y'] * ah); X1, Y1 = int((L['x'] + L['w']) * aw) + 1, int((L['y'] + L['h']) * ah) + 1
            crop = cv2.cvtColor(small[max(0, Y0):Y1, max(0, X0):X1], cv2.COLOR_RGB2GRAY) if X1 > X0 and Y1 > Y0 else None
            con = float(np.percentile(crop, 95) - np.percentile(crop, 5)) if crop is not None and crop.size > 4 else 0.0
            over_face = bool(face) and L['x'] < face['x'] + face['w'] and L['x'] + L['w'] > face['x'] and \
                L['y'] < face['y'] + face['h'] * 0.85 and L['y'] + L['h'] > face['y'] + face['h'] * 0.15
            ring_fill = 0.0; ring_rgb = None
            if crop is not None and crop.size > 4:
                e = max(2, int((Y1 - Y0) * 0.45))
                R0, R1, C0, C1 = max(0, Y0 - e), min(ah, Y1 + e), max(0, X0 - e), min(aw, X1 + e)
                big_ = cv2.cvtColor(small[R0:R1, C0:C1], cv2.COLOR_RGB2GRAY).astype(np.int16)
                ring = np.ones(big_.shape, bool); ring[Y0 - R0:Y1 - R0, X0 - C0:X1 - C0] = False
                rv = big_[ring]
                if rv.size: ring_fill = float((np.abs(rv - np.median(rv)) <= 12).mean())
                rc_ = small[R0:R1, C0:C1][ring]
                ring_rgb = [int(v) for v in np.median(rc_, axis=0)] if rc_.size else None
            margin = None
            if panel and not cap and not head:
                px0, py0, px1, py1 = panel
                edges_ = [L['x'] - px0, (L['y'] - py0) * (VH / VW), (py1 - (L['y'] + L['h'])) * (VH / VW)]
                if lay != 'side': edges_.append(px1 - (L['x'] + L['w']))   # a side card's graphic zone has no hard right edge
                margin = min(edges_) / (px1 - px0)
            lines.append(dict(s=txt, x=L['x'], y=L['y'], w=L['w'], h=L['h'], c=L['c'], cap=cap, head=head, con=con, margin=margin, ring_fill=ring_fill, ring_rgb=ring_rgb,
                              words=sum(1 for w in toks if not any(ch.isdigit() for ch in w)),
                              nums=sum(1 for w in toks if any(ch.isdigit() for ch in w)), over_face=over_face))
        s['lines'] = lines
        gfx = [L for L in lines if not L['cap'] and not L['head'] and L['con'] >= RULES['text_contrast_min']]
        s['words'] = sum(L['words'] for L in gfx); s['nums'] = sum(L['nums'] for L in gfx)
        # text blocks: lines stacked tight under each other (a paragraph, a list, a card body) form one graphic
        blocks = []
        for L in sorted(gfx, key=lambda L: L['y']):
            for B in blocks:
                last = B[-1]
                gap = L['y'] - (last['y'] + last['h'])
                xo = min(L['x'] + L['w'], last['x'] + last['w']) - max(L['x'], last['x'])
                if -0.5 * L['h'] < gap < 0.9 * max(L['h'], last['h']) and xo > 0: B.append(L); break
            else: blocks.append([L])
        s['blocks'] = [dict(words=sum(L['words'] for L in B), nums=sum(L['nums'] for L in B), text=' / '.join(L['s'] for L in B)) for B in blocks]
        s['gfx_lines'] = [L['s'] for L in gfx]
        tms = [L['margin'] for L in gfx if L['margin'] is not None]
        s['text_margin'] = min(tms) if tms else None
        hsv = cv2.cvtColor(small, cv2.COLOR_RGB2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [18, 8], [0, 180, 0, 256]); cv2.normalize(hist, hist)
        s['_hist'] = hist
        if lay == 'full' and not s['foot']: ref_hists.append(hist)
        S.append(s)

    fac10 = [face_of(V10.get(fp)) for fp in F10]
    lay10 = [layout(f) for f in fac10]
    results = []
    def report(name, ok, value, limit, spans=(), why=''):
        sp = []
        for x in spans:
            a, b = x if isinstance(x, (tuple, list)) else (x, x + 0.2)
            sp.append([round(float(a), 2), round(float(max(b, a + 0.2)), 2)])
        results.append(dict(test=name, ok=bool(ok), value=value, limit=limit, times=[x[0] for x in sp], spans=sp, why=why))

    designed = [s for s in S if s['panel'] and s['layout'] != 'footage' and not s['foot']]

    # 1. words per screen
    bad = []
    for s in S:
        cap_full = s['panel'] and s.get('big_w', 0) >= 0.85 and s.get('big_h', 0) >= 0.6
        if s['layout'] == 'footage' or s['foot']:
            if cap_full or s['layout'] == 'footage': continue
            if s['words'] > RULES['footage_words_max']: bad.append(s['t'])
            continue
        if cap_full: continue
        if s['words'] > RULES['screen_words_max'] or any(B['words'] > RULES['words_max'] or B['nums'] > RULES['numbers_max'] for B in s['blocks']):
            bad.append(s['t'])
    bad_r = runs_of(bad, 0.5, RULES['words_min_s'])
    cand = [s for s in S if s['layout'] != 'footage' and not s['foot']] or S
    w = max(cand, key=lambda s: max([B['words'] for B in s['blocks']] or [0]))
    wb = max(w['blocks'], key=lambda B: B['words']) if w['blocks'] else dict(words=0, nums=0, text='')
    report('words_per_screen', not bad_r, f"biggest graphic {wb['words']} words + {wb['nums']} numbers at {w['t']:g}s ('{wb['text'][:40]}')",
           f"<= {RULES['words_max']} words + {RULES['numbers_max']} number per graphic, <= {RULES['screen_words_max']} words per screen, for 1 s", bad_r,
           'too much text: "max 3 words per graphic" (r5 short); dense Spam Shield card (r5 intro)')

    # 2. small text chips beside him
    bad = [s['t'] for s in S if s['layout'] == 'full' and not s['foot'] and any(
        (not L['cap']) and (not L['head']) and L['words'] + L['nums'] >= 2 and L['h'] < RULES['chip_text_h_max'] and
        L['ring_fill'] >= RULES['chip_fill_min'] and L['con'] >= RULES['text_contrast_min'] for L in s['lines'])]
    bad_r = runs_of(bad, 0.5, 0.5)
    report('text_chips_on_speaker', not bad_r, f'{len(bad)} samples', f"no 2+ word label pills (text under {RULES['chip_text_h_max']*100:g}% of the height on a flat fill) beside him",
           bad_r, '"Built & sold / 60,000 customers": "there\'s a better way to show this"; "Easy part": "looks a bit lazy"; "New AI startup"')

    # 3. grey-only designed graphics
    bad = [s['t'] for s in designed if s['sat'] < RULES['grey_sat_min']]
    bad_r = runs_of(bad, 0.5, RULES['grey_min_s'])
    report('not_grey', not bad_r, f'{len(bad)} of {len(designed)} designed samples grey', f"colour >= {RULES['grey_sat_min']*100:g}% of the panel, never grey for 1 s",
           bad_r, 'grey wireframe placeholders (r3 "shockingly bad"); grey "Motion designer / Pay" card (r5 short)')

    # 4. Jack's orange and blue inside the graphics
    n = max(1, len(designed))
    o_sh = sum(s['orange'] >= RULES['brand_min'] for s in designed) / n
    b_sh = sum(s['blue'] >= RULES['brand_min'] for s in designed) / n
    neither = runs_of([s['t'] for s in designed if s['orange'] < RULES['brand_min'] and s['blue'] < RULES['brand_min']], 0.5, RULES['brand_gap_s'])
    spans = list(neither)
    if o_sh < RULES['brand_share_min']: spans += runs_of([s['t'] for s in designed if s['orange'] < RULES['brand_min']], 0.5, 1.0)
    if b_sh < RULES['brand_share_min']: spans += runs_of([s['t'] for s in designed if s['blue'] < RULES['brand_min']], 0.5, 1.0)
    ok = (not designed) or (o_sh >= RULES['brand_share_min'] and b_sh >= RULES['brand_share_min'] and not neither)
    report('accent_colours', ok, f'accent 1 in {o_sh*100:.0f}%, accent 2 in {b_sh*100:.0f}% of designed samples, {len(neither)} colourless stretches',
           f"each >= {RULES['brand_share_min']*100:.0f}%, never {RULES['brand_gap_s']:g} s with neither", spans,
           '"What happened to my orange and blue?" (r5 short)')

    # 5. content span (graphics big enough)
    bad = []
    for s in designed:
        lim = RULES['span_full'] if s['layout'] == 'graphic' else RULES['span_split'] if s['layout'] == 'split' else RULES['span_side']
        if s['span_area'] >= RULES['empty_area'] and s['span_w'] < lim: bad.append(s['t'])
    bad_r = runs_of(bad, 0.5, RULES['span_min_s'])
    report('graphic_size', not bad_r, f'{len(bad)} samples too narrow', f">= {RULES['span_full']*100:.0f}% wide full, {RULES['span_split']*100:.0f}% split, {RULES['span_side']*100:.0f}% side card",
           bad_r, '"Graphics must be big and visual, not small cards floating in empty space"')

    # 6. near-empty frames
    bad = [s['t'] for s in designed if s['span_area'] < RULES['empty_area']]
    bad_r = runs_of(bad, 0.5, RULES['empty_min_s'])
    report('not_empty', not bad_r, f'{len(bad)} samples near-empty', f"graphics cover >= {RULES['empty_area']*100:g}% of the panel",
           bad_r, '"no empty frames"; "13 to 14 s zoom with nothing either side" (r5 intro)')

    # 7. spacing: text hugging the panel edge
    bad = [s['t'] for s in designed if s.get('text_margin') is not None and s['text_margin'] < RULES['text_margin_min']]
    bad_r = runs_of(bad, 0.5, 1.0)
    tm = [s['text_margin'] for s in designed if s.get('text_margin') is not None]
    report('text_margin', not bad_r, f"min {min(tm)*100 if tm else 0:.1f}% of the panel width", f">= {RULES['text_margin_min']*100:g}% from the panel edge",
           bad_r, '"spacing is where it really gets its ass kicked"; "needs spacing rules"')

    # 7b. headline text centred (overlay text on him and headline text in full-screen graphics)
    bad = []
    for s in S:
        if s['foot'] or s['layout'] not in ('full', 'graphic'): continue
        for L in s['lines']:
            if L['cap'] or L['head'] or L['con'] < RULES['text_contrast_min'] or L['h'] < RULES['headline_h'] or L['words'] + L['nums'] < 1: continue
            # text inside a box (a pill, a card, an input field) follows the box; only free text must be centred
            if s['layout'] == 'full' and L['ring_fill'] >= RULES['chip_fill_min']: continue
            if s['layout'] == 'graphic' and L['ring_rgb'] and L['ring_fill'] >= RULES['chip_fill_min'] and \
                    max(abs(a - b) for a, b in zip(L['ring_rgb'], s.get('bg', L['ring_rgb']))) > 30: continue
            if abs((L['x'] + L['w'] / 2) - 0.5) > RULES['centre_tol']:
                bad.append(s['t']); break
    bad_r = runs_of(bad, 0.5, 1.0)
    report('text_centred', not bad_r, f'{len(bad)} samples with off-centre headline text', f"headline text centred within {RULES['centre_tol']*100:g}% of the width",
           bad_r, '"I told you I wanted all text centralised" (r7 intro, "Build today" at 2-3 s)')

    # 8. nothing over his face
    bad = [s['t'] for s in S if s['face'] and any(L['over_face'] and L['con'] >= 60 for L in s['lines'])]
    report('face_clear', not bad, f'{len(bad)} samples', '0 text boxes on his face', runs_of(bad, 0.5, 0.5),
           '"Pop-up cards placed over his face were invisible"; never cover his face')

    # 9. camera zoom / drift on him (10 fps, ORB on his own picture with his body masked out).
    #    Steps (frame to frame) catch punch-ins; 1 s and 3 s comparisons catch slow pushes and drifts without
    #    adding up frame-to-frame noise. Footage ranges are skipped: a push on a product clip is fine (voice call, "I love that").
    G10 = [cv2.cvtColor(cv2.imread(fp), cv2.COLOR_BGR2GRAY) for fp in F10]
    foot10 = [in_foot(t) for t in T10]
    orb = cv2.ORB_create(800); bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    kp = []
    for kk, (g, f, l) in enumerate(zip(G10, fac10, lay10)):
        m = np.full(g.shape, 255, np.uint8); H_, W_ = g.shape
        if l == 'split': m[:H_ // 2] = 0
        elif l == 'side': m[:, :int(0.62 * W_)] = 0
        # graphics that animate over him (kinetic text, chips) must not count as camera motion: mask every text box nearby
        for s_ in S:
            if abs(s_['t'] - T10[kk]) <= 0.5:
                for L in s_['lines']:
                    m[max(0, int((L['y'] - L['h']) * H_)):int((L['y'] + 2 * L['h']) * H_), max(0, int((L['x'] - 0.05) * W_)):int((L['x'] + L['w'] + 0.05) * W_)] = 0
        if f:
            x0 = int((f['x'] - 1.3 * f['w']) * W_); x1 = int((f['x'] + 2.3 * f['w']) * W_)
            m[max(0, int((f['y'] - 0.9 * f['h']) * H_)):, max(0, x0):max(0, x1)] = 0
        kp.append(orb.detectAndCompute(g, m))
    def sim(i, j):
        (k1, d1), (k2, d2) = kp[i], kp[j]
        if d1 is None or d2 is None or len(k1) <= 20 or len(k2) <= 20: return None
        ms = bf.match(d1, d2)
        if len(ms) < 20: return None
        p1 = np.float32([k1[m_.queryIdx].pt for m_ in ms]); p2 = np.float32([k2[m_.trainIdx].pt for m_ in ms])
        M, inl = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC, ransacReprojThreshold=2.0)
        if M is None or inl is None or inl.sum() < 15 or inl.mean() <= 0.35: return None
        return float(math.hypot(M[0, 0], M[1, 0])), float(M[0, 2]) / G10[j].shape[1], float(M[1, 2]) / G10[j].shape[0]
    cut10 = [False] + [float((np.abs(G10[k].astype(np.int16) - G10[k - 1].astype(np.int16)) > 20).mean()) > 0.3 for k in range(1, len(G10))]
    def him(i, j):   # same speaker layout all the way from i to j, no hard cut in between, not footage
        return all(fac10[k] is not None and lay10[k] in ('full', 'split', 'side') and lay10[k] == lay10[i] and not foot10[k] and
                   (k == i or not cut10[k]) for k in range(i, j + 1))
    steps, zooms, drifts = [], [], []
    def him_step(i, j):   # a punch-in is a cut by pixels but the same camera, scaled: allow the cut, not a change of camera angle
        if not all(fac10[k] is not None and lay10[k] in ('full', 'split', 'side') and lay10[k] == lay10[i] and not foot10[k] for k in (i, j)): return False
        yi, yj = fac10[i].get('yaw'), fac10[j].get('yaw')
        return yi is None or yj is None or abs(yi - yj) < 8
    def face_h(k):
        v = [fac10[m]['h'] for m in range(max(0, k - 2), min(len(fac10), k + 3)) if fac10[m]]
        return float(np.median(v)) if v else None
    for k in range(1, len(G10)):
        r = sim(k - 1, k) if him_step(k - 1, k) else None
        steps.append((T10[k], r))
        if r and abs(math.log(r[0])) > RULES['zoom_step_max']: zooms.append((T10[k] - 0.15, T10[k] + 0.05, r[0]))
    for k in range(10, len(G10), 5):
        for back, lim in ((10, RULES['zoom_max']), (30, RULES['zoom_max'])):
            if k - back < 0 or not him(k - back, k): continue
            r = sim(k - back, k)
            if not r: continue
            fa_, fb_ = face_h(k - back), face_h(k)
            moved_with_him = fa_ and fb_ and math.log(fb_ / fa_) * math.log(r[0]) > 0 and abs(math.log(fb_ / fa_)) >= 0.5 * abs(math.log(r[0]))
            if abs(math.log(r[0])) > lim and moved_with_him: zooms.append((T10[k - back], T10[k], r[0]))
            elif back == 30 and math.hypot(r[1], r[2] * (VH / VW)) > RULES['drift_max']: drifts.append((T10[k - back], T10[k], math.hypot(r[1], r[2])))
    def merge(sp):
        out = []
        for a, b, v in sorted(sp):
            if out and a <= out[-1][1] + 0.05: out[-1] = (out[-1][0], max(out[-1][1], b), max(out[-1][2], abs(v - 1) if v > 0.5 else v, key=abs))
            else: out.append((a, b, abs(v - 1) if v > 0.5 else v))
        return out
    zm, dr = merge(zooms), merge(drifts)
    report('no_camera_zoom', not zm, f"{len(zm)} zooms or punch-ins on him" + (f", biggest {max(z[2] for z in zm)*100:.1f}%" if zm else ''),
           f"scale on him steady: no {RULES['zoom_step_max']*100:g}% step, no {RULES['zoom_max']*100:g}% change over 1 or 3 s", [(z[0], z[1]) for z in zm],
           '"no camera punch-ins, drifts or zooms on him" (r5 intro: "weird camera jumping around", "keeps zooming in")')
    report('no_camera_drift', not dr, f'{len(dr)} drifts', f"his picture moves <= {RULES['drift_max']*100:g}% of the width over 3 s",
           [(z[0], z[1]) for z in dr], '"no camera punch-ins, drifts or zooms on him"')
    fz = []
    for k in range(5, len(fac10)):
        fa, fb = fac10[k - 5], fac10[k]
        if not (fa and fb) or foot10[k]: continue
        if abs((fa['x'] + fa['w'] / 2) - (fb['x'] + fb['w'] / 2)) > 0.6: continue
        if abs(math.log(fb['h'] / fa['h'])) <= RULES['zoom_rate_max']: continue
        if any(v is None for v in [fac10[j] for j in range(k - 5, k + 1)]): continue   # check before reading (crashed on test-8)
        hs_ = [fac10[j]['h'] for j in range(k - 5, k + 1)]
        steps_ = [abs(math.log(hs_[j + 1] / hs_[j])) for j in range(5)]
        # a zoom spreads the change over several frames; a hard cut puts it all in one step
        if max(steps_) < 0.6 * abs(math.log(fb['h'] / fa['h'])): fz.append(T10[k] - 0.25)
    fz_r = runs_of(fz, 0.1, 0.1)
    report('no_fast_zoom', not fz_r, f'{len(fz_r)} fast zooms', f"his face size changes <= {RULES['zoom_rate_max']*100:g}% per 0.5 s",
           fz_r, '"fast zoom in and out transitions ... makes you feel nauseous, too much happening" (r6 intro)')

    # 10. naked jump cuts on him (30 fps): his face jumps while the room behind him stays put
    jw, jh = (90, 160) if vert else (160, 90)
    G30 = decode_gray(vid, 30, jw, jh).astype(np.int16)
    jumps = []
    def face_at(t):
        k = min(len(fac10) - 1, max(0, int(round(t * 10 - 0.5))))
        return fac10[k], lay10[k]
    if len(G30) > 8:
        dp, db, dfc = np.zeros(len(G30)), np.full(len(G30), 99.0), np.zeros(len(G30))
        for k in range(1, len(G30)):
            t = k / 30.0
            if in_foot(t) or in_trans(t) or (cutpts is not None and not any(abs(t - c) <= 0.1 for c in cutpts)): continue
            f, l = face_at(t); fb_, lb_ = face_at(t - 0.12); fa_, la_ = face_at(t + 0.12)
            if not (f and fb_ and fa_) or l not in ('full', 'side', 'split') or not (l == lb_ == la_): continue
            m = np.zeros((jh, jw), bool)
            x0 = int((f['x'] - 0.8 * f['w']) * jw); x1 = int((f['x'] + 1.8 * f['w']) * jw)
            y0 = int((f['y'] - 0.5 * f['h']) * jh); y1 = int((f['y'] + 2.5 * f['h']) * jh)
            m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
            fm = np.zeros((jh, jw), bool)
            fm[max(0, int(f['y'] * jh)):max(0, int((f['y'] + f['h']) * jh)), max(0, int(f['x'] * jw)):max(0, int((f['x'] + f['w']) * jw))] = True
            region = np.ones((jh, jw), bool)
            if l == 'split': region[:jh // 2] = False
            if l == 'side': region[:, :int(0.62 * jw)] = False
            m &= region; fm &= region
            d = np.abs(G30[k] - G30[k - 1])
            dp[k] = float(d[m].mean()) if m.any() else 0
            dfc[k] = float(d[fm].mean()) if fm.any() else 0
            bgm = region & ~m
            db[k] = float(d[bgm].mean()) if bgm.any() else 0
        near_zoom = lambda t: any(a - 0.3 <= t <= b + 0.3 for a, b in fz_r)
        for k in range(4, len(dp) - 4):
            if dp[k] < 7 or dfc[k] < 8: continue
            nb = np.concatenate([dp[k - 3:k], dp[k + 1:k + 4]]); nf = np.concatenate([dfc[k - 3:k], dfc[k + 1:k + 4]])
            if dp[k] > 3.0 * max(np.median(nb), 1.0) and dfc[k] > 3.0 * max(np.median(nf), 1.0) and db[k] < 0.4 * dp[k] and not near_zoom(k / 30.0):
                jumps.append(k / 30.0)
    jr = [(t - 0.1, t + 0.1) for t in jumps]
    report('no_naked_jump_cut', not jr, f'{len(jr)} jump cuts on him', '0 uncovered jump cuts', jr,
           '"you should never have a naked cut" (r6 intro 26.3 s): cover it with a second angle or a graphic')

    # 11. his face must be visible when it is him (no back of head, no over-the-shoulder)
    bad = []
    if ref_hists:
        ref = np.mean(ref_hists, axis=0).astype(np.float32)
        for s in S:
            if s['face'] is None and not s['foot']:
                s['room_corr'] = float(cv2.compareHist(s['_hist'], ref, cv2.HISTCMP_CORREL))
                if s['room_corr'] >= RULES['room_corr_min'] and s['flat'] < 0.6: bad.append(s['t'])
    bad_r = runs_of(bad, 0.5, 0.5)
    report('face_visible', not bad_r, f'{len(bad)} samples of his room with no face', 'no shot of him without his face',
           bad_r, '"second camera angle must be FRONT-FACING ... never behind his head" (r5 intro)')

    # 11b. eyes on the lens: a shot of him with his face turned away (second angles looking off to the side)
    yw = [f['yaw'] if f and f.get('yaw') is not None and not in_foot(T10[k]) else None for k, f in enumerate(fac10)]
    yv = [y for y in yw if y is not None]
    side = []
    if yv:
        med = float(np.median(yv))
        for k in range(len(yw)):
            win = [y - med for y in yw[max(0, k - 2):k + 3] if y is not None]
            if yw[k] is not None and len(win) >= 3 and abs(float(np.median(win))) >= RULES['yaw_max']: side.append(T10[k])
    side_r = runs_of(side, 0.1, RULES['yaw_min_s'])
    report('eyes_on_lens', not side_r, f'{len(side_r)} shots of him turned away', f"face turned < {RULES['yaw_max']} deg, or for under {RULES['yaw_min_s']:g} s",
           side_r, '"remove the b-roll where I\'m looking off to the side" (r7 intro second angle)')

    # 12. silent stare: he is on screen and not talking
    sil = []
    if has_audio:
        raw = run(['ffmpeg', '-v', 'error', '-i', vid, '-ac', '1', '-ar', '16000', '-f', 's16le', '-']).stdout
        a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
        hop = 800; nh = len(a) // hop
        if nh > 10:
            db_ = 20 * np.log10(np.sqrt(np.mean(a[:nh * hop].reshape(nh, hop) ** 2, axis=1) + 1e-12))
            qmask = db_ < max(np.percentile(db_, 90) - RULES['silence_db_below_speech'], -55)
            k = 0
            while k < nh:
                if not qmask[k]: k += 1; continue
                j = k
                while j < nh and qmask[j]: j += 1
                t0, t1 = k * 0.05, j * 0.05
                if t1 - t0 >= RULES['silence_min_s'] and t0 > 0.3 and t1 < DUR - 0.6:
                    ks = [m for m in range(len(T10)) if t0 <= T10[m] < t1]
                    if ks and sum(1 for m in ks if fac10[m] is not None and lay10[m] in ('full', 'split')) >= 0.6 * len(ks): sil.append((t0, t1))
                k = j
    report('no_silent_stare', not sil, f'{len(sil)} silent holds on him' + (f", longest {max(b - a for a, b in sil):.2f}s" if sil else ''),
           f"no silence >= {RULES['silence_min_s']}s while he is on screen", sil,
           '"a frame ... where I\'m just looking at the camera, not doing anything" (r6 short 10 s)')

    # 13. decorative sparkle stars (4 fps: they twinkle, so 2 fps misses them)
    f4d = os.path.join(out, 'frames4'); shutil.rmtree(f4d, ignore_errors=True); os.makedirs(f4d)
    sw4 = 1080 if vert else 1920   # stars are ~30 px at 1920: full size or they blur into blobs
    run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', f'fps=4,scale={sw4}:-2', '-q:v', '2', os.path.join(f4d, '%05d.jpg')])
    star_hits = []
    for k, fp in enumerate(sorted(glob.glob(os.path.join(f4d, '*.jpg')))):
        t = (k + 0.5) / 4
        if in_foot(t): continue
        f = fac10[min(len(fac10) - 1, max(0, int(round(t * 10 - 0.5))))] if fac10 else None
        if f is None and lay10 and False: pass
        im4 = np.asarray(Image.open(fp).convert('RGB'))
        st_ = find_stars(im4, f)
        if st_: star_hits.append((t, st_))
    shutil.rmtree(f4d, ignore_errors=True)   # full-size frames are only needed for this test
    near = lambda t: next((s for s in S if abs(s['t'] - t) <= 0.26), None)
    bad = [t for t, st_ in star_hits if (near(t) is None or near(t)['layout'] != 'footage')]
    for t, st_ in star_hits:
        s_ = near(t)
        if s_ is not None: s_['stars'] = s_.get('stars', []) + st_
    report('no_sparkle_stars', not bad, f'{len(bad)} quarter-second samples with stars', '0 decorative stars', runs_of(bad, 0.25, 0.25),
           '"the sparkle star on the Glaido logo ... and decorative corner stars in general" (r6 intro)')

    # 14. pacing (cuts, layout switches, graphic changes; his body and the captions masked)
    H_, W_ = G10[0].shape if G10 else (1, 1)
    ev = []
    for k in range(1, len(G10)):
        f, l = fac10[k], lay10[k]
        m = np.ones((H_, W_), bool)
        for b0, b1 in bands: m[int(b0 * H_):int(b1 * H_)] = False
        if l == 'split': m[H_ // 2:] = False
        elif l == 'side': m[:, int(0.62 * W_):] = False
        elif l == 'full' and f:
            x0 = int((f['x'] - 1.5 * f['w']) * W_); x1 = int((f['x'] + 2.5 * f['w']) * W_)
            m[max(0, int((f['y'] - 1.0 * f['h']) * H_)):, max(0, x0):max(0, x1)] = False
        d = np.abs(G10[k].astype(np.int16) - G10[k - 1].astype(np.int16))
        if float((d > 14).mean()) > 0.35 or l != lay10[k - 1] or (m.any() and float((d[m] > 14).mean()) > 0.004): ev.append(T10[k])
    ev = sorted(set(round(e, 2) for e in ev + jumps))
    pts = [0.0] + ev + [DUR]
    gaps = [(pts[i], pts[i + 1], pts[i + 1] - pts[i]) for i in range(len(pts) - 1)]
    gaps_c = [g for g in gaps if not (g[1] >= DUR - 0.05 and g[2] <= 1.5)]   # an end card may rest for its last second
    if mode == 'short':
        R = RULES['short']
        bad = [g for g in gaps_c if (g[0] < 3 and g[2] > R['gap_first3']) or (g[0] >= 3 and g[2] > R['gap_after'])]
        avg = DUR / (len(ev) + 1)
        report('pacing', not bad and avg <= R['avg_gap'], f"{len(ev)} changes, avg gap {avg:.2f}s, longest {max(g[2] for g in gaps):.2f}s",
               f"first 3 s gap <= {R['gap_first3']}s, then <= {R['gap_after']}s, avg <= {R['avg_gap']}s", [(g[0], g[1]) for g in bad],
               '"something needs to be changing every 0.5 to 1 second" early, 1-1.5 s in shorts; RULES 15')
        segs = []
        for s in S:
            if segs and segs[-1][2] == s['layout']: segs[-1][1] = s['t'] + 0.25
            else: segs.append([s['t'] - 0.25, s['t'] + 0.25, s['layout']])
        lh = [g for g in segs if (g[2] == 'full' and g[1] - g[0] > R['speaker_hold'] + 0.25) or (g[2] == 'split' and g[1] - g[0] > R['split_hold'] + 0.25)]
        spk = sum(1 for s in S if s['layout'] in ('full', 'split')) / max(1, len(S))
        report('layout_holds', not lh and spk <= R['speaker_share_max'] + 0.02,
               f"speaker on screen {spk*100:.0f}%, longest full-speaker hold {max([g[1] - g[0] for g in segs if g[2] == 'full'] or [0]):.1f}s",
               f"speaker <= {R['speaker_share_max']*100:.0f}%, full hold <= {R['speaker_hold']}s, split hold <= {R['split_hold']}s", [(g[0], g[1]) for g in lh], 'RULES 4 and 16')
    else:
        R = RULES['long']
        f30 = [g for g in gaps_c if g[0] < 30]
        bad = [g for g in f30 if g[2] > R['gap_first30']] + [g for g in gaps_c if g[0] >= 30 and g[2] > R['gap_after']]
        n30 = sum(1 for e in ev if e < 30); avg30 = min(30, DUR) / (n30 + 1)
        report('pacing', not bad and avg30 <= R['avg_gap_first30'], f"first 30 s: {n30} changes, avg gap {avg30:.2f}s, longest {max([g[2] for g in f30] or [0]):.2f}s",
               f"first 30 s: gap <= {R['gap_first30']}s, avg <= {R['avg_gap_first30']}s; later gap <= {R['gap_after']}s", [(g[0], g[1]) for g in bad], 'RULES 17')

    # 15. sync
    if sync:
        B = json.load(open(os.path.expanduser(sync)))
        offs = []
        for b in B:
            wt = b.get('word_t', b.get('word_at')); et = b.get('event_t', b.get('beat_t', b.get('at')))
            if wt is None or et is None: continue
            offs.append(((et - wt) * FPS, b.get('word', '?'), wt))
        badb = [o for o in offs if abs(o[0]) > RULES['sync_fail_frames'] or o[0] > RULES['sync_ok_frames']]
        wo = max(offs, key=lambda o: abs(o[0])) if offs else (0, '-', 0)
        report('sync', not badb, f"{len(offs)} beats, worst {wo[0]:+.1f} frames on '{wo[1]}'",
               f"within {RULES['sync_ok_frames']} frames, never late, fail over {RULES['sync_fail_frames']}", [o[2] for o in badb],
               '"graphics must land on the exact word they illustrate (within 2 frames)"')
    else:
        report('sync', True, 'skipped (no --sync file)', 'within 2 frames', [], 'pass --sync to check')

    # ---- approved exceptions: a FAIL becomes PASS only when every flagged span sits inside a window Jack approved,
    #      for that exact test, with his words quoted (--approved file: [{"test", "t": [a, b], "jack": "his words"}]) ----
    for r in results:
        if r['ok'] or not r['spans']: continue
        wins = [a for a in approved if a.get('test') == r['test'] and a.get('jack') and len(a.get('t', [])) == 2]
        if wins and all(any(w['t'][0] <= s0 and s1 <= w['t'][1] for w in wins) for s0, s1 in r['spans']):
            r['ok'] = True; r['approved'] = [w['jack'] for w in wins]
            r['value'] = f"{r['value']} (APPROVED by Jack: \"{wins[0]['jack'][:60]}\")"

    # ---- outputs ----
    clean = []
    for s in S:
        c = {k: v for k, v in s.items() if not k.startswith('_')}
        c['file'] = os.path.relpath(s['file'], out); clean.append(c)
    rep = dict(video=vid, mode=mode, size=[VW, VH], duration=round(DUR, 2), footage=foot, gate_pass=all(r['ok'] for r in results), tests=results)
    json.dump(rep, open(os.path.join(out, 'report.json'), 'w'), indent=1)
    json.dump(dict(samples=clean, steps10=[[t, r] for t, r in steps], faces10=fac10, jumps=jumps, silences=sil, events=ev),
              open(os.path.join(out, 'flags.json'), 'w'), default=float)
    contact_sheet(S, results, out, vert)
    if not quiet:
        for r in results:
            print(f"{'PASS' if r['ok'] else 'FAIL'}  {r['test']:<22} {r['value']}  (limit: {r['limit']})" + (f"  at {fmt(r['times'])}" if r['times'] and not r['ok'] else ''))
        print('GATE PASS' if rep['gate_pass'] else 'GATE FAIL', '|', os.path.join(out, 'contact.jpg'))
    return 0 if rep['gate_pass'] else 1

def contact_sheet(S, results, out, vert):
    """2 fps sheet for the judge: time, layout, FOOTAGE tag, and failing tests in red."""
    flagged = {}
    for r in results:
        if r['ok']: continue
        for a, b in r['spans']:
            for s in S:
                if a - 0.26 <= s['t'] < b + 0.01: flagged.setdefault(s['t'], set()).add(r['test'])
    tw = 216 if vert else 384
    th = int(tw * (16 / 9 if vert else 9 / 16))
    cols = 10 if vert else 6; lab = 36; pad = 8
    rows = (len(S) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (236, 237, 240))
    d = ImageDraw.Draw(sheet)
    try: fnt = ImageFont.truetype(os.path.join(HERE, 'fonts', 'Switzer-Variable.ttf'), 15)
    except Exception: fnt = None
    for i, s in enumerate(S):
        x = pad + (i % cols) * (tw + pad); y = pad + (i // cols) * (th + lab + pad)
        sheet.paste(Image.open(s['file']).convert('RGB').resize((tw, th)), (x, y + lab))
        f = flagged.get(s['t'])
        if f: d.rectangle([x - 4, y + lab - 4, x + tw + 3, y + lab + th + 3], outline=(225, 30, 30), width=5)
        d.text((x + 2, y + 1), f"{s['t']:.2f}s {s['layout']}" + (' FOOTAGE' if s['foot'] else ''), fill=(15, 15, 15), font=fnt)
        if f: d.text((x + 2, y + 18), ','.join(sorted(f))[:44], fill=(200, 20, 20), font=fnt)
    sheet.save(os.path.join(out, 'contact.jpg'), quality=86)

if __name__ == '__main__':
    sys.exit(main())
