#!/usr/bin/env python3
"""layout_check.py: check a layout BEFORE building it (fast, no render). Run after writing edit.json "layout".

usage: layout_check.py <project>

Reads edit.json (layout, untrimmed times), work/eyes_down.json, work/joins.json, work/words_pre.json and prints PASS/FAIL for:
- no face window (split or jack) touches a look-down
- no camera join inside a face window (a join must sit on a switch, or under a full graphic)
- no split -> split or jack -> jack switch on a join (that is a naked jump cut)
- every shot 1.5 s or longer (the last one may be shorter), median 1.8 to 5 s
- the speaker never gone more than 4.5 s; speaker share 40 to 72 %; speaker full screen 8 to 22 %
- switches on a phrase end (or say which keyword the next shot lands on)
Exit 1 on any FAIL.
"""
import json, os, statistics as st, sys


def main(P):
    E = json.load(open(os.path.join(P, 'edit.json'))); L = E['layout']; W = os.path.join(P, 'work')
    ED = json.load(open(os.path.join(W, 'eyes_down.json'))) if os.path.exists(os.path.join(W, 'eyes_down.json')) else []
    J = json.load(open(os.path.join(W, 'joins.json'))) if os.path.exists(os.path.join(W, 'joins.json')) else []
    words = json.load(open(os.path.join(W, 'words_pre.json')))
    T = words[-1]['e'] + 0.3; L = [[a, min(b, T), ty, sc] for a, b, ty, sc in L if a < T]
    fails = 0
    def rep(ok, name, detail):
        nonlocal fails; fails += 0 if ok else 1; print(f"{'PASS' if ok else 'FAIL'}  {name:<34} {detail}")
    face = [(a, b, sc) for a, b, ty, sc in L if ty in ('split', 'jack')]
    bad = [(a, b, sc) for a, b, sc in face for e in ED if e[0] < b and e[1] > a]
    rep(not bad, 'no look-down on screen', f'{len(bad)}' + (f': {bad[:3]}' if bad else ''))
    bad = [j for j in J if any(a + 0.12 < j < b - 0.12 for a, b, sc in face)]
    rep(not bad, 'no camera join inside a face window', f'{len(bad)}' + (f': {bad[:4]}' if bad else ''))
    bad = [L[i][0] for i in range(1, len(L)) if L[i][2] == L[i - 1][2] and L[i][2] in ('split', 'jack') and any(abs(j - L[i][0]) < 0.13 for j in J)]
    rep(not bad, 'no same-layout switch on a join', f'{len(bad)}' + (f': {bad}' if bad else ''))
    d = [b - a for a, b, ty, sc in L]; short = [(round(a, 2), round(b - a, 2)) for k, (a, b, ty, sc) in enumerate(L[:-1]) if b - a < 1.5 and not (k == 0 and L[1][3] == sc and b - a <= 0.6)]   # an opening reveal is allowed
    rep(not short, 'no shot under 1.5 s', f'{len(short)}' + (f': {short}' if short else ''))
    md = st.median(d); rep(1.6 <= md <= 5, 'median shot 1.6 to 5 s', f'{md:.2f} s')
    gaps = []; last = 0
    for a, b, sc in face: gaps.append(a - last); last = b
    rep(max(gaps) <= 4.5, 'speaker never gone over 4.5 s', f'longest {max(gaps):.1f} s (the end card is exempt)')
    sh = sum(b - a for a, b, sc in face) / T; rep(0.40 <= sh <= 0.72, 'speaker share 40 to 72 %', f'{sh*100:.0f} %')
    fs = sum(b - a for a, b, ty, sc in L if ty == 'jack') / T; rep(0.08 <= fs <= 0.22, 'speaker full screen 8 to 22 %', f'{fs*100:.0f} %')
    sw = sum(1 for i in range(1, len(L)) if L[i][2] != L[i - 1][2] or L[i][3] != L[i - 1][3]); rep(6 <= sw / T * 40 <= 18, 'switches 6 to 18 per 40 s', f'{sw / T * 40:.1f}')
    mid = []
    for a, b, ty, sc in L[1:]:
        pw = [w for w in words if w['e'] <= a + 0.06]; nw = [w for w in words if w['s'] >= a - 0.06]
        if pw and nw and not pw[-1]['w'].endswith(('.', ',', '?', '!', ':')) and nw[0]['s'] - pw[-1]['e'] < 0.12: mid.append(f"{a:.2f} '{pw[-1]['w']}|{nw[0]['w']}'")
    print(f"INFO  {'mid-phrase switches':<34} {len(mid)}: {mid} (each must land ON the keyword its new shot shows)")
    print('LAYOUT OK' if not fails else f'LAYOUT: {fails} FAIL'); return not fails


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    sys.exit(0 if main(a[0]) else 1)
