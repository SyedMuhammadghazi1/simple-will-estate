"""gate.py: the checks every Short must pass before anyone watches it.

usage: python3 scripts/gate.py --project <edit project> --final <final.mp4> [--long]

Reads the build (window.EDIT in <project>/index.html) and the rendered file. Prints PASS / WARN / FAIL
per check and a verdict. Exit 0 = ship it, 1 = fix the FAIL lines first. The numbers come from
references/RULES.md (55 viral Reels measured in Oct 2026, plus our own rounds of notes)."""
import argparse, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe

ap = argparse.ArgumentParser()
ap.add_argument('--project', required=True)
ap.add_argument('--final', required=True)
ap.add_argument('--long', action='store_true', help='a long-form edit: skip the Short-only checks')
a = ap.parse_args()
html = open(os.path.join(a.project, 'index.html')).read()
E = json.loads(re.search(r'window\.EDIT = (\{.*?\});</script>', html, re.S).group(1))
chunks, gfx, D = E['chunks'], E['graphics'], E['D']
rows = []
def row(level, name, msg):
    rows.append((level, name, msg))

info = probe(a.final)
if not a.long:
    if info['w'] * 16 != info['h'] * 9:
        row('FAIL', 'format', f"{info['w']}x{info['h']} is not 9:16")
    else:
        row('PASS', 'format', f"{info['w']}x{info['h']}")
    L = info['dur']
    row('PASS' if 15 <= L <= 60 else ('WARN' if L <= 90 else 'FAIL'), 'length',
        f"{L:.1f} s (the viral middle is 27 to 62 s; most land near 39 s)")

    words = [w for c in chunks for w in c['words']]
    first = words[0]['start'] if words else 99
    row('PASS' if first <= 0.5 else 'FAIL', 'talk from frame 0', f"first word at {first:.2f} s (aim: by 0.5 s)")
    n3 = sum(1 for w in words if w['start'] < 3.0)
    row('PASS' if n3 >= 7 else 'WARN', 'words in 0 to 3 s', f"{n3} (viral norm about 10)")
    text_t = min([c['t0'] for c in chunks] + [g['t'] for g in gfx] + [99])
    row('PASS' if text_t <= 1.0 else 'FAIL', 'words on screen', f"first text at {text_t:.2f} s (aim: by 1.0 s)")
    move_t = min([g['t'] for g in gfx] + [c['t0'] for c in chunks] + [99])
    row('PASS' if move_t <= 0.7 else 'WARN', 'first movement', f"at {move_t:.2f} s (viral norm 0.2 s)")
    title = [g for g in gfx if g['t'] <= 1.0 and g['type'] in ('title', 'media', 'stat')]
    row('PASS' if title else 'WARN', 'hook visual', 'a title, number or proof is on screen in the first second'
        if title else 'no title, number or proof in the first second (36 of 55 viral Reels show a headline)')

# captions never stack on top of each other
bad = [c for k, c in enumerate(chunks) if c['t1'] <= c['t0'] or (k + 1 < len(chunks) and c['t1'] > chunks[k + 1]['t0'] + 0.01)]
row('FAIL' if bad else 'PASS', 'captions one at a time',
    f"{len(bad)} caption line(s) overlap the next one, first at {bad[0]['t0']:.1f} s" if bad else 'every caption line leaves before the next arrives')

# words per card
for g in gfx:
    txt = ' '.join(str(g.get(k, '')) for k in ('text', 'label', 'sub')).replace('**', '')
    n = len(txt.split())
    if g['type'] != 'media' and n > 6:
        row('FAIL', 'words per card', f"{g['type']} at {g['t']:.1f} s has {n} words: \"{txt}\" (6 at most)")
if not any(r[1] == 'words per card' for r in rows):
    row('PASS', 'words per card', 'every card has 6 words or fewer')

# one card at a time, spacing between cards
cards = sorted([g for g in gfx if g['type'] in ('stat', 'callout')], key=lambda g: g['t'])
gaps = [cards[i]['t'] - cards[i - 1]['t'] for i in range(1, len(cards))]
row('PASS' if all(x >= 2.5 for x in gaps) else 'WARN', 'card spacing',
    f"{len(cards)} cards, closest {min(gaps):.1f} s apart" if gaps else f"{len(cards)} card(s)")
row('PASS', 'face clear', 'the builder refuses any layout that covers the face')

# the ending
end = [g for g in gfx if g['type'] == 'end']
for g in end:
    if g['hold'] < 1.5:
        row('FAIL', 'end card time', f"the end card is up {g['hold']:.1f} s; give it 1.5 s or more (start it earlier)")
tail = ' '.join(w['text'] for c in chunks for w in c['words'] if w['start'] > D - 6).lower()
if end or re.search(r'\b(comment|follow|subscribe|link|save)\b', tail):
    row('PASS', 'ending', 'ends on an ask (37 of 55 viral Reels end on "comment a word")')
else:
    row('WARN', 'ending', 'no ask in the last 6 s. Add an end card ("Comment WORD") or say it')

# sound
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', a.final, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                   capture_output=True, text=True).stderr
lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', r)
peak = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)
if lufs:
    I = float(lufs[-1]); P = float(peak[-1]) if peak else 0
    ok = -15.5 <= I <= -12.5 and P <= -0.9
    row('PASS' if ok else 'WARN', 'loudness', f"{I:.1f} LUFS, peak {P:.1f} dBTP (aim -14 LUFS, -1 dBTP; scripts/mix.py fixes it)")

# pacing, from the pixels
pc = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'pacing_check.py'), a.final,
                     '--max-gap', '1.5' if not a.long else '3.0'], capture_output=True, text=True)
last = [l for l in pc.stdout.splitlines() if l.strip()][-3:]
row('PASS' if pc.returncode == 0 else 'FAIL', 'pacing', ' / '.join(last) if last else 'see the pacing report')

w = max(len(r[1]) for r in rows)
for lv, n, m in rows:
    print(f"{lv:4s}  {n:<{w}}  {m}")
fails = sum(1 for r in rows if r[0] == 'FAIL'); warns = sum(1 for r in rows if r[0] == 'WARN')
print(f"\nGATE {'PASS' if not fails else 'FAIL'}: {len(rows) - fails - warns} pass, {warns} warn, {fails} fail")
json.dump([{'level': r[0], 'check': r[1], 'detail': r[2]} for r in rows],
          open(os.path.splitext(a.final)[0] + '-gate.json', 'w'), indent=1)
sys.exit(1 if fails else 0)
