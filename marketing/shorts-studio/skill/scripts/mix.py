"""mix.py: finish the sound. Levels the voice to -14 LUFS and, if you give it one, lays a music bed under it.

usage: python3 scripts/mix.py <final.mp4> --out <final-mixed.mp4> [--music bed.mp3] [--bed -14]

- Voice: gentle clean-up (low cut at 80 Hz, light compression), then loudness to -14 LUFS, peak -1 dBTP.
- Music (optional): looped to length, starts at 0 s, sits about 14 dB under the voice, dips further while
  you talk (side-chain), fades out over the last 0.8 s.
- Use music you have the rights to (your own library, or a free licence such as Pixabay or YouTube Audio Library).
The video stream is copied, never re-encoded."""
import argparse, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--out', required=True)
ap.add_argument('--music')
ap.add_argument('--bed', type=float, default=-14.0, help='music level under the voice, dB')
a = ap.parse_args()
D = probe(a.video)['dur']
voice = 'highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2'
if a.music:
    fade = max(0.0, D - 0.8)
    fc = (f"[0:a]{voice},asplit=2[v][key];"
          f"[1:a]volume={a.bed}dB,atrim=0:{D:.3f},afade=t=out:st={fade:.3f}:d=0.8[m];"
          f"[m][key]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[duck];"
          f"[v][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[out]")
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-stream_loop', '-1', '-i', a.music,
           '-filter_complex', fc, '-map', '0:v', '-map', '[out]']
else:
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-af', voice + ',loudnorm=I=-14:TP=-1.5:LRA=11',
           '-map', '0:v', '-map', '0:a']
cmd += ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', a.out]
subprocess.run(cmd, check=True)
print(f"mixed: {a.out}" + (f" (music bed {a.bed} dB, ducked under the voice)" if a.music else " (voice only)"))
