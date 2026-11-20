#!/usr/bin/env python3
"""The house sound kit: one consistent set of sound effects and music beds, reused on every video.

Two halves:
  audio/kit.json (in the skill, synced to both Macs)  the manifest: roles, levels, every file's Epidemic id, title, licence
  $JY_KIT (default ~/code/jack-youtube-examples/kit)  the media on this Mac: sfx/<set>/*.wav (normalised), music/*.wav,
                                                      cache/epidemic/<id>.mp3 (raw downloads), licences.jsonl
Never download the same Epidemic id twice: the REST key hit "quota exceeded" after 47 downloads (21 Oct). fetch and add
look in the cache first, and every download is logged with id, title, source and licence.

usage:
  kit.py status                       what the manifest lists and what is on this Mac
  kit.py import-research              seed the kit from ~/code/sound-research/kit (no downloads): Epidemic set + free set (Kenney CC0, Pixabay)
  kit.py fetch                        download only the Epidemic files missing on this Mac (new Mac), once each, by id
  kit.py add <role> <epidemic-id> [--title T]      add one Epidemic SFX to a role (download once, normalise, log)
  kit.py add-music <epidemic-id> [--title T --bpm N --tags a,b]
  kit.py search sfx|music "<term>"    search Epidemic (searches cost no download quota)

Levels (target_db_vs_voice per role) come from ~/code/sound-research/SOUND.md (21 Oct): SFX median -11.7 dB vs the voice
(middle half -14.9 to -8.4), biggest hits about -4 to -5 dB; bed 14 dB under the voice, +4 dB in gaps; master -14 LUFS.
"""
import json, os, shutil, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import epidemic as ep

KIT = os.path.expanduser(os.environ.get('JY_KIT', '~/code/jack-youtube-examples/kit'))
MANIFEST = os.path.join(HERE, 'kit.json')
SR_KIT = os.path.expanduser('~/code/sound-research/kit')
FREE_LIC = {'kenney_interface': 'CC0 1.0 (Kenney, kenney.nl)', 'kenney_ui': 'CC0 1.0 (Kenney, kenney.nl)', 'kenney_digital': 'CC0 1.0 (Kenney, kenney.nl)',
            'pixabay': 'Pixabay Content License (commercial use OK, no attribution; do not claim it in Content ID)'}


def load():
    return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else dict(ref_event_lufs=-20.0, roles={}, music=[], mix={})


def save(K):
    json.dump(K, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)


def kpath(rel):
    return os.path.join(KIT, rel)


def log(row):
    os.makedirs(KIT, exist_ok=True)
    with open(kpath('licences.jsonl'), 'a') as f: f.write(json.dumps(dict(row, logged=time.strftime('%Y-%m-%d %H:%M:%S')), ensure_ascii=False) + '\n')


def cached(id_):
    for ext in ('.mp3', '.wav'):
        p = kpath(f'cache/epidemic/{id_}{ext}')
        if os.path.exists(p): return p
    return None


def get_epidemic(kind, id_, title=None, role=None):
    """the raw file for an Epidemic id: from the cache, or downloaded once."""
    p = cached(id_)
    if p: return p
    p = kpath(f'cache/epidemic/{id_}.mp3')
    row = ep.download(kind, id_, p, title=title, role=role)
    log(row)
    return p


def cmd_import_research():
    E = json.load(open(f'{SR_KIT}/kit_epidemic.json')); F = json.load(open(f'{SR_KIT}/kit_free.json'))
    RE = json.load(open(f'{SR_KIT}/roles_epidemic.json'))
    L = {os.path.basename(f['file']): f for f in json.load(open(f'{SR_KIT}/epidemic/epidemic_log.json'))['files']}
    K = dict(ref_event_lufs=E['ref_event_lufs'],
             note=('Every SFX file is normalised to the same event loudness (loudest 100 ms, K-weighted) = ref_event_lufs. '
                   'Gain at placement = target_db_vs_voice + voice integrated LUFS - ref_event_lufs.'),
             levels_source='~/code/sound-research/SOUND.md + kit/roles_epidemic.json (21 Oct 2026)',
             mix=dict(master_lufs=-14.0, true_peak_max_db=-1.0, bed_under_voice_db=14, bed_duck_db=4, sfx_cap_per_10s=5, sfx_min_gap_s=0.22,
                      whoosh_share_of_cuts='about 1 in 3', bed_fade_out_s=0.8,
                      why=('SOUND.md: viral master -14.4 LUFS (-14.6 to -14.2), Jack -16.0; bed 13.3 dB under the voice (Jack 17.3 = too quiet); '
                           'SFX -11.7 dB vs voice (-14.9 to -8.4), biggest hits -4.2; 20% of cuts get a sound (10 to 50%), starting on the cut; '
                           'audible SFX 1.8 per 10 s measured, the detector undercounts 2 to 4x, so aim 4 to 5.')),
             roles={}, music=[])
    n = 0
    for role, spec in E['roles'].items():
        r = RE.get(role, {})
        R = dict(target_db_vs_voice=spec['target_db_vs_voice'], use=spec['use'], align=r.get('align'), offset_s=r.get('offset_s', 0.0), max_s=r.get('max_s'),
                 sets=dict(epidemic=[], free=[]))
        for f in spec['files']:
            b = os.path.basename(f['file']); dst = f'sfx/epidemic/{b}'
            os.makedirs(kpath('sfx/epidemic'), exist_ok=True); shutil.copy(os.path.join(os.path.dirname(SR_KIT), f['file']), kpath(dst))
            lg = L.get(b, {})
            raw = os.path.join(SR_KIT, 'epidemic', b.replace('.wav', '.mp3'))
            if lg.get('epidemic_id') and os.path.exists(raw):
                os.makedirs(kpath('cache/epidemic'), exist_ok=True); shutil.copy(raw, kpath(f"cache/epidemic/{lg['epidemic_id']}.mp3"))
            R['sets']['epidemic'].append(dict(file=dst, id=lg.get('epidemic_id'), title=lg.get('title'), source='Epidemic Sound', licence=ep.LICENCE,
                                              dur_s=f.get('dur_s'), event_loudness_lufs=f.get('event_loudness_lufs')))
            log(dict(file=dst, source='Epidemic Sound', id=lg.get('epidemic_id'), title=lg.get('title'), role=role, licence=ep.LICENCE,
                     how='copied from ~/code/sound-research/kit (downloaded there on 21 Oct; not re-downloaded)')); n += 1
        for f in F['roles'].get(role, {}).get('files', []):
            b = os.path.basename(f['file']); dst = f'sfx/free/{b}'
            os.makedirs(kpath('sfx/free'), exist_ok=True); shutil.copy(os.path.join(os.path.dirname(SR_KIT), f['file']), kpath(dst))
            R['sets']['free'].append(dict(file=dst, id=None, title=f"{f['source_pack']}: {f['source_file']}", source=f['source_url'],
                                          licence=f['licence'], dur_s=f.get('dur_s'), event_loudness_lufs=f.get('event_loudness_lufs')))
        K['roles'][role] = R
    for f in L.values():
        if f['kind'] != 'music': continue
        src = os.path.join(os.path.dirname(SR_KIT), f['file']); dst = f"music/{f['epidemic_id'][:8]}.wav"
        os.makedirs(kpath('music'), exist_ok=True)
        if not os.path.exists(kpath(dst)): shutil.copy(src, kpath(dst))
        mp3 = src.replace('.wav', '.mp3')
        if os.path.exists(mp3): os.makedirs(kpath('cache/epidemic'), exist_ok=True); shutil.copy(mp3, kpath(f"cache/epidemic/{f['epidemic_id']}.mp3"))
        K['music'].append(dict(file=dst, id=f['epidemic_id'], title=f['title'], artists=f.get('artists'), bpm=f.get('bpm'), tags=f.get('tags'),
                               source='Epidemic Sound', licence=ep.LICENCE))
        log(dict(file=dst, source='Epidemic Sound', id=f['epidemic_id'], title=f['title'], role='music bed', licence=ep.LICENCE,
                 how='copied from ~/code/sound-research/kit (not re-downloaded)'))
    free_bed = f'{SR_KIT}/music/bed_112bpm.wav'
    if os.path.exists(free_bed):
        shutil.copy(free_bed, kpath('music/free_bed_112bpm.wav'))
        K['music'].append(dict(file='music/free_bed_112bpm.wav', id=None, title='bed_112bpm (made by sound-research/scripts/make_bed.py)', bpm=112,
                               tags=['free'], source='generated locally from CC0 parts', licence='made locally, no third-party rights (see sound-research make_bed.py)'))
    K['default_music'] = dict(short='f29bc514-a2bd-4a6d-b520-3c67fa59c6d2', long='72ead9c2-60c5-4e9f-9f5d-bbdb4aeaaca3',
                              why=('short: "Take Me Away" by dvine, 115 BPM, the SOUND.md draft bed (hopeful electronic, 110 to 125 BPM); '
                                   'long: "Moving Up" by Origo, 110 BPM, hopeful, no vocals (calmer under a talking intro). Change per video in edit.json audio.music.'))
    save(K); print('imported', n, 'Epidemic SFX,', len(K['music']), 'beds ->', KIT, '; manifest', MANIFEST)


def cmd_status():
    K = load(); miss = []
    for role, R in K['roles'].items():
        for s, files in R['sets'].items():
            for f in files:
                if not os.path.exists(kpath(f['file'])): miss.append(f['file'])
    for m in K['music']:
        if not os.path.exists(kpath(m['file'])): miss.append(m['file'])
    print(f"kit {KIT}: {len(K['roles'])} roles, {sum(len(R['sets'].get('epidemic', [])) for R in K['roles'].values())} Epidemic SFX, "
          f"{sum(len(R['sets'].get('free', [])) for R in K['roles'].values())} free SFX, {len(K['music'])} beds; missing on this Mac: {len(miss)}")
    for m in miss[:20]: print('  missing', m)
    print('Epidemic REST key:', 'yes' if ep.available() else 'no (free set only)')


def cmd_fetch():
    import dsp; dsp.ensure_venv()
    K = load(); got = 0
    for role, R in K['roles'].items():
        for f in R['sets'].get('epidemic', []):
            if os.path.exists(kpath(f['file'])) or not f.get('id'): continue
            raw = get_epidemic('sfx', f['id'], f.get('title'), role)
            dsp.normalise_event(raw, kpath(f['file']), K['ref_event_lufs'], R.get('max_s')); got += 1
    for m in K['music']:
        if os.path.exists(kpath(m['file'])) or not m.get('id'): continue
        raw = get_epidemic('music', m['id'], m.get('title'), 'music bed')
        os.makedirs(kpath('music'), exist_ok=True)
        os.system(f"ffmpeg -v error -y -i '{raw}' -ar 48000 -ac 2 -c:a pcm_s24le '{kpath(m['file'])}'"); got += 1
    print('fetched', got)


def cmd_add(role, id_, title=None):
    import dsp; dsp.ensure_venv()
    K = load(); R = K['roles'][role]
    if any(f.get('id') == id_ for f in R['sets'].get('epidemic', [])): print('already in the kit'); return
    raw = get_epidemic('sfx', id_, title, role)
    dst = f"sfx/epidemic/{role}_{len(R['sets']['epidemic']) + 1}.wav"
    meta = dsp.normalise_event(raw, kpath(dst), K['ref_event_lufs'], R.get('max_s'))
    R['sets']['epidemic'].append(dict(file=dst, id=id_, title=title, source='Epidemic Sound', licence=ep.LICENCE, **meta))
    save(K); print('added', dst)


def cmd_add_music(id_, title=None, bpm=None, tags=None):
    K = load()
    if any(m.get('id') == id_ for m in K['music']): print('already in the kit'); return
    raw = get_epidemic('music', id_, title, 'music bed'); dst = f'music/{id_[:8]}.wav'
    os.makedirs(kpath('music'), exist_ok=True)
    os.system(f"ffmpeg -v error -y -i '{raw}' -ar 48000 -ac 2 -c:a pcm_s24le '{kpath(dst)}'")
    K['music'].append(dict(file=dst, id=id_, title=title, bpm=bpm, tags=tags, source='Epidemic Sound', licence=ep.LICENCE))
    save(K); print('added', dst)


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    if not a or a[0] in ('-h', '--help'): print(__doc__)
    elif a[0] == 'status': cmd_status()
    elif a[0] == 'import-research': cmd_import_research()
    elif a[0] == 'fetch': cmd_fetch()
    elif a[0] == 'add': cmd_add(a[1], a[2], opt('--title'))
    elif a[0] == 'add-music': cmd_add_music(a[1], opt('--title'), int(opt('--bpm')) if opt('--bpm') else None, (opt('--tags') or '').split(',') if opt('--tags') else None)
    elif a[0] == 'search':
        if a[1] == 'sfx':
            for s in ep.search_sfx(a[2]): print(s['id'], f"{s['length']}s", s['title'])
        else:
            for t in ep.search_music(a[2]): print(t['id'], t['bpm'], f"{t['length']}s", t['title'], '|', ', '.join(t['moods'][:3]))
    else: print('unknown command')
