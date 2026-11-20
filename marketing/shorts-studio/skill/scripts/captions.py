"""captions.py: word-by-word transcript of a recording, free and on your own computer.

usage: python3 scripts/captions.py <recording> --out <work dir> [--model small.en] [--language en]

Uses `npx hyperframes transcribe` (whisper.cpp under the hood). The first run downloads a free
speech model (small.en is about 470 MB). If whisper.cpp is missing it tells you the one install command.
Writes <work>/words_raw.json: [{"i", "text", "start", "end"}] in seconds of the ORIGINAL recording,
and prints the transcript with times so you can spot retakes and pick the best take."""
import argparse, json, os, shutil, subprocess, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--out', required=True)
ap.add_argument('--model', default='small.en')
ap.add_argument('--language', default=None)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
tmp = tempfile.mkdtemp()
# whisper reads 16 kHz mono audio; extract it first so long files are quick to pass around
wav = os.path.join(tmp, 'audio.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
cmd = ['npx', '--yes', 'hyperframes@' + os.environ.get('HF_VERSION', '0.8.181'), 'transcribe', wav,
       '-d', tmp, '--model', a.model, '--json']
if a.language:
    cmd += ['--language', a.language]
r = subprocess.run(cmd, capture_output=True, text=True)
path = os.path.join(tmp, 'transcript.json')
if not os.path.exists(path):
    for line in r.stdout.splitlines():
        try:
            path = json.loads(line).get('transcriptPath') or path
        except Exception:
            pass
if r.returncode != 0 or not os.path.exists(path):
    print('Transcription did not work.')
    print((r.stderr or r.stdout)[-800:])
    if 'whisper' in (r.stderr + r.stdout).lower():
        print('Fix: brew install whisper-cpp   (then run this again)')
    sys.exit(1)
words = json.load(open(path))
words = words if isinstance(words, list) else words.get('words', [])
out = [{'i': i, 'text': w['text'].strip(), 'start': round(float(w['start']), 3), 'end': round(float(w['end']), 3)}
       for i, w in enumerate(words) if w.get('text', '').strip()]
json.dump(out, open(os.path.join(a.out, 'words_raw.json'), 'w'), indent=0)
shutil.rmtree(tmp, ignore_errors=True)

# print it in lines broken at pauses, with times, for reading
line, t0 = [], None
for k, w in enumerate(out):
    if t0 is None:
        t0 = w['start']
    line.append(f"{w['text']}#{w['i']}")
    gap = out[k + 1]['start'] - w['end'] if k + 1 < len(out) else 9
    if gap > 0.6 or len(line) >= 14:
        print(f"[{t0:7.2f} - {w['end']:7.2f}] " + ' '.join(line))
        line, t0 = [], None
print(f"\n{len(out)} words -> {os.path.join(a.out, 'words_raw.json')}  (#n is the word number)")
