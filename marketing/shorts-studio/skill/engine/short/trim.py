#!/usr/bin/env python3
"""Short mode: dead-air trim. Removes every silent "just looking at camera" pause between two words.

usage: trim.py <project> [--no-video]

A pause = audio below threshold_db (20 ms windows, speech sits near -12 dB) between two words, longer than min_pause_s.
Each trim keeps keep_tail_s after the word's tail and keep_lead_s before the next word, rounded inward to whole frames,
so the pause left is at most about 0.14 s. Defaults: -30 dB, 0.04 s, 0.05 s, 0.15 s (edit.json "trim" overrides them).
Jack's verdict behind it (tyler-short r6, R17): "there's a frame that appears where I'm just looking at the camera".

Inputs in work/: words_pre.json (word times on the untrimmed cut), cut_audio.wav (voice on the untrimmed cut),
                 edl.json (optional: maps the cut back to the source mic and camera), bases_pre/base-full.mp4, bases_pre/base-split.mp4
Writes in work/: trim.json (cut times on the untrimmed timeline, frames, source times), words_final.json (trimmed timeline),
                 base-full.mp4 and base-split.mp4 (same frames dropped, video only; audio is the separate last step).
Every trim must land on a layout switch or under b-roll (gen.py snap() moves switches onto trims), so no jump shows on his face.

Round 9 method (the default since 21 Oct; edit.json "trim" picks):
  method "waveform"      pauses found on the waveform anywhere between the first and the last word (whisper word ends can be
                         0.4 s late); round 7/8 used "between_words" (only between two whisper words)
  detect_on "enhanced"   find pauses on the voice we ship (work/cut_audio_enhanced.wav) when it exists; "raw" = cut_audio.wav
  only_at_switches true  trim only where a layout switch (edit.json layout starts) sits within 0.12 s of the pause, so no cut is naked,
                         OR where the pause sits wholly under a full graphic or b-roll (his face is hidden, 26 Oct)
  word_fixes {"11": {"e": 3.52}}  hand corrections of whisper times, applied before anything else
  cuts [[a, b]]          explicit cuts on the untrimmed timeline (a murmur the level detector misses); put a switch on each
Generalised from tyler-short-r8/work/trim.py (round 7) and tyler-short-r9/work/trim.py (round 9).
"""
import json, math, os, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

def main(project, video=True):
    E = jy.load_edit(project); WD = jy.P(E, 'work') + '/'; os.chdir(WD)
    FPS, SR = E.get('fps', 30), 48000
    o = dict(threshold_db=-30.0, keep_tail_s=0.04, keep_lead_s=0.05, min_pause_s=0.15, method='waveform', detect_on='enhanced',
             only_at_switches=True, word_fixes={}); o.update(E.get('trim', {}))
    TH, KEEP_TAIL, KEEP_LEAD, MIN = o['threshold_db'], o['keep_tail_s'], o['keep_lead_s'], o['min_pause_s']
    W = json.load(open('words_pre.json'))
    for i, f in o['word_fixes'].items(): W[int(i)] = dict(W[int(i)], **f)
    EDL = json.load(open('edl.json')) if os.path.exists('edl.json') else None
    DETECT = 'cut_audio_enhanced.wav' if o['detect_on'] == 'enhanced' and os.path.exists('cut_audio_enhanced.wav') else 'cut_audio.wav'
    BOUNDS = sorted({a for a, b, ty, sc in E.get('layout', []) if a > 0}) if E.get('timeline') == 'pretrim' else []
    HIDDEN = [(a_, b_) for a_, b_, ty, sc in E.get('layout', []) if ty in ('anim', 'broll')] if E.get('timeline') == 'pretrim' else []
    def hidden(r):   # 26 Oct (Jack: "a weird pause at 30-ish seconds"): a pause wholly under a full graphic can go anywhere, no jump shows
        return any(a_ + 0.05 <= r[0] and r[1] <= b_ - 0.05 for a_, b_ in HIDDEN)
    if o['only_at_switches'] and not BOUNDS: print('only_at_switches needs edit.json layout on the untrimmed timeline ("timeline": "pretrim"): trimming every pause')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', DETECT, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
    a = np.frombuffer(raw, np.float32)
    T_pre = E.get('duration_pre') or round(round(len(a) / SR * FPS) / FPS, 4)

    def db(t, win=0.02):
        x = a[int(t * SR):int((t + win) * SR)]; return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)

    def src(t):
        if not EDL: return None
        s = next(s for s in EDL['segments'] if s['out_start'] - 1e-6 <= t <= s['out_end'] + 1e-6)
        return dict(segment=s['id'], mic=round(s['scr_in'] + t - s['out_start'], 3), cam=round(s['cam_in'] + t - s['out_start'], 3))

    def pieces(t0, t1):   # removed source spans, split where the cut crosses an EDL join
        out = []
        for s in (EDL or {}).get('segments', []):
            a0, a1 = max(t0, s['out_start']), min(t1, s['out_end'])
            if a1 - a0 > 1e-6:
                out.append(dict(segment=s['id'], mic=[round(s['scr_in'] + a0 - s['out_start'], 3), round(s['scr_in'] + a1 - s['out_start'], 3)],
                                cam=[round(s['cam_in'] + a0 - s['out_start'], 3), round(s['cam_in'] + a1 - s['out_start'], 3)]))
        return out

    cuts = []
    def add(run, after, before):
        f0, f1 = math.ceil((run[0] + KEEP_TAIL) * FPS), math.floor((run[1] - KEEP_LEAD) * FPS)
        if f1 <= f0: return
        cin, cout = f0 / FPS, f1 / FPS
        cuts.append(dict(after=after, before=before, pause=[round(run[0], 3), round(run[1], 3)], frames=[f0, f1],
                         cut_in=round(cin, 4), cut_out=round(cout, 4), dur=round(cout - cin, 4), pause_left=round((run[1] - run[0]) - (cout - cin), 3),
                         source_in=src(cin), source_out=src(cout), source_pieces=pieces(cin, cout)))
    if o['method'] == 'between_words':        # round 7/8: the longest silent run between each pair of whisper words
        for i in range(len(W) - 1):
            ts = np.arange(W[i]['e'] - 0.06, W[i + 1]['s'] + 0.03, 0.01); sil = [db(t) < TH for t in ts]
            best, k = None, 0
            while k < len(ts):
                if sil[k]:
                    j = k
                    while j < len(ts) and sil[j]: j += 1
                    run = (ts[k], ts[j - 1] + 0.02)
                    if best is None or run[1] - run[0] > best[1] - best[0]: best = run
                    k = j
                else: k += 1
            if not best or best[1] - best[0] <= MIN: continue
            if o['only_at_switches'] and BOUNDS and not hidden(best) and not any(best[0] - 0.12 <= bd <= best[1] + 0.12 for bd in BOUNDS): continue
            add(best, W[i]['w'], W[i + 1]['w'])
    else:                                       # round 9: every silent run on the waveform between the first and the last word
        ts = np.arange(W[0]['s'], W[-1]['e'], 0.01); sil = [db(t) < TH for t in ts]; k = 0
        while k < len(ts):
            if not sil[k]: k += 1; continue
            j = k
            while j < len(ts) and sil[j]: j += 1
            run = (float(ts[k]), float(ts[j - 1]) + 0.02); k = j
            if run[1] - run[0] <= MIN: continue
            if o['only_at_switches'] and BOUNDS and not hidden(run) and not any(run[0] - 0.12 <= bd <= run[1] + 0.12 for bd in BOUNDS): continue
            before = [w for w in W if w['s'] <= run[0] + 0.02]; after = [w for w in W if w['s'] >= run[0]]
            add(run, before[-1]['w'] if before else '', after[0]['w'] if after else '')
    for r0, r1 in o.get('cuts', []):   # explicit cuts (a murmur, a breath): place a layout switch on each, or keep it under a graphic
        cuts[:] = [c for c in cuts if c['pause'][1] < r0 or c['pause'][0] > r1]   # the explicit cut replaces any detected one it overlaps
        before = [w for w in W if w['s'] <= r0]; after = [w for w in W if w['s'] >= r1 - 0.05]
        add((float(r0), float(r1)), before[-1]['w'] if before else '', after[0]['w'] if after else ''); cuts[-1]['explicit'] = True
    cuts.sort(key=lambda c: c['frames'][0])
    removed = sum(c['frames'][1] - c['frames'][0] for c in cuts)
    T = round((round(T_pre * FPS) - removed) / FPS, 4)

    def shift(t):
        d = 0.0
        for c in cuts:
            if t >= c['cut_out'] - 1e-9: d += c['dur']
            elif t > c['cut_in']: d += t - c['cut_in']
        return round(t - d, 4)

    json.dump(dict(detected_on=DETECT, method=o['method'], only_at_switches=o['only_at_switches'], note=('Silent pauses removed. cut_in/cut_out are on the untrimmed timeline (seconds); source_in/out are the mic and camera '
                         'times from edl.json. frames = [first removed, first kept].'),
                   fps=FPS, threshold_db=TH, keep_tail_s=KEEP_TAIL, keep_lead_s=KEEP_LEAD, min_pause_s=MIN,
                   duration_pre=T_pre, duration=T, removed_s=round(removed / FPS, 4), cuts=cuts), open('trim.json', 'w'), indent=1)
    json.dump([dict(w, s=shift(w['s']), e=shift(w['e'])) for w in W], open('words_final.json', 'w'), indent=1)
    if video and cuts:
        sel = '+'.join(f'between(n,{c["frames"][0]},{c["frames"][1] - 1})' for c in cuts)
        for f in ('base-full.mp4', 'base-split.mp4'):
            if not os.path.exists('bases_pre/' + f): continue
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'bases_pre/' + f, '-vf', f"select='not({sel})',setpts=N/({FPS}*TB)", '-an', '-c:v', 'libx264',
                            '-preset', 'slow', '-crf', '14', '-g', str(FPS), '-r', str(FPS), '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709',
                            '-color_trc', 'bt709', '-colorspace', 'bt709', f], check=True)
    print('cuts', len(cuts), 'removed', round(removed / FPS, 3), 's  new duration', T)
    for c in cuts: print(f"  {c['after']:>11s} -> {c['before']:<10s} {c['cut_in']:.4f}-{c['cut_out']:.4f} ({c['dur']:.3f} s) pause left {c['pause_left']} s")


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a[0], '--no-video' not in a)
