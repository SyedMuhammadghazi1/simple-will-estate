#!/usr/bin/env python3
"""Audio step: split the sound into three stems and mix them. Run after the picture render.

usage: stems.py <project> [--until SECONDS] [--set epidemic|free] [--music <epidemic id>|none] [--no-mux]

Writes deliver/audio/voice.wav, sfx.wav, music.wav (32-bit float, mastered gain, no limiter: they sum to the mix),
deliver/audio/mix.wav (24-bit, limited to -1 dBTP), deliver/final.mp4 (work/renders/final.mp4 + the mix),
deliver/audio/audio.json (levels measured, every placement) and deliver/licences.json (every file used, with id and licence).

1. VOICE  edit.json audio.voice: the Auphonic-cleaned voice aligned to the cut (voice.py makes it). Short mode applies
          work/trim.json to it when audio.voice_is_pretrim is true (the same frames the picture lost, 4 ms fades at joins).
2. SFX    from the graphics event log (work/events.json): roles_map.json picks a role per event, then priority, a
          0.22 s minimum gap, a per-role gap (a whoosh on about 1 cut in 3) and a cap of 5 audible per 10 s choose them.
          One file set for the whole video (Epidemic when present, else the free set): one consistent kit.
          Level: target_db_vs_voice per role (SOUND.md: median -11.7 dB, biggest hits -5 dB). A whoosh peaks on its cut;
          every other sound starts on its event.
3. MUSIC  one bed from the kit (edit.json audio.music, or the kit default for the mode), 14 dB under the voice while he
          talks, +4 dB in gaps of 0.4 s or more, starts at 0 s, fades over the last 0.8 s.
4. MIX    sum, gain to -14 LUFS, limit at -1 dBTP; measure the result.
Method and numbers from ~/code/sound-research (SOUND.md, scripts/sfx_mix.py), 21 Oct 2026.
"""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import dsp
dsp.ensure_venv()
import numpy as np
import scipy.ndimage as nd
import jy, kit as K_

SR = dsp.SR


def voice_track(E, T):
    A = E.get('audio', {}); src = A.get('voice') or 'work/cut_audio.wav'
    src = os.path.expanduser(src) if src.startswith('~') or src.startswith('/') else jy.P(E, src)
    x = dsp.load(src)
    if A.get('voice_is_pretrim') and os.path.exists(jy.P(E, 'work', 'trim.json')):
        TR = json.load(open(jy.P(E, 'work', 'trim.json'))); FPF = SR // E.get('fps', 30)
        keep, pos = [], 0
        for c in TR['cuts']:
            s0, s1 = c['frames'][0] * FPF, c['frames'][1] * FPF; keep.append(x[pos:s0]); pos = s1
        keep.append(x[pos:])
        F = int(0.004 * SR); ramp = np.linspace(0, 1, F)[:, None]
        for k in range(len(keep)):
            if k > 0: keep[k][:F] *= ramp
            if k < len(keep) - 1: keep[k][-F:] *= ramp[::-1]
        x = np.concatenate(keep)
    off = A.get('voice_offset_s', 0.0)
    if off: x = x[int(off * SR):] if off > 0 else np.concatenate([np.zeros((int(-off * SR), 2)), x])
    n = int(round(T * SR))
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), 2))])
    return x, src


def events(E, T):
    p = jy.P(E, 'work', 'events.json')
    if not os.path.exists(p): return []
    ev = json.load(open(p)); out = []
    for e in ev:
        if isinstance(e, list): t, name = float(e[0]), str(e[1])
        else: t, name = float(e['time']), f"{e['kind']}: {e['label']}"
        if t < T - 0.1: out.append((t, name))
    return out


def main(a):
    project = a[0]; opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    E = jy.load_edit(project); mode = E['mode']; A = E.get('audio', {})
    Kt = K_.load(); MIX = dict(Kt['mix']); MIX.update(A.get('mix', {}))
    fps = E.get('fps', 30)
    if mode == 'short':
        TR = json.load(open(jy.P(E, 'work', 'trim.json'))) if os.path.exists(jy.P(E, 'work', 'trim.json')) else {}
        T = TR.get('duration') or json.load(open(jy.P(E, 'work', 'design.json')))['T']
    else:
        T = E['frames'] / fps
    until = float(opt('--until')) if opt('--until') else None
    if until: T = min(T, until)
    out = jy.P(E, 'deliver', 'audio'); os.makedirs(out, exist_ok=True)
    voice, vsrc = voice_track(E, T); n = len(voice)
    vint = dsp.integrated(voice); V = dsp.mom(voice)

    # ---- SFX: events -> roles -> choose
    RM = json.load(open(os.path.join(HERE, 'roles_map.json'))); rules = [(re.compile(p), r) for p, r in RM[mode]]
    PRI, GAP, GROUPED = RM['priority'], RM['role_gap_s'], set(RM['grouped'])
    st = opt('--set') or A.get('sfx_set') or ('epidemic' if all(os.path.exists(K_.kpath(f['file'])) for R in Kt['roles'].values() for f in R['sets'].get('epidemic', [])) else 'free')
    roles = {r: R for r, R in Kt['roles'].items() if R['sets'].get(st)}
    def role_of(name):
        for p, r in rules:
            if p.search(name): return r
        return None
    cands = []
    for t, name in events(E, T):
        r = role_of(name)
        if r and r in roles: cands.append(dict(t=t, name=name, role=r, pri=PRI.get(r, 1)))
    cands.sort(key=lambda c: (-c['pri'], c['t']))
    quiet = {r for r, R in roles.items() if R['target_db_vs_voice'] <= -20}    # under the audibility floor: not counted in the cap
    counted = lambda x: not x.get('group_member') and x['role'] not in quiet
    cap10, min_gap = MIX.get('sfx_cap_per_10s', 5), MIX.get('sfx_min_gap_s', 0.22)
    chosen = []
    for c in cands:
        near = [x for x in chosen if abs(x['t'] - c['t']) < min_gap]
        if c['role'] in GROUPED and any(x['role'] == c['role'] for x in near): c['group_member'] = True; chosen.append(c); continue
        if any(counted(x) for x in near) or (c['role'] not in quiet and near): continue
        if any(x['role'] == c['role'] and abs(x['t'] - c['t']) < GAP.get(c['role'], 1.0) for x in chosen): continue
        if c['role'] not in quiet:
            ts = sorted([x['t'] for x in chosen if counted(x)] + [c['t']])
            if any(sum(1 for u in ts if w <= u < w + 10) > cap10 for w in [u - 10 + 1e-6 for u in ts if abs(u - c['t']) < 10] + [c['t']]): continue
        chosen.append(c)
    chosen.sort(key=lambda c: c['t'])
    sfx = np.zeros((n, 2)); rng = np.random.default_rng(3); use = {}
    files = {r: [dsp.load(K_.kpath(f['file'])) for f in R['sets'][st]] for r, R in roles.items() if any(c['role'] == r for c in chosen)}
    used_files = {}
    for i, c in enumerate(chosen):
        r = c['role']; R = roles[r]; k = use.get(r, 0); use[r] = k + 1
        g = 10 ** ((R['target_db_vs_voice'] + vint - Kt['ref_event_lufs']) / 20)
        c['gain_db'] = round(20 * np.log10(g), 1); c['db_vs_voice'] = R['target_db_vs_voice']
        if r == 'typing':   # a burst of keystrokes until the next sound (0.2 to 0.9 s), 65 to 120 ms apart
            nxt = [x['t'] for x in chosen[i + 1:] if x['role'] != 'typing']
            L = float(np.clip((nxt[0] if nxt else c['t'] + 0.6) - c['t'] - 0.05, 0.2, 0.9)); tt = c['t']; parts = files[r]
            while tt < c['t'] + L:
                j = int(rng.integers(len(parts))); x = parts[j] * g * 10 ** (rng.uniform(-3, 0) / 20)
                s = int(tt * SR); e = min(n, s + len(x));
                if s < n: sfx[s:e] += x[:e - s]
                used_files[R['sets'][st][j]['file']] = (r, R['sets'][st][j]); tt += rng.uniform(0.065, 0.12)
            c['placed_at'] = round(c['t'], 3); c['len'] = round(L, 2); continue
        j = k % len(files[r]); x = files[r][j] * g; f = R['sets'][st][j]
        start = c['t'] - (int(np.argmax(np.abs(x).max(1))) / SR if R.get('align') == 'peak' else 0) + (R.get('offset_s') or 0)
        s = int(max(0, start) * SR); e = min(n, s + len(x))
        if s < n: sfx[s:e] += x[:e - s]
        c['placed_at'] = round(max(0, start), 3); c['file'] = f['file']; c['id'] = f.get('id'); used_files[f['file']] = (r, f)

    # ---- MUSIC: one bed, levelled under the voice, ducked up in gaps, fades
    mid = opt('--music') or A.get('music') or Kt.get('default_music', {}).get(mode)
    music = np.zeros((n, 2)); bed_meta = None; gain_db = None
    if mid and mid != 'none':
        bed_meta = next((m for m in Kt['music'] if m.get('id') == mid or m['file'] == mid or (m.get('id') or '').startswith(mid)), None)
        if bed_meta is None or not os.path.exists(K_.kpath(bed_meta['file'])):
            bed_meta = next((m for m in Kt['music'] if m.get('id') is None and os.path.exists(K_.kpath(m['file']))), None)   # free bed fallback
    if bed_meta:
        bed = dsp.load(K_.kpath(bed_meta['file'])); s0 = int(A.get('music_start_s', 0.0) * SR); bed = bed[s0:]
        bed = np.tile(bed, (int(np.ceil(n / len(bed))), 1))[:n]
        active = V > vint - 15; B = dsp.mom(bed); m_ = min(len(V), len(B))
        gain_db = (np.median(V[:m_][active[:m_]]) - MIX['bed_under_voice_db']) - np.median(B[:m_][active[:m_]])
        duck = MIX.get('bed_duck_db', 4)
        gapf = ~nd.binary_closing(active, structure=np.ones(40))          # gaps of 0.4 s or more
        tgt = np.where(gapf, duck, 0.0); envd = np.zeros_like(tgt); cur = 0.0
        for i, tv in enumerate(tgt):
            step = 0.01 / (0.4 if tv > cur else 0.15)
            cur = cur + np.clip(tv - cur, -abs(duck) * step, abs(duck) * step) if duck else 0.0; envd[i] = cur
        lead = 15; envd = np.minimum(envd, np.concatenate([envd[lead:], np.full(lead, envd[-1])]))   # dip in place before he talks
        env = np.interp(np.arange(n) / SR, np.arange(len(envd)) * 0.01, envd)
        fi = np.minimum(1, np.arange(n) / (0.03 * SR)); fo = np.minimum(1, (n - np.arange(n)) / (MIX.get('bed_fade_out_s', 0.8) * SR))
        music = bed * (10 ** ((gain_db + env) / 20) * fi * fo)[:, None]

    # ---- MIX: master gain to target, write stems, limit the mix
    mix = voice + sfx + music
    g = MIX['master_lufs'] - dsp.integrated(mix); k = 10 ** (g / 20)
    for name, sig in (('voice', voice), ('sfx', sfx), ('music', music)):
        dsp.write(os.path.join(out, f'{name}.wav'), sig * k, subtype='FLOAT')
    dsp.write(os.path.join(out, '_mix_prelimit.wav'), mix * k, subtype='FLOAT')
    lim = 10 ** (MIX.get('true_peak_max_db', -1.0) / 20) * 0.93          # alimiter is sample-peak: leave room for inter-sample peaks
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, '_mix_prelimit.wav'), '-af',
                    f'alimiter=limit={lim:.3f}:attack=2:release=60:level=disabled:latency=1,aresample=48000', '-c:a', 'pcm_s24le', os.path.join(out, 'mix.wav')], check=True)
    os.remove(os.path.join(out, '_mix_prelimit.wav'))
    I, TP = jy.loudness(os.path.join(out, 'mix.wav'))
    if not a.count('--no-mux') and os.path.exists(jy.P(E, 'work', 'renders', 'final.mp4')):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', jy.P(E, 'work', 'renders', 'final.mp4'), '-i', os.path.join(out, 'mix.wav'), '-map', '0:v:0', '-map', '1:a:0',
                        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-movflags', '+faststart', '-shortest', jy.P(E, 'deliver', 'final.mp4')], check=True)

    # ---- measure and log
    aud = [c for c in chosen if counted(c)]
    cuts = [t for t, nm in events(E, T) if re.search(r'^layout -> |^(FOOT|BROLL): |^Graphic: cut', nm)]
    cut_hits = sum(1 for t in cuts if any(abs(c['t'] - t) < 0.1 for c in chosen))
    bm = dsp.mom(music * k) if bed_meta else None; vm = dsp.mom(voice * k)
    act = vm > np.median(vm[vm > -70]) - 10 if (vm > -70).any() else vm > -70
    rep = dict(voice_source=jy.tilde(vsrc), sfx_set=st, seconds=round(T, 3), master_lufs_target=MIX['master_lufs'], mix_lufs=I, mix_true_peak_dbtp=TP,
               voice_lufs=round(dsp.integrated(voice * k), 1), master_gain_db=round(g, 2),
               bed=None if not bed_meta else dict(title=bed_meta.get('title'), id=bed_meta.get('id'), gain_db=round(float(gain_db), 1),
                    under_voice_db_measured=round(float(np.median(vm[act]) - np.median(bm[:len(vm)][act])), 1), target_under_db=MIX['bed_under_voice_db']),
               sfx_placed=len(chosen), sfx_audible=len(aud), sfx_audible_per_10s=round(len(aud) / T * 10, 2), cap_per_10s=cap10,
               cuts=len(cuts), cuts_with_sound=cut_hits, sfx_db_vs_voice_median=float(np.median([c['db_vs_voice'] for c in aud])) if aud else None,
               targets_from='~/code/sound-research/SOUND.md (21 Oct 2026) via audio/kit.json',
               placements=[{k2: c[k2] for k2 in ('t', 'name', 'role', 'placed_at', 'gain_db', 'db_vs_voice', 'file', 'id', 'len') if k2 in c} for c in chosen])
    json.dump(rep, open(os.path.join(out, 'audio.json'), 'w'), indent=1)
    lic = [dict(kind='voice', file=jy.tilde(vsrc), source='Jack Roberts (own recording), cleaned with Auphonic', licence='own')]
    for f, (r, meta) in sorted(used_files.items()):
        lic.append(dict(kind='sfx', role=r, file=jy.tilde(K_.kpath(f)), id=meta.get('id'), title=meta.get('title'), source=meta.get('source'), licence=meta.get('licence')))
    if bed_meta:
        lic.append(dict(kind='music', file=jy.tilde(K_.kpath(bed_meta['file'])), id=bed_meta.get('id'), title=bed_meta.get('title'),
                        artists=bed_meta.get('artists'), source=bed_meta.get('source'), licence=bed_meta.get('licence')))
    json.dump(lic, open(jy.P(E, 'deliver', 'licences.json'), 'w'), indent=1, ensure_ascii=False)
    print(f"audio: mix {I} LUFS, {TP} dBTP | bed {rep['bed']['under_voice_db_measured'] if bed_meta else '-'} dB under voice | "
          f"SFX {len(chosen)} placed, {len(aud)} audible = {rep['sfx_audible_per_10s']} per 10 s, {cut_hits}/{len(cuts)} cuts with a sound | set {st}")


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a)
