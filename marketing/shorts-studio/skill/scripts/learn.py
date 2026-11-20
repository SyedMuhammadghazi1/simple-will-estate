"""learn.py: your notes become your rules. The system gets better every Short you make.

usage:
  python3 scripts/learn.py note "<your exact words>" --short <name> [--t 4-7] [--tags pacing,sound]
  python3 scripts/learn.py rules                 # print your rules (Claude reads these before every edit)
  python3 scripts/learn.py repeats               # notes that came up 2+ times: make them rules
  python3 scripts/learn.py promote "<the rule>" --because "<the note it came from>"

Everything lives in ~/.shorts-studio/ (notes.jsonl and MY-RULES.md), outside this skill, so updates never wipe it."""
import argparse, collections, datetime, json, os, re

HOME = os.path.expanduser(os.environ.get('SHORTS_STUDIO_HOME', '~/.shorts-studio'))
os.makedirs(HOME, exist_ok=True)
NOTES, RULES = os.path.join(HOME, 'notes.jsonl'), os.path.join(HOME, 'MY-RULES.md')
ap = argparse.ArgumentParser()
ap.add_argument('cmd', choices=['note', 'rules', 'repeats', 'promote'])
ap.add_argument('text', nargs='?')
ap.add_argument('--short', default='')
ap.add_argument('--t', default='')
ap.add_argument('--tags', default='')
ap.add_argument('--because', default='')
a = ap.parse_args()
now = datetime.date.today().isoformat()
if a.cmd == 'note':
    rec = {'date': now, 'short': a.short, 't': a.t, 'tags': [x for x in a.tags.split(',') if x], 'note': a.text}
    open(NOTES, 'a').write(json.dumps(rec) + '\n')
    print(f"saved note -> {NOTES}")
elif a.cmd == 'rules':
    print(open(RULES).read() if os.path.exists(RULES) else 'No rules yet. They start from your notes.')
elif a.cmd == 'repeats':
    notes = [json.loads(l) for l in open(NOTES)] if os.path.exists(NOTES) else []
    tags = collections.Counter(t for n in notes for t in n['tags'])
    for t, c in tags.most_common():
        if c >= 2:
            print(f"{t} ({c} notes):")
            for n in notes:
                if t in n['tags']:
                    print(f"   {n['date']} {n['short']} {n['t']}: \"{n['note']}\"")
    if not any(c >= 2 for c in tags.values()):
        print('Nothing repeats yet.')
elif a.cmd == 'promote':
    n = len(re.findall(r'^\d+\. ', open(RULES).read(), re.M)) + 1 if os.path.exists(RULES) else 1
    if n == 1:
        open(RULES, 'w').write('# My rules\n\nRead these before every edit. Newest wins if two disagree.\n\n')
    open(RULES, 'a').write(f"{n}. {a.text}" + (f" (from: \"{a.because}\", {now})" if a.because else f" ({now})") + '\n')
    print(f"rule {n} saved -> {RULES}")
