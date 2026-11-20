#!/usr/bin/env python3
"""Short mode, build step: edit.json + words + trim.json -> the HyperFrames pages.

usage: gen.py <project> [--until SECONDS]

Writes work/comps/final.html, work/comps/layer-graphics.html, work/comps/layer-captions.html, work/design.json, work/foot.json.
--until renders only the first N seconds (smoke tests): it sets the page length, nothing else changes.

The page = lib/lib.css + edit.json "css" files, and lib/head.js + lib/foot.js + edit.json "scenes" files + lib/tail.js
(foot.js declares FOOT, which scenes read: it must come before them).
Generalised from tyler-short-r8/work/gen8.py (round 8). Same maths:
  - layout windows can be written on the pre-trim timeline ("timeline": "pretrim"); shift() maps them onto the trimmed cut
    and snap() moves a switch within 0.12 s of a trim onto the trim point, so the jump in his footage hides under the switch.
  - captions: 1 to 3 word chunks from word indexes (or "auto"), start 0.03 s before the first word, end 0.35 s after the last
    word or at the next chunk, never across a layout switch; centre y 960 in a split (on the seam), 1306 elsewhere.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

def main(project, until=None):
    E = jy.load_edit(project); WD = jy.P(E, 'work') + '/'
    TR = json.load(open(WD + 'trim.json')) if os.path.exists(WD + 'trim.json') else dict(cuts=[], duration=None)
    WF = json.load(open(WD + 'words_final.json'))
    T = TR.get('duration') or TR.get('duration_r7') or E['duration']
    V = lambda i: WF[i]['s']; VE = lambda i: WF[i]['e']

    def shift(t):   # pre-trim time -> trimmed time (a time inside a removed pause lands on the trim point)
        d = 0.0
        for c in TR['cuts']:
            if t >= c['cut_out'] - 1e-9: d += c['dur']
            elif t > c['cut_in']: d += t - c['cut_in']
        return round(t - d, 4)

    def snap(t):    # a switch within 0.12 s of a trim moves onto the trim point
        for c in TR['cuts']:
            if c['cut_in'] - 0.12 <= t <= c['cut_out'] + 0.12: return shift(c['cut_in'])
        return shift(t)

    pre = E.get('timeline', 'final') == 'pretrim'
    m = snap if pre else (lambda t: t)
    T_pre = TR.get('duration_pre') or TR.get('duration_r6') or T
    ec = E.get('end_card')
    END = round(V(ec['word']) + ec.get('offset', 0), 4) if ec else T
    L = []
    for a, b, ty, sc in E['layout']:
        a2 = 0.0 if a == 0 else m(a)
        b2 = T if b >= T_pre - 1e-6 else m(b)
        L.append((a2, b2, ty, sc))
    if ec:   # the last window ends exactly on the end-card word; the end card runs to the end
        L[-1] = (L[-1][0], END, L[-1][2], L[-1][3]); L.append((END, T, ec.get('type', 'anim'), ec.get('scene', 'end')))

    C = E.get('captions', {})
    disp_map = {k.lower(): v for k, v in C.get('display', {}).items()}

    def disp(i):
        w = WF[i]['w'].strip(); lw = w.lower().strip('.,')
        if lw in disp_map: return disp_map[lw] + ('.' if w.endswith('.') and C.get('keep_stop', {}).get(lw, False) else '')
        return w

    chunks = C.get('chunks', 'auto')
    if chunks == 'auto': chunks = auto_chunks(WF, L)
    bounds = sorted(set([a for a, b, ty, sc in L] + [T]))

    def lay(t):
        for a, b, ty, sc in L:
            if a <= t < b: return ty
        return L[-1][2]

    lead, pad = C.get('lead', 0.03), C.get('pad_end', 0.35)
    ys = C.get('y', {'split': 960, 'other': 1306})
    caps = []
    for k, (a, b) in enumerate(chunks):
        words = []; i = a
        while i <= b:
            if C.get('join_slash') and WF[i]['w'].lower().strip('.,') == 'slash' and i + 1 <= b:
                words.append('/' + WF[i + 1]['w'].strip('.,')); i += 2; continue
            words.append(disp(i)); i += 1
        st = max(0.0, V(a) - lead)
        sb = [x for x in bounds if st < x <= V(a) + lead]          # a chunk that opens a new layout starts with it
        if sb: st = sb[0]
        nxt = V(chunks[k + 1][0]) - lead if k + 1 < len(chunks) else T
        en = min(VE(b) + pad, nxt)
        nb = [x for x in bounds if st + 0.05 < x < en]              # never carry a caption across a layout switch
        if nb: en = nb[0]
        caps.append(dict(text=' '.join(words), start=round(st, 3), end=round(en, 3), n=len(words),
                         cy=ys['split'] if lay(st + 0.001) == 'split' else ys['other']))
    for o in C.get('y_overrides', []):   # e.g. he leans in during the CTA: lift those captions off his forehead
        a0 = next(a for a, b, ty, sc in L if sc == o['from_scene'])
        b0 = END if o.get('until') == 'end_card' else o.get('until', T)
        for c in caps:
            if a0 - 1e-6 <= c['start'] < b0 - 0.01: c['cy'] = o['cy']

    FOOT = []
    for f in E.get('footage', []):
        f = dict(f); f['a'] = m(f['a']); f['b'] = m(f['b'])
        x, y, w, h = f['card']; sx, sy, sw = f['src']; k = w / sw; mw, mh = f.get('media_size', [1920, 1080])
        f.update(k=k, vl=-sx * k, vt=-sy * k, vw=mw * k, vh=mh * k); FOOT.append(f)

    ROOTV = []
    for r in E.get('root_videos', []):   # {"id", "media", "word", "offset", "ms", "until_scene"}: starts on a word, runs to the end of a scene's last window
        st = round(V(r['word']) + r.get('offset', 0), 4); en = [b for a, b, ty, sc in L if sc == r['until_scene']][-1]
        ROOTV.append(dict(r, start=st, end=en))
    D = dict(style=E.get('style', {}), T=T, endAt=END, foot=FOOT, words=[dict(w=w['w'], s=w['s'], e=w['e']) for w in WF], layout=[list(x) for x in L], caps=caps, trans=E.get('transitions', {}))
    D.update(E.get('extra_data', {}))
    def rd(p): return open(p if os.path.isabs(p) else (jy.P(E, p) if os.path.exists(jy.P(E, p)) else os.path.join(HERE, p))).read()
    js = '\n'.join([rd(os.path.join(HERE, 'lib/head.js')), rd(os.path.join(HERE, 'lib/foot.js'))] + [rd(s) for s in E['scenes']] + [rd(os.path.join(HERE, 'lib/tail.js'))])
    st = E.get('style', {})
    fc = jy.P(E, 'work', 'hf', 'fonts.css')
    VARS = (open(fc).read() if os.path.exists(fc) else '') + (
        f":root{{--font-main:'main-font';--font-accent:'accent-font';--ink:{st.get('ink', '#111111')};--accent:{st.get('accent', '#E5484D')};"
        f"--accent2:{st.get('accent2', '#111111')};--ground:{st.get('ground', '#FAFAF8')};--card:{st.get('card', '#FFFFFF')};"
        f"--cap-bg:{st.get('caption_bg', 'rgba(40,40,40,0.78)')};--cap-ink:{st.get('caption_ink', '#FFFFFF')}}}")
    CSS = '\n'.join([VARS, rd(os.path.join(HERE, 'lib/lib.css'))] + [rd(s) for s in E.get('css', [])])
    TD = round(min(T, until), 4) if until else T
    W_, H_ = E.get('size', [1080, 1920])

    def page(mode):
        d = dict(D, mode=mode)
        bg = 'transparent' if mode != 'final' else E.get('style', {}).get('ground', '#FAFAF8')
        return f'''<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W_}, height={H_}" />
<title>{E.get('title', E.get('name', 'short'))}</title>
<script src="gsap.min.js"></script>
<style>{CSS}
html,body{{background:{bg}}}
#root{{background:{bg}}}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TD}" data-fps="{E.get('fps', 30)}" data-width="{W_}" data-height="{H_}">
__VIDEOS__
</div>
<script>window.__D = {json.dumps(d)};</script>
<script>
{js}
</script>
</body>
</html>
'''

    def vids(mode):   # timed media must sit at root level (never inside a timed element)
        v = ''
        if mode == 'final':
            v += f'<div id="vfullWrap" class="vwrap" style="left:0;top:0;width:1080px;height:1920px;visibility:hidden"><video id="vfull" src="media/full.mp4" data-start="0" data-duration="{T}" data-track-index="0" muted playsinline style="position:absolute;left:0;top:0;width:1080px;height:1920px"></video></div>\n'
            v += f'<div id="vsplitWrap" class="vwrap" style="left:0;top:960px;width:1080px;height:960px;visibility:visible"><video id="vsplit" src="media/split.mp4" data-start="0" data-duration="{T}" data-track-index="1" muted playsinline style="position:absolute;left:0;top:0;width:1080px;height:960px"></video></div>\n'
        if mode != 'captions':
            for n, f in enumerate(FOOT):
                x, y, w, h = f['card']
                v += (f'<div id="{f["id"]}" class="foot" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;visibility:hidden">'
                      f'<video id="{f["id"]}-v" src="media/{f.get("media", "launch.mp4")}" data-start="{f["a"]:.4f}" data-duration="{f["b"] - f["a"]:.4f}" data-media-start="{f["ms"]}" data-track-index="{2 + n}" muted playsinline '
                      f'style="left:{f["vl"]:.1f}px;top:{f["vt"]:.1f}px;width:{f["vw"]:.1f}px;height:{f["vh"]:.1f}px"></video></div>\n')
            for k, r in enumerate(ROOTV):   # extra timed videos declared at root; scene code moves them into place (r9: the film inside the pipeline nodes)
                v += (f'<video id="{r["id"]}" src="media/{r.get("media", "launch.mp4")}" data-start="{r["start"]:.4f}" data-duration="{r["end"] - r["start"]:.4f}" '
                      f'data-media-start="{r["ms"]}" data-track-index="{2 + len(FOOT) + k}" muted playsinline style="position:absolute;left:0;top:0;width:10px;height:10px"></video>\n')
        return v

    os.makedirs(WD + 'comps', exist_ok=True)
    for mode, fn in [('final', 'final'), ('graphics', 'layer-graphics'), ('captions', 'layer-captions')]:
        open(WD + f'comps/{fn}.html', 'w').write(page(mode).replace('__VIDEOS__', vids(mode)))
    json.dump(FOOT, open(WD + 'foot.json', 'w'), indent=1)
    json.dump(dict(T=T, layout=[list(x) for x in L], captions=caps, chunks=chunks, endAt=END, until=until), open(WD + 'design.json', 'w'), indent=1)
    sh = {}
    for a, b, ty, sc in L: sh[ty] = sh.get(ty, 0) + b - a
    print('shares %', {k: round(v / T * 100, 1) for k, v in sh.items()}, 'switches', len(L) - 1, 'captions', len(caps), 'page length', TD)


def auto_chunks(WF, L, most=3):
    """1 to 3 words per caption (mostly 2), break after punctuation and at layout switches."""
    bounds = sorted(set(a for a, b, ty, sc in L))
    out, cur = [], []
    for i, w in enumerate(WF):
        if cur and any(WF[cur[0]]['s'] < x <= w['s'] for x in bounds): out.append((cur[0], cur[-1])); cur = []
        cur.append(i)
        if len(cur) >= most or w['w'].rstrip()[-1:] in '.,!?' or (len(cur) == 2 and i + 1 < len(WF) and WF[i + 1]['s'] - w['e'] > 0.25):
            out.append((cur[0], cur[-1])); cur = []
    if cur: out.append((cur[0], cur[-1]))
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a[0], float(a[a.index('--until') + 1]) if '--until' in a else None)
