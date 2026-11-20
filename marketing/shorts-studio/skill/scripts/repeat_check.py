#!/usr/bin/env python3
"""repeat_check.py: find stutters, repeats and restarts in a transcript (rule R32: cut every false start).

usage: repeat_check.py <words.json> [--gap 1.5] [--json out.json]
       repeat_check.py <words.json> --audio <voice.wav|cut.mp4> [--win 3.0] [--model small.en]   (deep: re-listens in short windows)

words.json: [{"w","s","e"}, ...] (shorts-studio format) or [{"text","start","end"}].
It finds:
- a word or phrase said twice in a row: "and fixes and fixes", "the the", "so to so to"
- a cut-off start: "Man- ManyChat" (a short word that is the start of the next word)
- a restart: the same 2+ words again within --gap seconds, with up to 2 words between ("it is, it's live")
- a retake: the same sentence (5+ words, one word may differ) said again within 15 s: drop the first take
For each one it prints the time span to DROP (the FIRST copy, so the clean take stays) and exits 1 if it found any.
Whisper often merges repeats into one copy ("and fixes and fixes" came back as "and fixes", 25 Oct). So --audio
re-transcribes the voice in short overlapping windows (3 s, step 1.5 s) where whisper has no context to tidy the repeat
away, finds repeats in each window and maps them back to the cut's time line. Always run --audio before the edit.
"""
import json, os, re, subprocess, sys, tempfile

def norm(w):
    return re.sub(r"[^a-z0-9$']", '', w.lower().replace('’', "'"))

def load(p):
    W = json.load(open(p)); W = W.get('words', W) if isinstance(W, dict) else W
    out = []
    for w in W:
        t = w.get('w', w.get('text', w.get('word', '')))
        out.append(dict(w=t, n=norm(t), s=float(w.get('s', w.get('start', 0))), e=float(w.get('e', w.get('end', 0)))))
    return [w for w in out if w['n']]

def find(W, gap=1.5):
    hits, used = [], set()
    N = len(W)
    for n in (4, 3, 2, 1):                      # longest phrase first
        for i in range(N - n):
            if any(k in used for k in range(i, i + n)): continue
            a = [W[k]['n'] for k in range(i, i + n)]
            for skip in (0, 1, 2) if n >= 2 else (0,):
                j = i + n + skip
                if j + n > N: break
                b = [W[k]['n'] for k in range(j, j + n)]
                if a != b or W[j]['s'] - W[i + n - 1]['e'] > gap: continue
                if n == 1 and a[0] in ('ha', 'very', 'really', 'no', 'yeah', 'bye') : continue   # said twice on purpose
                if W[i + n - 1]['w'].rstrip().endswith(('.', '?', '!')) and skip == 0: continue   # "...draw it. It is..." is a new sentence
                hits.append(dict(kind='repeat' if skip == 0 else 'restart', text=' '.join(W[k]['w'] for k in range(i, j + n)),
                                 drop=[round(W[i]['s'], 3), round(W[j]['s'], 3)], first=i, second=j, n=n))
                used.update(range(i, j)); break
    # retake: the same sentence said again within 15 s, allowing one changed or dropped word ("into a beautiful hand-drawn
    # illustration" -> "into a hand-drawn illustration"). 27 Oct 2026: a 10-word retake slipped past the 1 to 4 word check.
    def run(i, j):
        n = k = 0; skips = 0
        while i + n < N and j + k < N and j + k > i + n:
            if W[i + n]['n'] == W[j + k]['n']: n += 1; k += 1; continue
            if skips >= 1: break
            if i + n + 1 < N and W[i + n + 1]['n'] == W[j + k]['n']: n += 1; skips += 1; continue   # a word dropped in the retake
            if j + k + 1 < N and W[i + n]['n'] == W[j + k + 1]['n']: k += 1; skips += 1; continue   # a word added in the retake
            n += 1; k += 1; skips += 1                                                               # a word changed
        return n, k
    for i in range(N):
        if any(i in range(h['first'], h['second']) for h in hits): continue
        for j in range(i + 4, min(N, i + 60)):
            if W[j]['s'] - W[i]['s'] > 15 or W[j]['n'] != W[i]['n']: continue
            n, k = run(i, j)
            if n >= 5 and k >= 5 and j >= i + n - 1:
                hits.append(dict(kind='retake', text=' '.join(W[x]['w'] for x in range(i, i + n)) + ' | ' + ' '.join(W[x]['w'] for x in range(j, j + k)),
                                 drop=[round(W[i]['s'], 3), round(W[j]['s'], 3)], first=i, second=j, n=n)); break
    for i in range(N - 1):                       # cut-off start: "Man-" then "ManyChat"
        a, b = W[i]['n'], W[i + 1]['n']
        if i in used or len(a) < 2 or len(a) >= len(b): continue
        if b.startswith(a) and (W[i]['w'].endswith('-') or W[i]['e'] - W[i]['s'] < 0.18):
            hits.append(dict(kind='cut-off', text=f"{W[i]['w']} {W[i+1]['w']}", drop=[round(W[i]['s'], 3), round(W[i + 1]['s'], 3)], first=i, second=i + 1, n=1))
    return sorted(hits, key=lambda h: h['drop'][0])

def deep(audio, win=3.0, model='small.en', gap=1.5):
    """Re-listen in short windows. Returns hits with times on the full file."""
    tmp = tempfile.mkdtemp(prefix='ss-rep-'); wav = os.path.join(tmp, 'a.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', audio, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], capture_output=True, text=True).stdout)
    hits, t0 = [], 0.0
    while t0 < dur - 0.5:
        sl = os.path.join(tmp, f's{t0:.1f}.wav'); od = os.path.join(tmp, f'o{t0:.1f}')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t0), '-t', str(win), '-i', wav, sl], check=True)
        subprocess.run(['npx', '--yes', 'hyperframes@' + os.environ.get('HF_VERSION', '0.8.181'), 'transcribe', sl, '-d', od, '--model', model, '--json'],
                       capture_output=True, text=True)
        f = os.path.join(od, 'transcript.json')
        if os.path.exists(f):
            R = json.load(open(f)); R = R if isinstance(R, list) else R.get('words', [])
            W = [dict(w=w['text'].strip(), n=norm(w['text'].strip().rstrip('.-')), s=w['start'] + t0, e=w['end'] + t0) for w in R]
            W = [w for w in W if w['n']]
            for h in find(W, gap):
                if not any(abs(h['drop'][0] - g['drop'][0]) < 0.3 for g in hits): hits.append(h)
        t0 += win / 2
    return sorted(hits, key=lambda h: h['drop'][0])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    H = find(load(a[0]), float(opt('--gap', 1.5)))
    if opt('--audio'):
        D = deep(opt('--audio'), float(opt('--win', 3.0)), opt('--model', 'small.en'), float(opt('--gap', 1.5)))
        for h in D: h['kind'] += ' (heard)'
        H = sorted(H + [h for h in D if not any(abs(h['drop'][0] - g['drop'][0]) < 0.3 for g in H)], key=lambda h: h['drop'][0])
    for h in H: print(f"{h['kind']:8s} {h['drop'][0]:7.2f}-{h['drop'][1]:7.2f}  \"{h['text']}\"  -> drop the first copy")
    if opt('--json'): json.dump(H, open(opt('--json'), 'w'), indent=1)
    print(f"{len(H)} repeat(s) found" if H else 'no repeats found')
    sys.exit(1 if H else 0)
