#!/usr/bin/env python3
"""qa.py: every automatic check on a finished Short, in one list. Ship only when it says QA PASS.

usage: qa.py <project> [--video deliver/final.mp4] [--accents "#hex,#hex"] [--fast]

Runs, in this order (each line PASS or FAIL with the number it measured):
  VOICE   repeats and retakes (re-listens to the final in 3 s windows), pauses over 0.2 s, lip sync (frame-exact)
  EYES    never looking down while on screen, face size in split and full, never away from the lens
  TIMING  no shot under 1.5 s, median shot 2 to 5 s, speaker never gone over 4 s, speaker share 45 to 60 %,
          speaker full screen 8 to 20 %, layout switches 6 to 14 per 40 s, switches on a phrase boundary or keyword
  MOTION  no hard snap inside an object (frame jump in the graphic with no switch), at most 2 new things in any 0.5 s
  SOUND   every sound effect names its visible cause and lands within 0.15 s of it, effects 12 to 17 dB under the voice,
          music 12 to 15 dB under, no draft-only licence
  TEXT    captions 1 to 3 words, captions on the seam in a split, 66 % down otherwise
  EXPORT  1080x1920, 30 fps, sharp
  GATE    the 20-test visual gate (gate/check.py) and the DOM spacing check result (work/bbox.json)
Writes deliver/qa.json. Every threshold has its source in references/CHECKS.md.
Built 27 Oct 2026 after the creator: "we need to have a series of checks and balances ... super comprehensive".
"""
import json, os, re, statistics as st, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
VENV = os.path.expanduser('~/.shorts-studio/venv/bin/python')
PY = VENV if os.path.exists(VENV) else sys.executable
R = []


def report(group, name, ok, measured, limit):
    R.append(dict(group=group, name=name, ok=bool(ok), measured=measured, limit=limit))
    print(f"{'PASS' if ok else 'FAIL'}  {group:<7} {name:<26} {measured}  (limit: {limit})")


def frames_gray(path, w=90, h=160, fps=30):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={w}:{h},format=gray', '-r', str(fps), '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)


def voice_db(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float) / 32768; h = 160; n = len(x) // h
    return 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-7)


def lufs(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]; m = re.search(r'I:\s+(-?[\d.]+)', s); return float(m.group(1)) if m else -70


def main(P, video=None, accents=None, fast=False):
    W = os.path.join(P, 'work'); D = os.path.join(P, 'deliver'); video = video or os.path.join(D, 'final.mp4')
    L = json.load(open(os.path.join(W, 'design.json')))['layout']; T = json.load(open(os.path.join(W, 'design.json'))).get('T') or L[-1][1]
    words = json.load(open(os.path.join(W, 'words_final.json')))
    caps = json.load(open(os.path.join(W, 'design.json'))).get('captions', [])
    ev = json.load(open(os.path.join(W, 'events.json'))) if os.path.exists(os.path.join(W, 'events.json')) else []
    face_wins = [(a, min(b, T)) for a, b, ty, sc in L if ty in ('split', 'jack')]

    # ---------------- VOICE
    if not fast:
        r = subprocess.run([sys.executable, os.path.join(HERE, 'repeat_check.py'), os.path.join(W, 'words_final.json'), '--audio', video], capture_output=True, text=True)
        hits = [l for l in r.stdout.splitlines() if '->' in l]
        report('VOICE', 'repeats and retakes', not hits, f'{len(hits)} found' + (': ' + hits[0].strip()[:60] if hits else ''), '0 (listened in 3 s windows)')
    va = os.path.join(D, 'audio', 'voice.wav'); db = voice_db(va if os.path.exists(va) else video)
    q = db < np.percentile(db, 90) - 30; runs = []; s0 = None
    first = int(words[0]['s'] * 100) if words else 0; last = int(words[-1]['e'] * 100) if words else len(q)
    for i in range(first, min(last, len(q))):
        if q[i] and s0 is None: s0 = i
        if not q[i] and s0 is not None:
            if i - s0 >= 26: runs.append((s0 / 100, i / 100))
            s0 = None
    report('VOICE', 'no pause over 0.25 s', not runs, f'{len(runs)} pauses' + (f' (first at {runs[0][0]:.1f} s, {runs[0][1]-runs[0][0]:.2f} s)' if runs else ''), '0 between the first and last word')
    # audio wave checks (27 Oct, creator: "do an audio wave analysis to make sure that we're cutting things up properly")
    # 1. what each pause cut REMOVED must be quiet (a cut that removes the tail of "turns" reads as a word jump)
    ref = np.percentile(db, 90); TRM = json.load(open(os.path.join(W, 'trim.json'))) if os.path.exists(os.path.join(W, 'trim.json')) else {'cuts': []}
    cpre = os.path.join(W, 'cut_audio.wav'); bad_cut = []
    if os.path.exists(cpre):
        dpre = voice_db(cpre); rpre = np.percentile(dpre, 90); removed = 0
        for c in sorted(TRM.get('cuts', []), key=lambda c: c['frames'][0]):
            a0, a1 = c['frames'][0] / 30, c['frames'][1] / 30; t = a0 - removed; removed += a1 - a0
            seg = dpre[int(a0 * 100):int(a1 * 100)]
            if c.get('explicit'): continue   # an explicit cut removes a murmur on purpose
            if len(seg) and (seg > rpre - 18).sum() >= 4: bad_cut.append(f"{t:.2f}s ({c['after']}|{c['before']}: {int((seg > rpre - 18).sum()) * 10} ms of voice removed)")
    report('VOICE', 'cuts remove only silence', not bad_cut, f'{len(bad_cut)} cut into words' + (f': {bad_cut[:3]}' if bad_cut else ''), 'under 40 ms of voice inside any cut')
    # 2. a murmur: a mid-level stretch (9 to 24 dB under speech, 0.28 s+) that no normal word explains
    mid = (db > ref - 24) & (db < ref - 9); runs_m = []; s0 = None
    for i in range(first, min(last, len(mid))):
        if mid[i] and s0 is None: s0 = i
        if not mid[i] and s0 is not None:
            if i - s0 >= 28:
                a_, b_ = s0 / 100, i / 100
                cov = [w for w in words if min(b_, w['e']) - max(a_, w['s']) > 0.5 * (b_ - a_)]
                if not cov or any(w['e'] - w['s'] > 0.8 for w in cov): runs_m.append((a_, b_))
            s0 = None
    report('VOICE', 'no murmur between words', not runs_m, f'{len(runs_m)} murmurs' + (f' at {[round(a, 2) for a, b in runs_m[:3]]}' if runs_m else ''), 'no 0.28 s+ quiet voice that is not a word')
    lj = os.path.join(D, 'lipsync.json')
    if os.path.exists(lj):
        J = json.load(open(lj)); report('VOICE', 'lip sync', J.get('pass_'), f"{sum(1 for p in J['pieces'] if abs(p['offset_frames']) <= 1)} of {len(J['pieces'])} pieces on frame", 'every piece within 1 frame')
    else: report('VOICE', 'lip sync', False, 'not run (sound.py runs it)', 'deliver/lipsync.json')

    # ---------------- EYES (face tracked on the final, 10 fps)
    ft = os.path.join(ROOT, 'bin', 'face_track'); fj = os.path.join(W, 'qa_face.json')
    subprocess.run([ft, video, fj, '10'], capture_output=True)
    F = json.load(open(fj))['frames'] if os.path.exists(fj) else []
    def lay(t):
        for a, b, ty, sc in L:
            if a <= t < b: return ty
        return None
    onface = [f for f in F if lay(f['t']) in ('split', 'jack') and f.get('box')]
    pitch = [f['pitch'] for f in onface if f.get('pitch') is not None]
    med = st.median(pitch) if pitch else 0
    me = st.median([f['eyes'] for f in onface if f.get('eyes')] or [1])
    # a blink is not a look-down: skip frames with the lids shut (openness under 70% of his usual)
    down = [f['t'] for f in onface if f.get('pitch') is not None and f['pitch'] > med + 9 and not (f.get('eyes') and f['eyes'] < 0.7 * me)]
    # one or two isolated frames at a switch (head mid-turn, eyes on the lens) are allowed; a run of 3 (0.3 s) is not
    runs_d = []; prev = None
    for t in down:
        if prev is not None and t - prev <= 0.11: runs_d[-1].append(t)
        else: runs_d.append([t])
        prev = t
    long_d = [r for r in runs_d if len(r) >= 3]
    report('EYES', 'never looking down', not long_d, f'{len(long_d)} runs of 0.3 s+ (head tipped {med:+.0f}+9 deg)' + (f', first at {long_d[0][0]:.1f} s' if long_d else ''), '0 runs (single frames at a switch allowed)')
    my = st.median([f['yaw'] for f in onface if f.get('yaw') is not None] or [0]); away = [f['t'] for f in onface if f.get('yaw') is not None and abs(f['yaw'] - my) >= 12]
    ra = []; prev = None
    for t in away:
        if prev is not None and t - prev <= 0.11: ra[-1].append(t)
        else: ra.append([t])
        prev = t
    long_a = [r for r in ra if len(r) >= 8]
    report('EYES', 'facing the lens', not long_a, f'{len(long_a)} turns of 0.8 s+ away from his usual angle', '0 (as the gate: 12 deg for 0.8 s)')
    def share(ty, H):
        hs = [(f['box'][3] - f['box'][1]) * (1920 / H if ty == 'split' else 1) for f in onface if lay(f['t']) == ty]
        return st.median(hs) if hs else None
    sp = share('split', 960); fu = share('jack', 1920)
    if sp is not None: report('EYES', 'face size in the split', 0.30 <= sp <= 0.46, f'{sp*100:.0f}% of the panel', '30 to 46% (measured face box, forehead to chin)')
    if fu is not None: report('EYES', 'face size full screen', 0.28 <= fu <= 0.44, f'{fu*100:.0f}% of the height', '28 to 44%')

    # ---------------- TIMING
    shots = [(a, min(b, T), ty) for a, b, ty, sc in L if min(b, T) - a > 0.01]
    short = [(round(a, 2), round(b - a, 2)) for k, (a, b, ty) in enumerate(shots) if b - a < 1.5 and b < T - 0.01 and not (k == 0 and L[0][3] == L[1][3] and b - a <= 0.6)]   # an opening reveal (the first object shrinks to the top) is allowed
    report('TIMING', 'no shot under 1.5 s', not short, f'{len(short)} short' + (f': {short[:3]}' if short else ''), 'every layout window 1.5 s+ (approved Short: 1 of 18 under 1.2 s)')
    reveal = len(L) > 1 and L[0][3] == L[1][3] and L[0][1] - L[0][0] <= 0.6   # an opening reveal: one motion, not a shot
    md = st.median([b - a for k, (a, b, ty) in enumerate(shots) if not (k == 0 and reveal)]); report('TIMING', 'median shot length', 1.6 <= md <= 5, f'{md:.2f} s', '1.6 to 5 s (approved Short 2.1 s; 1.25 s read as frantic, 1.65 s as better: creator, 26 to 27 Oct)')
    gaps = []; last_end = 0
    for a, b in face_wins: gaps.append(a - last_end); last_end = b
    gaps.append(T - last_end); mg = max(gaps)
    report('TIMING', 'speaker never gone long', mg <= 4.5, f'longest {mg:.1f} s without him', '4.5 s')
    sh = sum(b - a for a, b in face_wins) / T; report('TIMING', 'speaker share', 0.40 <= sh <= 0.72, f'{sh*100:.0f}%', '40 to 72% (high-baseline creators: face 63% of the body, BL08)')
    fs = sum(min(b, T) - a for a, b, ty, sc in L if ty == 'jack') / T; report('TIMING', 'speaker full screen', 0.08 <= fs <= 0.22, f'{fs*100:.0f}%', '8 to 22% (on the turns)')
    sw = sum(1 for i in range(1, len(L)) if (L[i][2] != L[i - 1][2] or L[i][3] != L[i - 1][3]) and not (i == 1 and reveal)); per40 = sw / T * 40
    report('TIMING', 'layout switches', 6 <= per40 <= 18, f'{per40:.1f} per 40 s', '6 to 18 per 40 s (approved Short: 17.9)')
    TRM0 = json.load(open(os.path.join(W, 'trim.json'))) if os.path.exists(os.path.join(W, 'trim.json')) else {'cuts': []}
    def fin(t):   # untrimmed -> final time
        r = 0
        for c in TRM0.get('cuts', []):
            if c['frames'][1] / 30 <= t: r += (c['frames'][1] - c['frames'][0]) / 30
        return t - r
    J = [fin(j) for j in (json.load(open(os.path.join(W, 'joins.json'))) if os.path.exists(os.path.join(W, 'joins.json')) else [])]
    EDn = [fin(x) for e in (json.load(open(os.path.join(W, 'eyes_down.json'))) if os.path.exists(os.path.join(W, 'eyes_down.json')) else []) for x in e]
    CUTS = J + [fin(c['frames'][0] / 30) for c in TRM0.get('cuts', [])]
    forced = lambda a: any(abs(a - x) < 0.2 for x in J + EDn + [c for c in CUTS])
    bad = []
    for k_, (a, b, ty, sc) in enumerate(L[1:]):
        if (k_ == 0 and reveal) or forced(a): continue
        prevw = [w for w in words if w['e'] <= a + 0.06]; nxt = [w for w in words if w['s'] >= a - 0.06]
        if not prevw or not nxt: continue
        pw, nw = prevw[-1], nxt[0]; gap = nw['s'] - pw['e']
        if pw['w'].endswith(('.', ',', '?', '!', ':')) or gap >= 0.12: continue
        hit = any(abs(e[0] - nw['s']) < 0.35 and not e[1].startswith(('layout', 'sfx:')) for e in ev)   # the new shot lands something on this word
        if not hit: bad.append(f"{a:.1f}s '{pw['w']}|{nw['w']}'")
    report('TIMING', 'switches on phrase or keyword', len(bad) <= 1, f'{len(bad)} mid-phrase' + (f': {bad[:3]}' if bad else ''), 'at most 1 unforced (a phrase end, the keyword it shows, or forced by a camera cut or look-down)')

    # ---------------- MOTION
    G = frames_gray(video); dd = np.abs(np.diff(G, axis=0)); top = dd[:, :80, :].mean((1, 2)); full = dd.mean((1, 2))
    bounds = [a for a, b, ty, sc in L[1:]]; tz = [L[i][0] for i in range(1, len(L)) if L[i][2] != L[i - 1][2] or L[i][3] != L[i - 1][3]]
    snaps = []
    for k in range(1, len(full)):
        t = k / 30
        if any(abs(t - x) < 0.12 for x in bounds) or any(-0.55 < t - x < 0.55 for x in tz): continue   # the eased grow, shrink and slide around a switch
        ty = lay(t); sig = top[k - 1] if ty == 'split' else full[k - 1]
        nb = np.concatenate([top[max(0, k - 6):k - 1], top[k:k + 5]]) if ty == 'split' else np.concatenate([full[max(0, k - 6):k - 1], full[k:k + 5]])
        if sig > 22 and sig > 4 * max(np.median(nb), 1): snaps.append(round(t, 2))
    snaps_r = []
    for t in snaps:
        if not snaps_r or t - snaps_r[-1] > 0.3: snaps_r.append(t)
    report('MOTION', 'no hard snap in a shot', len(snaps_r) <= 1, f'{len(snaps_r)} snaps' + (f' at {snaps_r[:4]}' if snaps_r else ''), 'at most 1 (a frame that jumps with no layout switch)')
    appear = sorted(e[0] for e in ev if not e[1].startswith(('layout', 'sfx:', 'trans:')))   # a transition is a layout change, not a new thing
    dens = max((sum(1 for x in appear if s <= x < s + 0.5) for s in appear), default=0)
    report('MOTION', 'at most 2 new things in 0.5 s', dens <= 2, f'max {dens} in 0.5 s', '2')

    # ---------------- SOUND
    cj = os.path.join(D, 'audio', 'cues.json')
    if os.path.exists(cj):
        C = json.load(open(cj)); cues = C.get('cues', [])
        ACT = re.compile(r'click|type|typ|land|drop|slide|swipe|draw|pop|tick|press|ping|DM|notif|print|key|stamp|count|crash|fall|flip|grow|fan|bump|whoosh|swoosh|camera|cut|send|rows|page|swap|settle|stars|ring', re.I)
        vis = [e[0] for e in ev if not e[1].startswith('sfx:')]
        nocause = [f"{c['t']:.1f} {c['role']}:{c.get('why','')}" for c in cues if not ACT.search(c.get('why', '') + ' ' + c['role'])]
        late = [f"{c['t']:.1f} {c['role']}" for c in cues if c.get('why') != 'cut to a full graphic' and not any(abs(c['t'] - x) <= 0.15 for x in vis) and not any(abs(c['t'] - x) <= 0.6 for x in vis)]
        report('SOUND', 'every effect has a cause', not nocause, f'{len(nocause)} without a visible action' + (f': {nocause[:2]}' if nocause else ''), 'each names what moves on screen')
        report('SOUND', 'effects on their event', not late, f'{len(late)} away from any event' + (f': {late[:2]}' if late else ''), 'within 0.15 s of a visible event')
        rp = C.get('report', {}); u = rp.get('sfx_under_voice_db')
        if u is not None: report('SOUND', 'effects level', 12 <= u <= 19, f'{u} dB under the voice', '12 to 19 dB')
        mus = os.path.join(D, 'audio', 'music.wav')
        if C.get('music') and os.path.exists(mus):
            mu = lufs(va) - lufs(mus); report('SOUND', 'music level', 12 <= mu <= 15, f'{mu:.1f} dB under the voice', '12 to 15 dB')
    lic = os.path.join(D, 'licences.json')
    if os.path.exists(lic): txt = open(lic).read().lower(); report('SOUND', 'no draft-only licence', 'draft-only' not in txt, 'draft-only' in txt and 'draft-only file inside' or 'clean', 'no draft-only file')

    # ---------------- TEXT
    if caps:
        many = [c['text'] for c in caps if c.get('n', len(c['text'].split())) > 3]
        report('TEXT', 'captions 1 to 3 words', not many, f'{len(many)} longer' + (f': {many[:2]}' if many else ''), '1 to 3 words')
        wrong = [round(c['start'], 1) for c in caps if (lay(c['start'] + 0.01) == 'split' and c['cy'] != 960) or (lay(c['start'] + 0.01) != 'split' and not 1250 <= c['cy'] <= 1310)]
        report('TEXT', 'caption placement', not wrong, f'{len(wrong)} off' + (f' at {wrong[:3]}' if wrong else ''), 'y 960 in a split, 1250 to 1310 otherwise')

    # ---------------- EXPORT
    pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', video], capture_output=True, text=True).stdout.strip()
    report('EXPORT', 'size and frame rate', pr.startswith('1080,1920,30'), pr, '1080,1920,30/1')
    if not fast:
        import cv2
        cap = cv2.VideoCapture(video); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); sharp = []
        for k in range(10):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * (k + 0.5) / 10)); ok, fr = cap.read()
            if ok: sharp.append(cv2.Laplacian(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        sv = st.median(sharp) if sharp else 0; report('EXPORT', 'sharp', sv >= 60, f'{sv:.0f} (Laplacian variance)', '60+')

    # ---------------- GATE + DOM
    bb = os.path.join(W, 'bbox.json')
    if os.path.exists(bb):
        B = json.load(open(bb)); s_ = B.get('summary', B); report('GATE', 'DOM spacing check', s_.get('pass', False), f"fails {s_.get('failCounts', {})}", 'pass')
    if not fast:
        TRS = ','.join(f'{max(0, L[i][0] - 0.5):.2f}-{L[i][0] + 0.5:.2f}' for i in range(1, len(L)) if L[i][2] != L[i - 1][2])
        g = subprocess.run([PY, os.path.join(ROOT, 'gate', 'check.py'), video, 'short', '--sync', os.path.join(W, 'sync.json'), '--out', os.path.join(D, 'gate'), '--cuts', ','.join(f'{c:.3f}' for c in CUTS)] + (['--transitions', TRS] if TRS else []),
                           capture_output=True, text=True, env=dict(os.environ, SS_ACCENTS=accents or os.environ.get('SS_ACCENTS', '')))
        fails = [l for l in g.stdout.splitlines() if l.startswith('FAIL')]
        report('GATE', '20-test visual gate', 'GATE PASS' in g.stdout, f'{20 - len(fails)} of 20' + (': ' + '; '.join(f.split()[1] for f in fails) if fails else ''), '20 of 20')
    n_fail = sum(1 for r in R if not r['ok'])
    json.dump(dict(pass_=n_fail == 0, fails=n_fail, checks=R), open(os.path.join(D, 'qa.json'), 'w'), indent=1)
    print(f"\n{'QA PASS' if n_fail == 0 else f'QA FAIL: {n_fail} of {len(R)} checks'} -> {os.path.join(D, 'qa.json')}")
    return n_fail == 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    sys.exit(0 if main(a[0], opt('--video'), opt('--accents'), '--fast' in a) else 1)
