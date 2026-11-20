"""sync.py: use the picture from one recording and the sound from another, perfectly in time.

usage: python3 scripts/sync.py --video <camera.mov> --audio <screen-recording.mov> --out <work dir>

Typical setup: the camera films you, but the good microphone is recorded by the screen recorder.
This lines the two up by matching the shape of your voice in both files (to the millisecond), then writes:
  <work>/synced.mp4   camera picture + the good microphone, only the part both files cover
  <work>/screen.mp4   the screen recording, trimmed to the same moment (use it as proof on screen)
  <work>/sync.json    the offset and how sure the match is
If the match score is low (under 0.3) the two files are probably not the same take: it stops and says so."""
import argparse, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sync import load, env_db, lag_ms, SR
from _media import probe

ap = argparse.ArgumentParser()
ap.add_argument('--video', required=True, help='the file whose picture you want (usually the camera)')
ap.add_argument('--audio', required=True, help='the file whose sound you want (usually the screen recording)')
ap.add_argument('--out', required=True)
ap.add_argument('--max-offset', type=float, default=60, help='largest start difference to search, seconds')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
cam, mic = load(a.video), load(a.audio)
lag, score = lag_ms(env_db(cam), env_db(mic), int(a.max_offset * 1000))
# mic[t + lag] ~ cam[t]  ->  camera time t plays with mic time t + lag
off = lag / 1000.0
dv, da = probe(a.video)['dur'], probe(a.audio)['dur']
t_cam0 = max(0.0, -off)
t_mic0 = t_cam0 + off
length = min(dv - t_cam0, da - t_mic0)
rep = {'video': a.video, 'audio': a.audio, 'offset_s': round(off, 3), 'score': round(score, 3),
       'camera_from': round(t_cam0, 3), 'screen_from': round(t_mic0, 3), 'length_s': round(length, 3)}
json.dump(rep, open(os.path.join(a.out, 'sync.json'), 'w'), indent=1)
if score < 0.3:
    sys.exit(f"The voices do not match well (score {score:.2f}). Are these two files the same take?")
enc = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p']
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t_cam0:.3f}', '-i', a.video, '-ss', f'{t_mic0:.3f}', '-i', a.audio,
                '-t', f'{length:.3f}', '-map', '0:v:0', '-map', '1:a:0', *enc, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
                os.path.join(a.out, 'synced.mp4')], check=True)
has_video = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=index', '-of', 'csv=p=0',
                            a.audio], capture_output=True, text=True).stdout.strip()
if has_video:
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t_mic0:.3f}', '-i', a.audio, '-t', f'{length:.3f}', '-an', *enc,
                    os.path.join(a.out, 'screen.mp4')], check=True)
# check: the new file's sound lines up with the camera's own sound
chk, _ = lag_ms(env_db(load(a.video)[int(t_cam0 * SR):int((t_cam0 + min(length, 60)) * SR)]),
                env_db(load(os.path.join(a.out, 'synced.mp4'))[:int(min(length, 60) * SR)]), 500)
rep['check_lag_ms'] = chk
json.dump(rep, open(os.path.join(a.out, 'sync.json'), 'w'), indent=1)
print(f"synced: offset {off:+.3f} s (match {score:.2f}), {length:.1f} s, check lag {chk} ms "
      f"({'OK' if abs(chk) <= 20 else 'CHECK BY EAR'}) -> {a.out}/synced.mp4" + (" + screen.mp4" if has_video else ''))
