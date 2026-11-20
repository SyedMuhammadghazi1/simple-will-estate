"""follow_cut.py: give a second video (your screen recording) the exact same cuts as your edit.

usage: python3 scripts/follow_cut.py <screen.mp4> --edl <work>/edl.json --out <work>/screen-cut.mp4

After silence_cut.py, your talking video is shorter. This trims the screen recording in the same places,
so second 12 of screen-cut.mp4 shows what was on screen when you said the words at second 12 of cut.mp4.
Then use it as a media graphic with "sync": true (see references/LAYOUTS.md)."""
import argparse, json, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--edl', required=True)
ap.add_argument('--out', required=True)
a = ap.parse_args()
pieces = json.load(open(a.edl))['pieces']
parts = ''.join(f"[0:v]trim={p['src_in']}:{p['src_out']},setpts=PTS-STARTPTS[v{i}];" for i, p in enumerate(pieces))
fc = parts + ''.join(f'[v{i}]' for i in range(len(pieces))) + f'concat=n={len(pieces)}:v=1:a=0[v]'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-filter_complex', fc, '-map', '[v]', '-an',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', a.out], check=True)
print(f"screen follows the cut: {len(pieces)} pieces -> {a.out}")
