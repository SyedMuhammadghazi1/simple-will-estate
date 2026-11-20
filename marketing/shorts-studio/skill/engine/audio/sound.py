#!/usr/bin/env python3
"""sound.py: the Short's sound, in three stems, then the mix on the picture (R35). v2, 26 Oct 2026.

usage: sound.py <project> [--music bed.wav] [--kit ~/.shorts-studio/kit/sfx]

Why v2: Jack on r5, "The sound effects are way out of line and crazy... the sound effects sound really fucking bad."
The SFX stem was -11.4 LUFS against a -16.9 LUFS voice (louder than him). v1 set each level from the first 100 ms of the
file, which is often the quiet attack, so the gain ran away. v2 copies the method of his approved Short (tyler r11):

- voice: work/cut_audio.wav with the frames trim.py removed (so it stays on the picture to the frame).
- sfx  : a HAND-PLACED cue sheet. Scenes call sfx(t, role, why); each one is written to work/events.json as "sfx:<role> <why>".
         Only those play (plus a whoosh on some layout switches, see below). Nothing plays just because something moved.
         Level = target dB vs the voice's integrated loudness, measured as EVENT loudness (the loudest 100 ms, K-weighted),
         so a placement means the same thing for every file. Targets (r11): most -12 dB, big hits -8 to -9 dB, clicks and
         keys -16 to -20 dB. At most 8 in any 10 s and 6 per 10 s on average, as r11 (lowest priority dropped first), never 2 within 0.2 s, never the
         same file twice in a row (pitched twins alternate).
- whoosh on every cut into a full graphic, unless a cue sits within 0.3 s (26 Oct, test-7: too bare).
- music: optional bed from 0 s, 13.5 dB under the voice, +4 dB in gaps, 0.8 s fade at the end. Licensed music only.
Writes deliver/audio/voice.wav, sfx.wav, music.wav, mix.wav, cues.json and deliver/final.mp4 (-14 LUFS, true peak <= -1 dBTP).
Prints a level report: the SFX stem at least 12 dB under the voice, the median cue -10 to -14 dB, at most 8 in any 10 s.
If it fails, fix the cues, not the master.
"""
import json, os, re, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

SR = 48000
# role -> (files, dB vs the voice's integrated loudness, priority: 1 = keep first). Event loudness of the kit files is -20 LUFS.
ROLE = {
    'end':    (['end'], -6, 1), 'stomp': (['stomp', 'stomp_lo'], -7, 1), 'reveal': (['reveal'], -9, 1),
    'land':   (['land_drop', 'land_drop_lo'], -11, 2), 'pop': (['pop', 'pop_hi'], -11, 2), 'pops': (['pop', 'pop_hi'], -13, 3),
    'done':   (['done', 'done_lo'], -10, 2), 'grow': (['grow', 'grow_lo'], -13, 3), 'swell': (['swell'], -14, 3),
    'whoosh': (['whoosh', 'whoosh_lo'], -12, 3), 'scrunch': (['whoosh_lo', 'whoosh'], -14, 3),
    'click':  (['click_send'], -16, 4), 'cclick': (['cclick'], -15, 3),
    'swoosh': (['swoosh'], -13, 2), 'riser': (['riser'], -16, 3), 'impact': (['impact', 'impact_b'], -9, 1),
    'notify': (['notify'], -13, 2), 'ping': (['ping'], -13, 3), 'sparkle': (['sparkle'], -14, 3), 'chime': (['chime'], -11, 1), 'type': (['key_1', 'key_2', 'key_3', 'key_4', 'key_p'], -17, 2), 'print': (['key_1', 'key_2', 'key_3', 'key_4'], -21, 4),
}
MAX10 = 8   # r11 (approved): 5.2 audible per 10 s on average, up to 10 in a busy 10 s; v2's cap of 5 left it too bare (test-7)
PEAK_ON = {'riser', 'swoosh', 'whoosh'}   # these build up: their loudest moment lands on the event, not their start
RUNS = {'type': (0.38, 0.065), 'print': (0.8, 0.09)}   # roles that are a run of keystrokes: (length s, step s)


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def save(path, a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=a.astype(np.float32).tobytes(), check=True)


def biquad(x, b, a):
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
    return y


def kweight(x):   # ITU-R BS.1770 K-weighting at 48 kHz (shelf, then high-pass), mono sum of power
    sh = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
    hp = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])
    return [biquad(biquad(x[:, c].astype(np.float64), *sh), *hp) for c in range(x.shape[1])]


def ev_loud(x):
    """event loudness: the loudest 100 ms K-weighted window, in LUFS (how loud a sound effect reads)."""
    z = sum(c ** 2 for c in kweight(x)); w = int(0.1 * SR)
    if len(z) < w: z = np.pad(z, (0, w - len(z)))
    c = np.concatenate([[0], np.cumsum(z)]); ms = (c[w:] - c[:-w]) / w
    return -0.691 + 10 * np.log10(ms.max() + 1e-12)


def lufs(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+|-inf)', s).group(1)) if 'I:' in s else -70
    return I


def main(project, music=None, kit=None):
    E = jy.load_edit(project); WD = jy.P(E, 'work'); OUT = jy.P(E, 'deliver', 'audio'); os.makedirs(OUT, exist_ok=True)
    kit = os.path.expanduser(kit or os.path.join(jy.KIT, 'sfx'))
    fps = E.get('fps', 30); TR = json.load(open(os.path.join(WD, 'trim.json')))
    v = load(os.path.join(WD, 'cut_audio.wav'))
    keep = np.ones(len(v), bool)
    for c in TR['cuts']:
        keep[int(c['frames'][0] / fps * SR):int(c['frames'][1] / fps * SR)] = False
    v = v[keep]; T = TR['duration']; n = int(T * SR); v = np.pad(v, ((0, max(0, n - len(v))), (0, 0)))[:n]
    save(os.path.join(OUT, 'voice.wav'), v); VI = lufs(os.path.join(OUT, 'voice.wav'))
    files = {f[:-4]: os.path.join(kit, f) for f in os.listdir(kit) if f.endswith('.wav')}
    cache = {}
    def snd(k):
        if k not in cache: s = load(files[k]); cache[k] = (s, ev_loud(s))
        return cache[k]
    # 1. the hand-placed cues
    ev = sorted(json.load(open(os.path.join(WD, 'events.json'))), key=lambda e: e[0])
    want = []
    for t, name in ev:
        m = re.match(r'sfx:(\w+)\s*(.*)', name)
        if m and m.group(1) in ROLE and 0 <= t < T - 0.05: want.append(dict(t=t, role=m.group(1), why=m.group(2) or m.group(1)))
    # 2. a whoosh on about 1 layout switch in 3, where nothing else plays within 0.4 s
    # 26 Oct, Jack on test-7: "we do need some kind of good sound effects ... it would really elevate the quality": a whoosh on
    # every cut INTO a full graphic (the r11 look), unless another cue already sits within 0.3 s
    # 28 Oct (creator: "the transition is getting very repetitive"): when the scenes mark their transitions (trans:<kind>), the sound
    # follows the move: grow -> whoosh, wipe -> swoosh, cut -> nothing (a clean cut is crisper bare). Older projects keep the rule above.
    tr = [(t, name) for t, name in ev if name.startswith('trans:')]
    if tr:
        for t, name in tr:
            kind = name.split()[0][6:]; role = {'grow': 'whoosh', 'wipe': 'swoosh', 'wipeR': 'swoosh'}.get(kind)
            if role and 'to full' in name and not any(abs(t - w['t']) < 0.3 for w in want): want.append(dict(t=t - 0.08, role=role, why=f'{kind} to a full graphic'))
    else:
        sw = [(t, name) for t, name in ev if name.startswith('layout -> anim') and t > 0.3]
        for t, name in sw:
            if not any(abs(t - w['t']) < 0.3 for w in want): want.append(dict(t=t - 0.08, role='whoosh', why='cut to a full graphic'))
    want.sort(key=lambda w: w['t'])
    # 3. density: at most MAX10 in any 10 s, never 2 within 0.2 s (drop the lower priority one)
    keep_ = []
    for w in sorted(want, key=lambda w: (ROLE[w['role']][2], w['t'])):
        if any(abs(w['t'] - k['t']) < 0.2 for k in keep_): continue
        if any(sum(1 for k in keep_ if s0 <= k['t'] < s0 + 10) >= MAX10 for s0 in np.arange(w['t'] - 10, w['t'] + 0.001, 0.05)): continue
        keep_.append(w)
    keep_.sort(key=lambda w: w['t'])
    # average density: at most 6 per 10 s (r11: 5.2); drop the lowest priority, latest-placed first
    cap = int(6 * T / 10)
    while len(keep_) > cap:
        dens = lambda w: sum(1 for k in keep_ if abs(k['t'] - w['t']) < 4)   # drop from the busiest stretch, so the sound stays even
        worst = max(keep_, key=lambda w: (dens(w) >= 4, ROLE[w['role']][2], dens(w), w['role'] == 'whoosh')); keep_.remove(worst)
    sfx = np.zeros_like(v); cues = []; last = None
    for w in keep_:
        names, db, _ = ROLE[w['role']]
        cands = [k for k in names if k in files]
        if not cands: print('missing kit file for', w['role']); continue
        hits = [w['t']]
        if w['role'] in RUNS:
            L, st = RUNS[w['role']]; m_ = re.search(r'len=([\d.]+)', w['why']); L = float(m_.group(1)) if m_ else L   # a keystroke per typed letter
            m_ = re.search(r'n=(\d+)', w['why']); st = L / max(1, int(m_.group(1))) if m_ else st
            hits = list(np.arange(w['t'], w['t'] + L - 1e-6, st))
        for j, t in enumerate(hits):
            pick = cands[j % len(cands)] if len(hits) > 1 else next((k for k in cands if k != last), cands[0])
            s, el = snd(pick)
            if w['role'] in PEAK_ON: t = max(0.0, t - float(np.argmax(np.abs(s).max(1))) / SR)
            g = 10 ** ((VI + db - el) / 20) * (0.8 + 0.2 * ((j * 7) % 3) / 2 if len(hits) > 1 else 1)
            i0 = int(t * SR); i1 = min(n, i0 + len(s))
            if i0 < n: sfx[i0:i1] += s[:i1 - i0] * g
        last = cands[0] if len(hits) > 1 else pick
        cues.append(dict(t=round(w['t'], 3), role=w['role'], why=w['why'], file=last, db_vs_voice=db))
    # music bed (optional)
    mus = np.zeros_like(v)
    if music:
        m = load(os.path.expanduser(music)); m = np.tile(m, (n // len(m) + 1, 1))[:n]
        save(os.path.join(OUT, '_m.wav'), m); MI = lufs(os.path.join(OUT, '_m.wav')); os.remove(os.path.join(OUT, '_m.wav'))
        g = 10 ** ((VI - 13.5 - MI) / 20); env = np.abs(v).max(1)
        talk = np.convolve((env > 0.03).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same')
        lift = 10 ** (4 * (1 - np.clip(talk, 0, 1)) / 20); fade = np.clip((T - np.arange(n) / SR) / 0.8, 0, 1)
        mus = m * (g * lift * fade)[:, None]
        save(os.path.join(OUT, '_m.wav'), mus); got = lufs(os.path.join(OUT, '_m.wav')); os.remove(os.path.join(OUT, '_m.wav'))
        mus = mus * 10 ** ((VI - 13.5 - got) / 20)   # measure the finished bed (the gap lift raises it) and set it to 13.5 dB under, as r11
    for nm, a in (('sfx', sfx), ('music', mus)): save(os.path.join(OUT, nm + '.wav'), a)
    save(os.path.join(OUT, 'mix_raw.wav'), v + sfx + mus)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'mix_raw.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89:level=disabled', '-ar', str(SR),
                    os.path.join(OUT, 'mix.wav')], check=True)
    os.remove(os.path.join(OUT, 'mix_raw.wav'))
    SI = lufs(os.path.join(OUT, 'sfx.wav'))
    per10 = max((sum(1 for c in cues if a <= c['t'] < a + 10) for a in np.arange(0, max(T - 10, 0.01), 0.5)), default=0)
    rep = dict(voice_lufs=round(VI, 1), sfx_stem_lufs=round(SI, 1), sfx_under_voice_db=round(VI - SI, 1), cues=len(cues), max_per_10s=per10,
               targets='SFX stem 12 to 19 dB under the voice (r11: 14 dB; high-baseline creators use few effects, baseline study BL15); median cue -10 to -14 dB; <= 8 in any 10 s, <= 6 per 10 s on average')
    json.dump(dict(report=rep, cues=cues, music=music), open(os.path.join(OUT, 'cues.json'), 'w'), indent=1)
    pic = os.path.join(WD, 'renders', 'final.mp4'); final = jy.P(E, 'deliver', 'final.mp4')
    if os.path.exists(pic):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', pic, '-i', os.path.join(OUT, 'mix.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final], check=True)
        I, P_ = jy.loudness(final); print(f'final: {final}  {I:.1f} LUFS, peak {P_:.1f} dBTP')
        # R42: the picture of him must be from the same moment as the voice (26 Oct: stale camera file, lips 1.37 s off)
        lc = os.path.join(HERE, '..', '..', 'scripts', 'lipsync_check.py')
        r = subprocess.run([jy.VENV_CV if os.path.exists(jy.VENV_CV) else sys.executable, lc, project, '--json', jy.P(E, 'deliver', 'lipsync.json')], capture_output=True, text=True)
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
    med = float(np.median([c['db_vs_voice'] for c in cues])) if cues else 0; rep['median_cue_db_vs_voice'] = med
    ok = 12 <= rep['sfx_under_voice_db'] <= 19 and -14 <= med <= -10 and per10 <= MAX10 and len(cues) / max(T, 1) * 10 <= 6
    print(f"{len(cues)} sound effects | voice {rep['voice_lufs']} LUFS, SFX stem {rep['sfx_stem_lufs']} LUFS = {rep['sfx_under_voice_db']} dB under "
          f"| median cue {med:.0f} dB vs voice | max {per10} per 10 s | {'LEVELS OK' if ok else 'LEVELS OFF: fix the cues'} | music: {'yes' if music else 'none (add --music <file you own>)'}")


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    main(a[0], opt('--music'), opt('--kit'))
