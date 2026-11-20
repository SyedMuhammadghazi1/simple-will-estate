"""silence_cut.py: cut the dead air (and any retakes you choose) out of a recording.

usage: python3 scripts/silence_cut.py <recording> --out <work dir>
         [--words <work>/words_raw.json] [--drop <work>/drops.json]
         [--noise -35] [--min-silence 0.4] [--pad 0.12]

- Finds silences with ffmpeg (quieter than --noise dB for at least --min-silence seconds).
- Keeps --pad seconds of air around speech so words are never clipped.
- drops.json (optional) is a list of [start, end] seconds in the ORIGINAL recording to remove too,
  for example a fluffed line. Pick these by reading the transcript from captions.py.
Writes:
  <work>/cut.mp4       the tightened video (with sound)
  <work>/edl.json      where every kept piece came from (for the NLE export)
  <work>/words.json    the words moved onto the new timeline (if --words was given)
  <work>/captions.srt  a caption file for any editor (if --words was given)"""
import argparse, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--out', required=True)
ap.add_argument('--words')
ap.add_argument('--drop')
ap.add_argument('--noise', type=float, default=-35)
ap.add_argument('--min-silence', type=float, default=0.4)
ap.add_argument('--pad', type=float, default=0.12)
ap.add_argument('--min-keep', type=float, default=0.3)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
info = probe(a.video)
dur = info['dur']

r = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.video, '-vn', '-ac', '1', '-af',
                    f'silencedetect=n={a.noise}dB:d={a.min_silence}', '-f', 'null', '-'],
                   capture_output=True, text=True)
starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', r.stderr)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
if len(ends) < len(starts):
    ends.append(dur)
# two silences split by a tiny blip are one silence (otherwise words get squeezed into the gap and lost)
sil = []
for s0, e0 in zip(starts, ends):
    if sil and s0 - sil[-1][1] < 0.15:
        sil[-1][1] = e0
    else:
        sil.append([s0, e0])
starts, ends = [x[0] for x in sil], [x[1] for x in sil]
remove = [(max(0.0, s + a.pad), min(dur, e - a.pad)) for s, e in zip(starts, ends)]
drops = [list(map(float, d)) for d in json.load(open(a.drop))] if a.drop else []
if drops and a.words:
    # a drop must never clip a word it does not fully cover: pull its edges back to the word boundaries
    for w in json.load(open(a.words)):
        for d in drops:
            if w['start'] < d[0] < w['end'] and not (d[0] <= w['start'] and w['end'] <= d[1]):
                d[0] = w['end']
            if w['start'] < d[1] < w['end'] and not (d[0] <= w['start'] and w['end'] <= d[1]):
                d[1] = w['start']
remove += [tuple(d) for d in drops if d[1] > d[0]]
remove = sorted((s, e) for s, e in remove if e - s > 0.02)

# keep = everything not removed
keep, cur = [], 0.0
for s, e in remove:
    if s > cur:
        keep.append([cur, s])
    cur = max(cur, e)
if cur < dur:
    keep.append([cur, dur])
keep = [[round(s, 3), round(e, 3)] for s, e in keep if e - s >= a.min_keep]
if not keep:
    print('Nothing left after cutting. Try --noise -45 (quieter rooms) or a smaller --min-silence.')
    sys.exit(1)

edl, rec = [], 0.0
for s, e in keep:
    edl.append({'src_in': s, 'src_out': e, 'rec_in': round(rec, 3), 'rec_out': round(rec + e - s, 3)})
    rec += e - s
json.dump({'source': os.path.abspath(a.video), 'fps': info['fps'], 'width': info['w'], 'height': info['h'],
           'source_duration': dur, 'cut_duration': round(rec, 3), 'pieces': edl},
          open(os.path.join(a.out, 'edl.json'), 'w'), indent=1)

# render: trim each piece, 10 ms fades on the sound so the joins never click
parts, labels = [], []
for i, (s, e) in enumerate(keep):
    fd = min(0.01, (e - s) / 4)
    parts.append(f'[0:v]trim={s}:{e},setpts=PTS-STARTPTS[v{i}];'
                 f'[0:a]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d={fd},afade=t=out:st={e - s - fd:.3f}:d={fd}[a{i}];')
    labels.append(f'[v{i}][a{i}]')
fc = ''.join(parts) + ''.join(labels) + f'concat=n={len(keep)}:v=1:a=1[v][a]'
script = os.path.join(a.out, 'cut_filter.txt')
open(script, 'w').write(fc)
out = os.path.join(a.out, 'cut.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-filter_complex_script', script, '-map', '[v]', '-map', '[a]',
                '-r', str(round(info['fps'], 3)), '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '192k', out], check=True)
print(f'cut: {dur:.1f} s -> {rec:.1f} s ({dur - rec:.1f} s of silence removed, {len(keep)} pieces) -> {out}')


def to_cut(t):
    for p in edl:
        if p['src_in'] - 1e-3 <= t <= p['src_out'] + 1e-3:
            return p['rec_in'] + min(max(t, p['src_in']), p['src_out']) - p['src_in']
    return None


def srt_time(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def fix_drift(ws, sil):
    """Speech models sometimes time words inside a silence. Each such word is moved to the speech
    it belongs to: words nearer the start of the silence are squeezed in just before it, words nearer
    its end just after it. Nothing is dropped."""
    ws = [dict(w) for w in ws]

    def spread(run, t0, t1):
        weights = [max(1, len(w['text'])) for w in run]
        tot, cur = float(sum(weights)), t0
        for w, wt in zip(run, weights):
            d = (t1 - t0) * wt / tot
            w['start'], w['end'] = round(cur, 3), round(cur + d, 3)
            cur += d

    for s0, e0 in sil:
        inside = [w for w in ws if s0 + 0.05 < w['start'] < e0 - 0.05]
        if not inside:
            continue
        # speech models usually run LATE (they stretch words into the pause after them), so a word goes back
        # to the speech before the silence unless it starts in the last 0.3 s of it
        fwd = [w for w in inside if e0 - w['start'] < 0.3 and w is not ws[-1]]
        back = [w for w in inside if w not in fwd]
        # if the speech just before this silence was cut out as a retake, those words belong after it
        if back and any(d0 <= s0 - 0.1 and s0 <= d1 + 0.05 for d0, d1 in drops) and back[-1] is not ws[-1]:
            fwd, back = back + fwd, []
        if back:
            idx = ws.index(back[0])
            run = ([ws[idx - 1]] if idx > 0 else []) + back
            prev_end = max([x for _, x in sil if x <= s0] + [d[1] for d in drops if d[1] <= s0 + 0.05] + [0.0])
            t0 = max(run[0]['start'], prev_end)
            if s0 - t0 < 0.1 * len(run):
                t0 = max(prev_end, s0 - 0.12 * len(run))
            spread(run, t0, s0)
        if fwd:
            idx = ws.index(fwd[-1])
            nxt = ws[idx + 1]['start'] if idx + 1 < len(ws) else e0 + 0.15 * len(fwd)
            t1 = max(nxt, e0 + 0.12 * len(fwd))
            spread(fwd, e0, t1)
            if idx + 1 < len(ws) and ws[idx + 1]['start'] < t1:
                ws[idx + 1]['start'] = round(t1, 3)
    return ws


def monotonic(ws):
    """speech models sometimes give words out of order or overlapping: keep them in spoken order, never going back in time"""
    ws = sorted(ws, key=lambda w: w['i'])
    prev = -1.0
    for k, w in enumerate(ws):
        w['start'] = round(max(w['start'], prev + 0.02), 3)
        w['end'] = round(max(w['end'], w['start'] + 0.05), 3)
        prev = w['start']
    for k in range(len(ws) - 1):
        ws[k]['end'] = round(min(ws[k]['end'], max(ws[k + 1]['start'], ws[k]['start'] + 0.05)), 3)
    return ws


if a.words:
    words = []
    for w in fix_drift(json.load(open(a.words)), list(zip(starts, ends))):
        # anchor on the start of the word: speech models sometimes stretch a last word over the silence after it
        mid = w['start'] + min(0.15, (w['end'] - w['start']) / 2)
        m = to_cut(mid)
        if m is None:
            continue   # this word was cut out
        s, e = to_cut(w['start']), to_cut(w['end'])
        s = s if s is not None else m - 0.05
        if e is None or e < s:   # the end fell in a cut: stop the word where its piece ends
            p = next(p for p in edl if p['rec_in'] - 1e-3 <= m <= p['rec_out'] + 1e-3)
            e = min(p['rec_out'], s + 0.6)
        words.append({'i': w['i'], 'text': w['text'], 'start': round(s, 3), 'end': round(max(e, s + 0.05), 3)})
    words = monotonic(words)
    json.dump(words, open(os.path.join(a.out, 'words.json'), 'w'), indent=0)
    # SRT: short lines, broken at punctuation, pauses, or 32 characters
    cues, cur = [], []
    for k, w in enumerate(words):
        cur.append(w)
        text = ' '.join(x['text'] for x in cur)
        gap = words[k + 1]['start'] - w['end'] if k + 1 < len(words) else 9
        if len(text) > 32 or w['text'][-1:] in '.?!,' or gap > 0.5:
            cues.append(cur); cur = []
    if cur:
        cues.append(cur)
    with open(os.path.join(a.out, 'captions.srt'), 'w') as f:
        for n, c in enumerate(cues, 1):
            f.write(f"{n}\n{srt_time(c[0]['start'])} --> {srt_time(c[-1]['end'])}\n{' '.join(x['text'] for x in c)}\n\n")
    print(f'words: {len(words)} on the new timeline -> words.json, captions.srt')
    dropped = [tuple(d) for d in drops]
    kept = {w['i'] for w in words}
    lost = [w for w in json.load(open(a.words)) if w['i'] not in kept and
            not any(d0 - 0.05 <= w['start'] and w['end'] <= d1 + 0.05 for d0, d1 in dropped)]
    if lost:
        print(f"WARNING: {len(lost)} spoken word(s) did not make it into the cut: " +
              ' '.join(f"{w['text']}#{w['i']}" for w in lost[:20]) +
              ". Listen there. If they are missing from the sound too, run again with --noise -45 or --min-silence 0.6.")
