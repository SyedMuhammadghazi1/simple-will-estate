#!/usr/bin/env python3
"""Run the build steps for a project in order (Short or Long, from edit.json).

usage: run.py <project> [--until SECONDS] [--from STEP] [--only STEP[,STEP]] [--workers N]

Short:  trim -> prep -> gen -> check (DOM spacing + sync + event logs) -> render (final, graphics, captions) -> audio -> gate -> pack
Long:   build (final, background, jack, graphics pages) -> render -> sync -> audio -> gate -> pack
--until renders only the first N seconds (smoke tests). --from skips the steps before it (e.g. --from audio after a sound note).
Stops at the first failing step, except the gate (a failing gate is reported; fix and run again).
The director pass (beats.md) and the scene code are written before this, by you: see SKILL.md steps 2 and 3.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jy

def main(a):
    project = os.path.abspath(a[0]); opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    E = jy.load_edit(project); mode = E['mode']; U = ['--until', opt('--until')] if opt('--until') else []
    env = dict(os.environ, WORKERS=opt('--workers', os.environ.get('WORKERS', '6')))
    py = sys.executable; S = lambda *p: jy.skill(*p)
    build = os.path.expanduser(E.get('build', jy.P(E, 'work', 'build.py')))
    steps = dict(short=[
        ('trim', [py, S('short', 'trim.py'), project]),
        ('prep', [py, S('short', 'prep.py'), project]),
        ('gen', [py, S('short', 'gen.py'), project] + U),
        ('check', ['node', S('short', 'checks', 'bbox_check.mjs'), project]),
        ('render', ['bash', S('short', 'render.sh'), project, 'final', 'graphics', 'captions']),
        ('audio', [py, S('audio', 'stems.py'), project] + U),
        ('gate', [py, S('shared', 'gate.py'), project] + U),
        ('pack', [py, S('pack', 'pack.py'), project] + U)],
        long=[('build', None),
        ('render', ['bash', S('long', 'render.sh'), project, 'final', 'background', 'jack', 'graphics']),
        ('sync', [py, S('long', 'sync.py'), project] + U),
        ('audio', [py, S('audio', 'stems.py'), project] + U),
        ('gate', [py, S('shared', 'gate.py'), project] + U),
        ('pack', [py, S('pack', 'pack.py'), project] + U)])[mode]
    names = [s for s, c in steps]
    start = names.index(opt('--from')) if opt('--from') else 0
    only = opt('--only', '').split(',') if opt('--only') else None
    names_skip = set()
    if mode == 'short' and not os.path.exists(jy.P(E, 'work', 'words_pre.json')):
        print('no work/words_pre.json: skipping trim (words_final.json and trim.json must exist)'); names_skip.add('trim')
    for i, (name, cmd) in enumerate(steps):
        if i < start or (only and name not in only) or name in names_skip: continue
        print(f'\n===== {name}')
        if name == 'build':
            for m in ('final', 'background', 'jack', 'graphics'):
                rc = subprocess.run([py, build, project, '--mode', m] + U).returncode
                if rc: print('build failed'); return rc
            continue
        rc = subprocess.run(cmd, env=env).returncode
        if rc and name not in ('gate', 'check', 'sync'): print(f'step {name} failed (exit {rc})'); return rc
        if rc: print(f'step {name}: FAIL reported above (fix it, then run again)')
    print('\ndone:', jy.tilde(jy.P(E, 'deliver')))
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    sys.exit(main(a))
