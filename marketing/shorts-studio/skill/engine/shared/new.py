#!/usr/bin/env python3
"""Start a project folder for one round.

usage:
  new.py short <dir> --name <name> --round <N> [--from <previous round dir>]
  new.py long  <dir> --name <name> --round <N> [--from <previous round dir>]

Creates <dir>/edit.json (a template to fill, or the previous round's with round + 1), work/, deliver/, and:
  Short: work/scenes.js (copy blocks into it from short/scenes/claude-motion-r8.js), work/hf via prep.py later.
  Long:  work/build.py (a copy of long/examples/grokbot_intro_r8.py to edit), work/hf/ with fonts and the HyperFrames files.
With --from it copies the previous round's edit.json, scene code or build.py, words, trim and media links, so a new round
starts from the last one plus the notes (learn/notes.jsonl). It never edits the previous round's folder.
"""
import json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jy

SHORT = dict(mode='short', name='', round=1, title='', fps=30, size=[1080, 1920], timeline='final',
             note='Fill from the director pass (beats.md). layout = [start s, end s, "split"|"anim"|"broll"|"jack", scene id]. See PROJECT.md.',
             layout=[], end_card=None, footage=[], captions=dict(chunks='auto', display={'ai': 'AI'}, join_slash=True, y={'split': 960, 'other': 1306}),
             scenes=['work/scenes.js'], media={}, assets={},
             audio=dict(voice='work/cut_audio_enhanced.wav', voice_is_pretrim=True, music=None), gate=dict(project=''))
LONG = dict(mode='long', name='', round=1, title='', fps=30, size=[1920, 1080], frames=0, build='work/build.py',
            note='frames = length of the cut at 30 fps. footage = [first frame, last frame, shot, what] for every REAL footage window (the gate skips them). See PROJECT.md.',
            footage=[], audio=dict(voice='work/voice-aligned.wav', music=None), gate=dict(project=''))


def main(a):
    mode, d = a[0], os.path.abspath(os.path.expanduser(a[1])); opt = lambda k, df=None: a[a.index(k) + 1] if k in a else df
    if os.path.exists(os.path.join(d, 'edit.json')): print('exists:', d); return 1
    for sub in ('work', 'deliver', 'work/hf'): os.makedirs(os.path.join(d, sub), exist_ok=True)
    prev = os.path.abspath(os.path.expanduser(opt('--from'))) if opt('--from') else None
    E = json.load(open(os.path.join(prev, 'edit.json'))) if prev else dict(SHORT if mode == 'short' else LONG)
    E.update(name=opt('--name', E.get('name')), round=int(opt('--round', E.get('round', 0) + 1 if prev else 1)))
    E['gate'] = dict(E.get('gate') or {}, project=E['gate'].get('project') or E['name'])
    if prev:
        E['note'] = f"Round {E['round']} = {os.path.basename(prev)} plus the notes in learn/notes.jsonl. " + E.get('note', '')
        for f in ('work/words_pre.json', 'work/words_final.json', 'work/words.json', 'work/trim.json', 'work/edl.json', 'work/scenes.js', 'work/build.py', 'beats.md'):
            if os.path.exists(os.path.join(prev, f)): shutil.copy(os.path.join(prev, f), os.path.join(d, f))
        for f in ('work/cut_audio.wav', 'work/cut_audio_enhanced.wav', 'work/voice-aligned.wav', 'work/clean16.wav', 'work/bases_pre'):
            s = os.path.join(prev, f)
            if os.path.exists(s) and not os.path.exists(os.path.join(d, f)): os.symlink(os.path.realpath(s), os.path.join(d, f))
        if mode == 'long' and os.path.exists(os.path.join(prev, 'work/hf/assets')):
            shutil.copytree(os.path.join(prev, 'work/hf/assets'), os.path.join(d, 'work/hf/assets'), dirs_exist_ok=True)
    elif mode == 'short':
        open(os.path.join(d, 'work', 'scenes.js'), 'w').write('// Scenes for this Short. Copy blocks from ~/.claude/skills/jack-youtube/short/scenes/claude-motion-r8.js\n'
                                                            '// (each block names the reference frame it copies) and change words (word indexes), times and assets.\n')
    else:
        shutil.copy(jy.skill('long', 'examples', 'grokbot_intro_r9.py'), os.path.join(d, 'work', 'build.py'))   # the newest worked example (imports the r8 one)
        shutil.copy(jy.skill('long', 'examples', 'grokbot_intro_r8.css'), os.path.join(d, 'work', 'grokbot_intro_r8.css'))
    if mode == 'long':
        os.makedirs(os.path.join(d, 'work/hf/assets/fonts'), exist_ok=True); os.makedirs(os.path.join(d, 'work/hf/assets/media'), exist_ok=True)
        for f in os.listdir(jy.skill('shared', 'fonts')): shutil.copy(jy.skill('shared', 'fonts', f), os.path.join(d, 'work/hf/assets/fonts', f))
        shutil.copy(jy.skill('shared', 'hf', 'hyperframes.json'), os.path.join(d, 'work/hf/hyperframes.json'))
        json.dump(dict(name=f"{E['name']}-r{E['round']}", private=True, type='module'), open(os.path.join(d, 'work/hf/package.json'), 'w'), indent=2)
    json.dump(E, open(os.path.join(d, 'edit.json'), 'w'), indent=1)
    print('new', mode, 'project:', d, '| next:', 'put the cut into work/ (see PROJECT.md), then shared/director.py draft' if not prev else 'apply the notes, then shared/run.py')
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    sys.exit(main(a))
