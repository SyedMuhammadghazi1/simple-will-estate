"""auphonic.py: make your voice sound studio clean with Auphonic (optional, but the sound is clearly better).

usage: python3 scripts/auphonic.py <cut.mp4> --out <cut-clean.mp4> [--title "my short"]

What it does: sends only the sound to Auphonic (noise removal, studio voice, levelling, -14 LUFS),
waits, downloads it, lines it up with your video to the millisecond, and puts it back on the video.
Key: AUPHONIC_API_KEY, read from your environment, or a .env file in this folder, or ~/.shorts-studio/.env.
Never paste the key into the chat. Get one at https://auphonic.com (free plan: 2 hours of audio a month).
Run it ONCE per Short, on the final cut (each run uses account credit).
No key? Skip this step. scripts/mix.py still levels your voice, it just will not remove room noise as well."""
import argparse, json, os, re, subprocess, sys, tempfile, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sync import load, env_db, lag_ms, SR

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--out', required=True)
ap.add_argument('--title', default='shorts-studio')
a = ap.parse_args()


def key():
    if os.environ.get('AUPHONIC_API_KEY'):
        return os.environ['AUPHONIC_API_KEY'].strip()
    for f in ('.env', os.path.expanduser('~/.shorts-studio/.env')):
        if os.path.exists(f):
            m = re.search(r'^AUPHONIC_API_KEY=(.+)$', open(f).read(), re.M)
            if m:
                return m.group(1).strip().strip('"\'')
    sys.exit("No Auphonic key. Add a line AUPHONIC_API_KEY=your_key to a file called .env in this folder "
             "(get the key at https://auphonic.com > Account > API Access). Or skip this step.")


K = key()
H = {'Authorization': f'bearer {K}'}


def curl(args, tries=3):
    """curl with the key passed on stdin (never on the command line, so it never shows in ps or in errors)."""
    cfg = f'header = "Authorization: bearer {K}"\n'
    for n in range(tries):
        r = subprocess.run(['curl', '-s', '-L', '--fail', '--config', '-'] + args, input=cfg, capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
        time.sleep(3 * (n + 1))
    sys.exit(f"Auphonic transfer failed after {tries} tries (curl code {r.returncode}). Check your internet and try again.")


def api(method, url, data=None, files=None):
    if files:
        return json.loads(curl(['-X', method, url] + sum((['-F', f'{k}=@{v}'] for k, v in files.items()), [])))
    req = urllib.request.Request(url, method=method, headers={**H, 'Content-Type': 'application/json'},
                                 data=json.dumps(data).encode() if data is not None else None)
    return json.loads(urllib.request.urlopen(req).read())


tmp = tempfile.mkdtemp()
raw = os.path.join(tmp, 'voice.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-vn', '-ac', '2', '-ar', '48000', raw], check=True)
prod = api('POST', 'https://auphonic.com/api/productions.json', {
    'metadata': {'title': a.title}, 'output_files': [{'format': 'wav'}],
    'algorithms': {'leveler': True, 'loudnesstarget': -14, 'denoise': True, 'denoisemethod': 'dynamic',
                   'filtering': True, 'filtermethod': 'studiovoice', 'gate': True}})['data']
uuid = prod['uuid']
api('POST', f'https://auphonic.com/api/production/{uuid}/upload.json', files={'input_file': raw})
api('POST', f'https://auphonic.com/api/production/{uuid}/start.json', {})
print('Auphonic is working on it (usually under 2 minutes)...')
for _ in range(90):
    time.sleep(8)
    d = api('GET', f'https://auphonic.com/api/production/{uuid}.json')['data']
    if d['status'] == 3:
        break
    if d['status'] in (2, 9, 11, 13):
        sys.exit(f"Auphonic failed: {d.get('status_string')} {d.get('error_message', '')}")
else:
    sys.exit('Auphonic took too long. Try again later.')
enh = os.path.join(tmp, 'clean.wav')
curl([d['output_files'][0]['download_url'], '-o', enh])

# line it up: some accounts add an intro jingle, and processing can shift things a little
r, e = env_db(load(raw)), env_db(load(enh))
lag, score = lag_ms(r, e, 15000)
clean = os.path.join(tmp, 'aligned.wav')
start = max(0, lag) / 1000.0
pad = max(0, -lag)
af = f'adelay={pad}|{pad},' if pad else ''
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', enh, '-af', af + 'apad', '-t',
                str(len(load(raw)) / SR), clean], check=True)
resid, _ = lag_ms(r, env_db(load(clean)), 50)
if abs(resid) > 2:
    sys.exit(f"The clean sound did not line up (off by {resid} ms). Nothing was changed.")
final = os.path.join(tmp, 'final' + os.path.splitext(a.out)[1])
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-i', clean, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final], check=True)
if os.path.abspath(a.out) == os.path.abspath(a.video):      # cleaning in place: keep the original next to it
    os.replace(a.video, os.path.splitext(a.video)[0] + '-raw-voice' + os.path.splitext(a.video)[1])
os.replace(final, a.out)
print(f"clean voice: {a.out} (lined up: trimmed {lag} ms, left over {resid} ms)")
