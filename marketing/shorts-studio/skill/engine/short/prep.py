#!/usr/bin/env python3
"""Short mode: lay out work/hf (the HyperFrames project) and the media the page reads.

usage: prep.py <project> [--force]

- hf skeleton: gsap.min.js, hyperframes.json, package.json, meta.json, fonts/ (the style's Google Fonts, downloaded once: fonts.css)
- media/full.mp4 and media/split.mp4 from work/base-full.mp4 and work/base-split.mp4 (H.264, -g 30, so every seek lands)
- every entry of edit.json "media" ({"launch.mp4": "/path/to/source.mp4"}) re-encoded with -g 15
- every entry of edit.json "assets" ({"montage/m1.jpg": "/path"} or {"montage": "/dir"}) copied into hf/assets/
Existing files are kept unless --force.
"""
import json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'shared'))
import jy

def rel(E, src):
    src = os.path.expanduser(src)
    return src if os.path.isabs(src) else jy.P(E, src)


def fonts_css(style, hf, force=False):
    """download the style's fonts (Google Fonts, free licences) so renders never depend on the network."""
    import re, urllib.request
    out = os.path.join(hf, 'fonts.css')
    if os.path.exists(out) and not force: return
    css_all = []
    for role, fam, spec in (('main', style.get('font', 'Manrope'), 'wght@400..800'), ('accent', style.get('font_accent', 'Instrument Serif'), 'ital@1')):
        url = f"https://fonts.googleapis.com/css2?family={fam.replace(' ', '+')}:{spec}&display=swap"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'})
            css = urllib.request.urlopen(req, timeout=20).read().decode()
        except Exception:
            url = f"https://fonts.googleapis.com/css2?family={fam.replace(' ', '+')}&display=swap"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'})
            css = urllib.request.urlopen(req, timeout=20).read().decode()
        for k, u in enumerate(sorted(set(re.findall(r'url\((https://[^)]+)\)', css)))):
            fn = f'{role}-{k}' + os.path.splitext(u.split('?')[0])[1]
            urllib.request.urlretrieve(u, os.path.join(hf, 'fonts', fn))
            css = css.replace(u, 'fonts/' + fn)
        css_all.append(css.replace(f"font-family: '{fam}'", f"font-family: '{role}-font'"))
    open(out, 'w').write('\n'.join(css_all))


def enc(src, dst, crf, g, force):
    # rebuild when the source is newer (26 Oct: a stale split.mp4 from the old cut put his lips 1.37 s off the voice)
    if os.path.exists(dst) and not force and os.path.getmtime(dst) >= os.path.getmtime(src): return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-an', '-c:v', 'libx264', '-crf', str(crf), '-preset', 'medium', '-g', str(g),
                    '-pix_fmt', 'yuv420p', dst], check=True)

def main(project, force=False):
    E = jy.load_edit(project); hf = jy.P(E, 'work', 'hf')
    for d in ('fonts', 'media', 'assets'): os.makedirs(os.path.join(hf, d), exist_ok=True)
    for f in ('gsap.min.js', 'hyperframes.json'): shutil.copy(jy.skill('shared', 'hf', f), os.path.join(hf, f))
    name = f"{E.get('name', 'short')}-r{E.get('round', 0)}"
    json.dump(dict(name=name, private=True, type='module', scripts=dict(dev=f'npx --yes {jy.HF} preview', check=f'npx --yes {jy.HF} check',
              render=f'npx --yes {jy.HF} render')), open(os.path.join(hf, 'package.json'), 'w'), indent=2)
    json.dump(dict(id=name, name=name), open(os.path.join(hf, 'meta.json'), 'w'), indent=2)
    fonts_css(E.get('style', {}), hf, force)
    wd = jy.P(E, 'work')
    if os.path.exists(os.path.join(wd, 'base-full.mp4')):
        dst = os.path.join(hf, 'media', 'full.mp4')
        if force or not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(os.path.join(wd, 'base-full.mp4')):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(wd, 'base-full.mp4'), '-an', '-c:v', 'copy', dst], check=True)  # trim.py already wrote -g 30
    if os.path.exists(os.path.join(wd, 'base-split.mp4')):
        enc(os.path.join(wd, 'base-split.mp4'), os.path.join(hf, 'media', 'split.mp4'), 14, 30, force)
    for dst, src in E.get('media', {}).items():
        enc(rel(E, src), os.path.join(hf, 'media', dst), 17, 15, force)
    for dst, src in E.get('assets', {}).items():
        src = rel(E, src); out = os.path.join(hf, 'assets', dst)
        if os.path.isdir(src): shutil.copytree(src, out, dirs_exist_ok=True)
        else: os.makedirs(os.path.dirname(out), exist_ok=True); shutil.copy(src, out)
    print('hf ready:', hf)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    main(a[0], '--force' in a)
