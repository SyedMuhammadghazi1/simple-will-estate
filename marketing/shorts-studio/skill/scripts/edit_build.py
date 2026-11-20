"""edit_build.py: turn a cut recording + words + a plan into a HyperFrames project.

usage: python3 scripts/edit_build.py --cut <work>/cut.mp4 --words <work>/words.json --plan <plan.json> --out <project dir>

plan.json (Claude writes it; see examples/edit-plan.json):
  format      "long" (16:9) or "short" (9:16)
  short_layout  optional: "crop" (cropped around the face) or "split" (video below, a panel for
              graphics and captions above). Left out: crop if it fits, else split.
  face        [left, top, right, bottom] in percent of the recording. Read it off frames.sh stills.
  keep_clear  extra boxes (same percent units) that must never be covered, like a product in hand
  style       font, caption, accent, panel, ink, line, ground colours, radius (copy them from the style file)
  captions    {"on": true, "max_words": 3}
  graphics    [{"type": "stat", "word": "21", "value": 21, "suffix": "", "label": "...", "hold": 2.5},
               {"type": "callout", "word": "contract", "text": "...", "hold": 2.0}]
              "word" is the spoken word it lands on. Use "word_i" (the #n from captions.py) if the word repeats.

It places every graphic in the biggest free area beside the face, refuses any layout that covers the
face or a keep_clear box, and prints a safe-zone report."""
import argparse, json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--cut', required=True)
ap.add_argument('--words', required=True)
ap.add_argument('--plan', required=True)
ap.add_argument('--out', required=True)
a = ap.parse_args()
plan = json.load(open(a.plan))
words = json.load(open(a.words))
src = probe(a.cut)
D = round(src['dur'], 3)
short = plan.get('format', 'long') == 'short'
W, H = (1080, 1920) if short else (1920, 1080)
M = 80                                     # safe margin

face_pct = plan.get('face', [30, 10, 70, 75])
st = dict(plan.get('style', {}))
for k_, v_ in {'font': 'Inter', 'caption': '#FFFFFF', 'accent': '#3DD68C', 'panel': '#17181C', 'ink': '#ECEDEF',
               'line': 'rgba(255,255,255,0.12)', 'radius': '20px', 'ground': '#0E0F12'}.items():
    st.setdefault(k_, v_)
cap = 84 if short else 64
st.update({'capsize': f'{cap}px', 'numsize': f'{170 if short else 160}px', 'labelsize': f'{44 if short else 40}px',
           'textsize': f'{56 if short else 46}px', 'headsize': f'{104 if short else 72}px'})
ch = int(cap * 1.6)
capcfg = plan.get('captions', {'on': True})
caps_on = capcfg.get('on', True)


def hits(r, b, pad=24):   # r = [x, y, w, h], b = [x0, y0, x1, y1]
    return not (r[0] + r[2] + pad <= b[0] or r[0] >= b[2] + pad or r[1] + r[3] + pad <= b[1] or r[1] >= b[3] + pad)


class NoRoom(Exception):
    pass


def layout(mode):
    """mode: 'cover' (Long), 'crop' (Short, cropped around the face) or 'split' (Short, video in the
    lower part, graphics and captions in a panel above it)."""
    global L_mode
    L_mode = mode
    rx, ry, rw, rh = (0, H - 1216, W, 1216) if mode == 'split' else (0, 0, W, H)
    sc = max(rw / src['w'], rh / src['h'])
    vw, vh = src['w'] * sc, src['h'] * sc
    fcx = (face_pct[0] + face_pct[2]) / 200 * vw
    vx = rx + (min(0, max(rw - vw, rw / 2 - fcx)) if short else (rw - vw) / 2)
    vy = ry + (rh - vh) / 2
    to_out = lambda b: [max(rx, vx + b[0] / 100 * vw), max(ry, vy + b[1] / 100 * vh),
                        min(rx + rw, vx + b[2] / 100 * vw), min(ry + rh, vy + b[3] / 100 * vh)]
    face = to_out(face_pct)
    blocked = [face] + [to_out(b) for b in plan.get('keep_clear', [])]
    # captions: first clear spot wins
    if not short:
        spots = [H - M - ch, M]
    elif mode == 'crop':
        spots = [H * 0.72, face[3] + 40, H * 0.10]
    else:
        spots = [ry - 40 - ch, H * 0.72]
    cbox = None
    if caps_on:
        for y in spots:
            box = [M, round(y), W - 2 * M, ch]
            if M <= y <= H - (300 if short else M) - ch and not any(hits(box, b, 8) for b in blocked):
                cbox = box; break
        if not cbox:
            raise NoRoom('No room for captions that does not cover the face.')
    else:
        cbox = [M, H - M - ch, W - 2 * M, ch]
    taken = blocked + ([[cbox[0], cbox[1], cbox[0] + cbox[2], cbox[1] + cbox[3]]] if caps_on else [])
    gfx, report = [], []
    for g in plan.get('graphics', []):
        if 't' in g:                                  # a fixed time, for a hook title at 0 s or an end card
            w = {'text': g.get('word', f"{g['t']} s"), 'start': float(g['t']) + 0.1}
        else:
            w = next((x for x in words if 'word_i' in g and x['i'] == g['word_i']), None) or \
                next((x for x in words if norm(x['text']) == norm(str(g.get('word', '')))), None)
        if not w:
            sys.exit(f"Graphic word not found in the transcript: {g.get('word')}. Use 'word_i' with the #n from captions.py.")
        t = max(0.0, round(w['start'] - 0.1, 3))   # the landing hits as the word is said
        hold = float(g.get('hold', 2.5))
        if g['type'] == 'end':
            hold = min(hold, max(0.5, D - t))
        size = {'stat': 360, 'callout': 240, 'title': 300, 'end': 340, 'media': 9999}
        gw, gh = (W - 2 * M, size.get(g['type'], 240)) if short else (600, {'stat': 350, 'media': 9999}.get(g['type'], 200))
        if g['type'] == 'media' and short:
            gw = W
        # things on screen at the same time must not overlap each other either
        busy = [ [p['box'][0], p['box'][1], p['box'][0] + p['box'][2], p['box'][1] + p['box'][3]]
                 for p in gfx if p['t'] < t + hold and t < p['t'] + p['hold'] ]
        taken_now = taken + busy
        zones = []
        if short:   # free horizontal bands, top to bottom, between the face and the captions
            cuts = sorted([(b[1] - 48, b[3] + 48) for b in taken_now], key=lambda c: c[0])
            y = 0 if (g['type'] == 'media' and mode == 'split') else M
            for c0, c1 in cuts + [(H - 300, H)]:
                if c0 > y:
                    zones.append(('top' if y < face[1] else 'bottom', [M, y, W - 2 * M, c0 - y]))
                y = max(y, c1)
        else:       # beside the face, above or below the caption band
            y0, y1 = (M, cbox[1] - 32) if (not caps_on or cbox[1] > H / 2) else (cbox[1] + cbox[3] + 32, H - M)
            zones = [('left', [M, y0, face[0] - 48 - M, y1 - y0]), ('right', [face[2] + 48, y0, W - M - face[2] - 48, y1 - y0])]
        zones = sorted(zones, key=lambda z: -(z[1][2] * z[1][3]))
        placed = None
        for side, z in zones:
            if g['type'] == 'media':
                if z[3] < 320:
                    continue
            elif z[2] < gw * 0.7 or z[3] < gh * 0.7:
                continue
            bw, bh = min(gw, z[2]), min(gh, z[3])
            if g['type'] == 'media' and short:
                bx0 = 0 if L_mode == 'split' else M
                bw = W - 2 * bx0
                box = [bx0, round(z[1]), bw, round(bh)]
                if not any(hits(box, b) for b in taken_now):
                    placed = (side, box); break
                continue
            cy = (face[1] + face[3]) / 2 if not short else z[1] + z[3] / 2
            by = min(max(cy - bh / 2, z[1]), z[1] + z[3] - bh)
            bx = z[0] + (z[2] - bw) / 2
            box = [round(bx), round(by), round(bw), round(bh)]
            if not any(hits(box, b) for b in taken_now):
                placed = (side, box); break
        if not placed:
            raise NoRoom(f"No safe room for the {g['type']} at {t:.1f} s ('{g.get('word', '')}') without covering the face or another graphic on screen then.")
        gfx.append(dict(g, t=t, hold=hold, side=placed[0], box=placed[1]))
        report.append(f"  {g['type']:8s} on '{w['text']}' at {t:6.2f} s for {hold} s, {placed[0]}, box {placed[1]} -> clear of face")
    return {'mode': mode, 'region': [rx, ry, rw, rh], 'video': [vx - rx, vy - ry, vw, vh], 'face': face,
            'cbox': cbox, 'gfx': gfx, 'report': report}


def zoom_style(path, bw, bh, crop):
    """inner video/img style so the crop box [l, t, r, b] in percent of the source fills a bw x bh box."""
    i = probe(path)
    l, t, r, b = crop or [0, 0, 100, 100]
    cw, ch_ = i['w'] * (r - l) / 100, i['h'] * (b - t) / 100
    sc = max(bw / cw, bh / ch_)
    w, h = i['w'] * sc, i['h'] * sc
    x = -l / 100 * w + (bw - cw * sc) / 2
    y = -t / 100 * h + (bh - ch_ * sc) / 2
    return f'position:absolute;left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;max-width:none'


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


def norm(s):
    return re.sub(r"[^a-z0-9']", '', s.lower())


modes = ['cover'] if not short else ([plan['short_layout']] if plan.get('short_layout') else ['crop', 'split'])
L, why = None, []
for mode in modes:
    try:
        L = layout(mode); break
    except NoRoom as e:
        why.append(f'{mode}: {e}')
if not L:
    sys.exit('No layout keeps the face clear. ' + ' '.join(why) + ' Drop a graphic, shorten it, or set "captions": {"on": false}.')
if why:
    print('note: ' + ' '.join(why) + f" So this Short uses the '{L['mode']}' layout (video below, graphics above).")
cbox, gfx, report, face = L['cbox'], L['gfx'], L['report'], L['face']


# chunks of 1 to N words, broken at punctuation and pauses; each stays up at least 0.3 s
def chunks(ws, n):
    out, cur = [], []
    for k, w in enumerate(ws):
        cur.append(w)
        gap = ws[k + 1]['start'] - w['end'] if k + 1 < len(ws) else 9
        if len(cur) >= n or w['text'][-1:] in '.?!,;:' or gap > 0.35 or len(' '.join(x['text'] for x in cur)) > (18 if short else 26):
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    res = []
    for k, c in enumerate(out):
        t0 = c[0]['start']
        nxt = out[k + 1][0]['start'] if k + 1 < len(out) else D
        t1 = min(nxt, max(c[-1]['end'] + 0.15, t0 + 0.3))
        if nxt - t1 < 0.3:      # a tiny gap would flash an empty frame; hold through it
            t1 = nxt
        res.append({'t0': round(t0, 3), 't1': round(min(t1, D), 3),
                    'words': [{'text': x['text'], 'start': x['start'], 'end': x['end']} for x in c]})
    return res




chunk_list = chunks(monotonic(words), int(capcfg.get('max_words', 3))) if caps_on else []
for k_ in range(len(chunk_list)):          # a caption line always leaves before the next one arrives
    c_ = chunk_list[k_]
    nxt_ = chunk_list[k_ + 1]['t0'] if k_ + 1 < len(chunk_list) else D
    c_['t1'] = round(max(c_['t0'] + 0.05, min(c_['t1'], nxt_)), 3)
for i in range(len(gfx)):
    for j in range(i):
        a_, b_ = gfx[i], gfx[j]
        if a_['t'] < b_['t'] + b_['hold'] and b_['t'] < a_['t'] + a_['hold'] and \
           a_['type'] not in ('media', 'title') and b_['type'] not in ('media', 'title'):
            sys.exit(f"Two cards are on screen together near {a_['t']} s. Give each card its own moment "
                     "(a title or media panel may sit with one card).")

os.makedirs(os.path.join(a.out, 'media'), exist_ok=True)
shutil.copyfile(a.cut, os.path.join(a.out, 'media', 'cut.mp4'))
plan_dir = os.path.dirname(os.path.abspath(a.plan))
media_html = []
for k, g in enumerate(gfx):
    if g['type'] != 'media':
        continue
    srcf = g.get('file') or sys.exit("A media graphic needs \"file\": a picture or clip (screen recording, product shot).")
    srcf = srcf if os.path.isabs(srcf) else os.path.join(plan_dir, srcf)
    if not os.path.exists(srcf):
        sys.exit(f"Media file not found: {srcf}")
    ext = os.path.splitext(srcf)[1].lower()
    name = f'm{k}{ext}'
    shutil.copyfile(srcf, os.path.join(a.out, 'media', name))
    g['id'] = f'm{k}'
    bx = g['box']
    pos = f'left:{bx[0]}px;top:{bx[1]}px;width:{bx[2]}px;height:{bx[3]}px'
    zs = zoom_style(srcf, bx[2], bx[3], g.get('crop'))
    if ext in ('.mp4', '.mov', '.m4v', '.webm'):
        start = float(g['t']) if g.get('sync') else float(g.get('from', 0))   # sync: same timeline as the cut
        inner = (f'<video class="clip" src="media/{name}" muted playsinline data-start="{g["t"]}" '
                 f'data-duration="{g["hold"] + 0.4}" data-media-start="{start}" data-track-index="{k + 1}" '
                 f'style="{zs}"></video>')
    else:
        inner = f'<img src="media/{name}" alt="" style="{zs}">'
    media_html.append(f'  <div class="gfx media" id="m{k}" style="{pos};opacity:0">{inner}</div>')
for f in ('edit.js', 'edit.css'):
    shutil.copyfile(os.path.join(HERE, 'templates', 'edit', f), os.path.join(a.out, f))
shutil.copyfile(os.path.join(HERE, 'templates', 'motion', 'hyperframes.json'), os.path.join(a.out, 'hyperframes.json'))
panel_html = ''
pn = plan.get('panel')
if pn and L['mode'] == 'split':
    pf = pn['file'] if os.path.isabs(pn['file']) else os.path.join(plan_dir, pn['file'])
    if not os.path.exists(pf):
        sys.exit(f"Panel file not found: {pf}")
    ext = os.path.splitext(pf)[1].lower()
    shutil.copyfile(pf, os.path.join(a.out, 'media', 'panel' + ext))
    ph = L['region'][1]
    zs = zoom_style(pf, W, ph, pn.get('crop'))
    if ext in ('.mp4', '.mov', '.m4v', '.webm'):
        inner = (f'<video class="clip" src="media/panel{ext}" muted playsinline data-start="0" data-duration="{D}" '
                 f'data-media-start="{float(pn.get("from", 0))}" data-track-index="90" style="{zs}"></video>')
    else:
        inner = f'<img src="media/panel{ext}" alt="" style="{zs}">'
    panel_html = (f'  <div id="panel" style="position:absolute;left:0;top:0;width:{W}px;height:{ph}px;overflow:hidden;'
                  f'opacity:{pn.get("opacity", 1)}">{inner}<div class="panel-fade"></div></div>')
elif pn:
    print("note: 'panel' only applies to the split layout. Set \"short_layout\": \"split\" to use it.")
data = {'W': W, 'H': H, 'D': D, 'style': st, 'captionBox': cbox, 'chunks': chunk_list, 'graphics': gfx,
        'face': [round(v) for v in face]}
rx, ry, rw, rh = L['region']
vx, vy, vw, vh = L['video']
wstyle = f'left:{rx}px;top:{ry}px;width:{rw}px;height:{rh}px'
vstyle = f'left:{vx:.1f}px;top:{vy:.1f}px;width:{vw:.1f}px;height:{vh:.1f}px'
font_link = st['font']
font_url = st.get('fonturl') or ('https://fonts.googleapis.com/css2?family=' + font_link.replace(' ', '+') + ':wght@400;600;700;800&display=swap')
html = f"""<!doctype html>
<html lang="en" data-composition-variables='[{{"id":"base","type":"string","label":"Show video","default":"on"}},{{"id":"captions","type":"string","label":"Captions","default":"on"}}]'>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<link rel="stylesheet" href="{font_url}" />
<link rel="stylesheet" href="edit.css" />
<style>html, body {{ width: {W}px; height: {H}px; }} #root {{ font-family: '{font_link}', sans-serif; background: var(--ground); }}</style>
</head>
<body>
<div id="root" data-composition-id="edit" data-start="0" data-duration="{D}" data-width="{W}" data-height="{H}" style="width:{W}px;height:{H}px">
  <div id="vwrap" style="{wstyle}">
    <video id="base" class="clip" src="media/cut.mp4" muted playsinline data-start="0" data-duration="{D}" data-track-index="0" style="{vstyle}"></video>
  </div>
{panel_html}
{chr(10).join(media_html)}
</div>
<script>window.EDIT = {json.dumps(data)};</script>
<script src="edit.js"></script>
<script>window.__timelines["edit"] = window.__timelines["edit"];</script>
</body>
</html>
"""
open(os.path.join(a.out, 'index.html'), 'w').write(html)
json.dump({'id': 'edit', 'name': 'edit'}, open(os.path.join(a.out, 'meta.json'), 'w'))
print(f"edit project -> {a.out}  ({W}x{H}, {D} s, layout {L['mode']}, {len(chunk_list)} caption chunks, {len(gfx)} graphics)")
print(f"  face box in frame: {data['face']}, captions box: {cbox} -> clear of face")
print('\n'.join(report))
