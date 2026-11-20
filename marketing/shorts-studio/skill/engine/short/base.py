#!/usr/bin/env python3
"""Short mode: the editor's bottom layer. One 1080x1920 file with only Jack, placed exactly as in the final:
full speaker in "jack" windows, the split speaker panel at y 960 in "split" windows, white everywhere else.

usage: base.py <project> [--until SECONDS]

Reads work/design.json (layout windows) and work/base-full.mp4 + work/base-split.mp4. Writes work/renders/base.mp4.
Stack for the editor: base.mp4 -> graphics (alpha) -> captions (alpha) = final (layertest in pack.py proves it).
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

def main(project, until=None):
    E = jy.load_edit(project); WD = jy.P(E, 'work')
    D = json.load(open(os.path.join(WD, 'design.json')))
    T = min(D['T'], until) if until else D['T']
    fps = E.get('fps', 30)
    def wins(ty):
        w = []
        for a, b, t_, sc in D['layout']:
            if t_ != ty or a >= T: continue
            if w and abs(w[-1][1] - a) < 1e-6: w[-1][1] = b
            else: w.append([a, b])
        return w
    # frame-exact enables: a window [a, b) shows frames round(a*fps) .. round(b*fps)-1
    en = lambda ws: '+'.join(f'between(n,{round(a * fps)},{round(b * fps) - 1})' for a, b in ws) or '0'
    fc = (f"color=c=white:s=1080x1920:r={fps}:d={T}[bg];"
          f"[1:v]setpts=N/({fps}*TB)[sp];[2:v]setpts=N/({fps}*TB)[fu];"
          f"[bg][sp]overlay=0:960:eof_action=pass:enable='{en(wins('split'))}'[a];"
          f"[a][fu]overlay=0:0:eof_action=pass:enable='{en(wins('jack'))}',format=yuv420p[v]")
    out = os.path.join(WD, 'renders', 'base.mp4'); os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=white:s=16x16:r={fps}:d=0.1',
                    '-i', os.path.join(WD, 'base-split.mp4'), '-i', os.path.join(WD, 'base-full.mp4'),
                    '-filter_complex', fc.replace('color=c=white:s=1080x1920', 'color=c=white:s=1080x1920', 1), '-map', '[v]', '-t', str(T), '-r', str(fps),
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-g', str(fps), '-pix_fmt', 'yuv420p', out], check=True)
    print('base ->', out, 'split windows', len(wins('split')), 'jack windows', len(wins('jack')))


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a[0], float(a[a.index('--until') + 1]) if '--until' in a else None)
