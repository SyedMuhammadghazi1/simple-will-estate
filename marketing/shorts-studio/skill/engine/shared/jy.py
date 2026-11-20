"""shorts-studio engine helpers (ported from the jack-youtube system): project config, paths, ffmpeg/ffprobe, loudness, the Python envs.

A project is one folder per round, e.g. ~/code/<name>-r<N>/ with:
  edit.json   the director's decisions (mode, layout windows, footage, captions, audio picks). See PROJECT.md.
  beats.md    the director pass (3 s segments, every scene names the reference frame it copies)
  work/       build files (hf/, comps/, renders/, checks)
  deliver/    what Jack and the editor get (final.mp4, layers, audio stems, editor pack, gate report)
"""
import json, os, subprocess, sys, glob

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser('~')
STUDIO = os.path.join(HOME, '.shorts-studio')                                     # the user's own rules, notes, kit (outside the skill)
GATE = os.path.join(SKILL, '..', 'gate')
VENV_CV = os.path.join(STUDIO, 'venv/bin/python')                                   # numpy + OpenCV + Pillow (gate, face checks)
VENV_AUDIO = VENV_CV
KIT = os.path.join(STUDIO, 'kit')                                                   # the user's sound kit (sfx/, music/)
HF = 'hyperframes@0.8.181'


def load_edit(project):
    p = os.path.join(project, 'edit.json')
    E = json.load(open(p))
    E['_dir'] = os.path.abspath(project)
    return E


def P(E, *parts):
    """path inside the project"""
    return os.path.join(E['_dir'], *parts)


def skill(*parts):
    return os.path.join(SKILL, *parts)


def run(cmd, **kw):
    kw.setdefault('check', True)
    return subprocess.run(cmd, **kw)


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames',
                        '-of', 'json', path], capture_output=True, text=True)
    return json.loads(r.stdout or '{}')


def duration(path):
    return float(probe(path).get('format', {}).get('duration', 0))


def loudness(path):
    """integrated LUFS and true peak dBTP (ffmpeg ebur128)"""
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = r[r.rfind('Summary:'):]
    I = float(tail.split('I:')[1].split('LUFS')[0]); Pk = float(tail.split('Peak:')[1].split('dBFS')[0])
    return I, Pk


def chrome_orphans():
    """headless Chrome main processes whose parent died (PPID 1). Renders must leave none behind."""
    r = subprocess.run(['ps', '-axo', 'pid=,ppid=,command='], capture_output=True, text=True).stdout
    out = []
    for line in r.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[1] == '1' and 'chrome-headless-shell' in parts[2] and '--type=' not in parts[2]:
            out.append(int(parts[0]))
    return out


def tilde(p):
    return p.replace(HOME, '~')


if __name__ == '__main__':
    print('skill', SKILL); print('orphans', chrome_orphans())
