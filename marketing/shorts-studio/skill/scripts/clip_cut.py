"""clip_cut.py: cut Shorts out of a long recording.

usage: python3 scripts/clip_cut.py <recording> --words <work>/words_raw.json --clips clips.json --out <work>/clips

clips.json (Claude writes it after reading the transcript, see references/CLIPS.md):
  [{"name": "pricing-trap", "from": 12, "to": 88, "why": "one idea, strong first line, clear payoff"}]
  "from" and "to" are word numbers (#n from captions.py), both included. Or use "start"/"end" in seconds.

Each clip starts a hair before its first word and ends a hair after its last, so no word is clipped.
Writes <out>/<name>/source.mp4 and <out>/<name>/words_raw.json (times start at 0 for that clip),
then prints each clip's length and first line so you can check the hook."""
import argparse, json, os, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--words', required=True)
ap.add_argument('--clips', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--pad', type=float, default=0.15)
ap.add_argument('--also', help='a second video on the same timeline (screen.mp4 from sync.py): cut it the same way')
a = ap.parse_args()
words = json.load(open(a.words))
clips = json.load(open(a.clips))
bad = 0
for c in clips:
    if 'from' in c:
        ws = [w for w in words if c['from'] <= w['i'] <= c['to']]
        if not ws:
            sys.exit(f"Clip {c.get('name')}: no words between #{c['from']} and #{c['to']}.")
        t0, t1 = max(0, ws[0]['start'] - a.pad), ws[-1]['end'] + a.pad
    else:
        t0, t1 = float(c['start']), float(c['end'])
        ws = [w for w in words if w['start'] >= t0 and w['end'] <= t1]
    name = c.get('name') or f"clip-{len(os.listdir(a.out)) + 1 if os.path.isdir(a.out) else 1}"
    d = os.path.join(a.out, name)
    os.makedirs(d, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-i', a.video, '-t', f'{t1 - t0:.3f}',
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', os.path.join(d, 'source.mp4')], check=True)
    if a.also:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-i', a.also, '-t', f'{t1 - t0:.3f}', '-an',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
                        os.path.join(d, 'screen.mp4')], check=True)
    re_t = [{'i': k, 'text': w['text'], 'start': round(w['start'] - t0, 3), 'end': round(w['end'] - t0, 3)}
            for k, w in enumerate(ws)]
    json.dump(re_t, open(os.path.join(d, 'words_raw.json'), 'w'), indent=0)
    length = t1 - t0
    first = ' '.join(w['text'] for w in ws[:16])
    flag = '' if 15 <= length <= 75 else '   <- outside 15 to 75 s, check it'
    bad += bool(flag)
    print(f"{name}: {length:5.1f} s raw (silences come out next){flag}\n   opens: \"{first}...\"")
print(f"\n{len(clips)} clip(s) -> {a.out}. Next, for each clip: silence_cut.py on <clip>/source.mp4 with --words <clip>/words_raw.json")
