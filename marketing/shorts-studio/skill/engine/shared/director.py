#!/usr/bin/env python3
"""Step 2, the director pass, in 3-second segments. Copy, don't invent: every scene names the reference frame it copies.

usage:
  director.py draft <project>   writes beats.md: one row per ~3 s segment with what he says, and empty columns to fill
  director.py check <project>   FAILS unless every row has a message, a frame type from the mode's library, a hero visual,
                                a real asset to pull, and a reference frame code in "copies" (JS1 0:26, J07 0:09, N08, KS1 1:47,
                                R13 0:08, or a loved system: pipeline-diagram, pro-editor, an earlier round like tyler-short r8 s9)

Why 3 s: in his top 5 Shorts and 10 long-form intros one layout holds a median 3.0 s (RULES.md rule 0, measured).
Reference index: refs/REFS.md (sheets in ~/code/jack-youtube-system/rules/sheets/). Frame-type tables: short/README.md, long/README.md.
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jy

TYPES = dict(short=['split', 'full graphic', 'colour block', 'footage', 'full speaker', 'cta', 'end card'],
             long=['FULL', 'TEXT', 'FOOT', 'BROLL', 'SIDE', 'GFX', 'LOGO'])
REF = re.compile(r'\b(JS[1-5]|J(0[1-9]|10)|N(0[1-9]|10)|KS[1-5]|R(0[1-9]|1[0-9]|20))\b|pipeline-diagram|pro-editor|tyler-short r\d+|grokbot-intro r\d+|board', re.I)
COLS = ['#', 'time (s)', 'he says', 'message (one idea)', 'frame type', 'hero visual', 'real asset to pull', 'copies (reference frame)']


def words(E):
    for p in ('work/words_final.json', 'work/words.json'):
        if os.path.exists(jy.P(E, p)):
            W = json.load(open(jy.P(E, p)))
            return [dict(w=x['w'], s=x.get('s', x.get('start')), e=x.get('e', x.get('end'))) for x in W]
    raise SystemExit('no work/words_final.json or work/words.json: run trim.py (Short) or transcribe.py first')


def draft(project):
    E = jy.load_edit(project); W = words(E); segs, cur = [], []
    for i, w in enumerate(W):
        cur.append(w); d = w['e'] - cur[0]['s']
        end_sentence = w['w'].rstrip()[-1:] in '.!?'
        if (d >= 2.5 and end_sentence) or d >= 3.4 or (d >= 2.0 and i + 1 < len(W) and W[i + 1]['s'] - w['e'] > 0.3):
            segs.append(cur); cur = []
    if cur: segs.append(cur)
    lines = [f"# beats.md: director pass ({E['mode']}, {E.get('name')} r{E.get('round')})", '',
             'One idea per row. Fill every column. "copies" names the exact reference frame (refs/REFS.md): copy it, do not invent a look.',
             f"Frame types for this mode: {', '.join(TYPES[E['mode']])}.", '',
             '| ' + ' | '.join(COLS) + ' |', '|' + '---|' * len(COLS)]
    for k, s in enumerate(segs):
        lines.append(f"| {k + 1} | {s[0]['s']:.2f} to {s[-1]['e']:.2f} | {' '.join(x['w'] for x in s)} |  |  |  |  |  |")
    out = jy.P(E, 'beats.md')
    if os.path.exists(out): out = jy.P(E, 'beats.draft.md')
    open(out, 'w').write('\n'.join(lines) + '\n'); print(len(segs), 'segments ->', out)


def check(project):
    """header-driven: finds the columns by name, so older beat sheets (r8) can be checked too."""
    E = jy.load_edit(project); p = jy.P(E, 'beats.md'); bad = []; warn = []; n = 0
    syn = dict(short=['split', 'full-screen graphic', 'full graphic', 'graphic', 'colour block', 'color block', 'footage', 'full speaker', 'cta', 'end card'],
               long=[t.lower() for t in TYPES['long']] + ['full', 'side', 'gfx', 'broll', 'foot', 'text', 'logo'])[E['mode']]
    hdr = None
    def col(names):
        for i, h in enumerate(hdr):
            if any(nm in h for nm in names): return i
    for line in open(p):
        if not line.startswith('|') or line.startswith('|---'): continue
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        if hdr is None or (('copies' in ' '.join(x.lower() for x in c)) and not any(ch.isdigit() for ch in c[0])):
            hdr = [x.lower() for x in c]; ix = dict(msg=col(['message', 'idea']), typ=col(['frame type', 'shot', 'frame']), hero=col(['hero', 'on screen']),
                                                     asset=col(['asset']), cop=col(['copies'])); continue
        n += 1; row = c[0]
        get = lambda k: c[ix[k]] if ix[k] is not None and ix[k] < len(c) else ''
        if not get('msg'): bad.append(f'row {row}: no message')
        if not any(t in get('typ').lower() for t in syn): bad.append(f'row {row}: frame type "{get("typ")}" not in {TYPES[E["mode"]]}')
        if not get('hero'): bad.append(f'row {row}: no hero visual')
        if ix['asset'] is None: warn.append('no "real asset to pull" column: add it (logo, UI, footage, link per row)')
        elif not get('asset'): bad.append(f'row {row}: no real asset named (logo, UI, footage, link)')
        if not REF.search(get('cop')) and not (('full speaker' in get('typ').lower() or get('typ').upper() == 'FULL') and re.search(r'rule 22|opinion|nothing', (get('cop') + get('hero')).lower())):
            bad.append(f'row {row}: "copies" names no reference frame (JS1 0:26, J07 0:09, N08, KS1 1:47, R13, pipeline-diagram ...)')
    print(f'{n} rows, {len(bad)} problems')
    for w in sorted(set(warn)): print('  WARN', w)
    for b in bad: print('  FAIL', b)
    return not bad and n > 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    if a[0] == 'draft': draft(a[1])
    else: sys.exit(0 if check(a[1]) else 1)
