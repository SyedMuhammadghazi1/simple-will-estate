"""fix_words.py: correct words the speech model heard wrong (names, products, jargon) before they become captions.

usage: python3 scripts/fix_words.py <work>/words_raw.json --fix '{"Agenta": "Agentic", "QS": "OS"}' [--at '{"175": "agentic"}']

--fix  replaces a word everywhere it appears (matched without punctuation, case kept from your spelling).
--at   replaces one word by its number (#n from captions.py), for one-off mistakes.
Punctuation that was on the old word stays on the new one. The file is updated in place."""
import argparse, json, re

ap = argparse.ArgumentParser()
ap.add_argument('words')
ap.add_argument('--fix', default='{}')
ap.add_argument('--at', default='{}')
a = ap.parse_args()
ws = json.load(open(a.words)); fix = json.loads(a.fix); at = {int(k): v for k, v in json.loads(a.at).items()}
core = lambda t: re.sub(r"^[^\w']+|[^\w']+$", '', t)
n = 0
for w in ws:
    c = core(w['text'])
    new = at.get(w['i']) or fix.get(c)
    if new and new != c:
        w['text'] = w['text'].replace(c, new, 1) if c else new
        n += 1
json.dump(ws, open(a.words, 'w'), indent=0)
print(f"fixed {n} word(s) in {a.words}")
