"""export_edit.py: render the edit and put the original sound back on it.

usage: python3 scripts/export_edit.py --project <edit project> --work <work dir> --out <final.mp4> [--quality high] [--nle]

- Renders the project (video + captions + graphics) with HyperFrames.
- Copies the sound from <work>/cut.mp4 onto it, so the audio is untouched and in sync.
- --nle also writes files for Premiere Pro or DaVinci Resolve, next to --out:
    <name>-overlay.mov   graphics only, with a transparent background
    <name>.xml           the cut as a timeline (Final Cut Pro 7 XML, which Premiere and Resolve import)
    <name>.srt           captions you can still edit"""
import argparse, json, os, shutil, subprocess, sys
from urllib.parse import quote
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe

ap = argparse.ArgumentParser()
ap.add_argument('--project', required=True)
ap.add_argument('--work', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--quality', default='high')
ap.add_argument('--nle', action='store_true')
a = ap.parse_args()
HF = ['npx', '--yes', 'hyperframes@' + os.environ.get('HF_VERSION', '0.8.181')]
out = os.path.abspath(a.out)
os.makedirs(os.path.dirname(out), exist_ok=True)
silent = out[:-4] + '-silent.mp4'
subprocess.run(HF + ['render', a.project, '-o', silent, '-q', a.quality, '--quiet'], check=True)
cut = os.path.join(a.work, 'cut.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', silent, '-i', cut, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], check=True)
os.remove(silent)
i = probe(out)
print(f"final: {out} ({i['w']}x{i['h']}, {i['dur']:.2f} s, with sound)")

if not a.nle:
    sys.exit(0)

base = out[:-4]
overlay = base + '-overlay.mov'
subprocess.run(HF + ['render', a.project, '-o', overlay, '--format', 'mov', '--quiet',
                     '--variables', json.dumps({'base': 'off', 'captions': 'off'})], check=True)
srt = os.path.join(a.work, 'captions.srt')
if os.path.exists(srt):
    shutil.copyfile(srt, base + '.srt')

edl = json.load(open(os.path.join(a.work, 'edl.json')))
fps = edl['fps']
tb = int(round(fps))
ntsc = 'TRUE' if abs(fps - tb) > 0.01 else 'FALSE'
F = lambda s: int(round(s * fps))
rate = f'<rate><timebase>{tb}</timebase><ntsc>{ntsc}</ntsc></rate>'
src = edl['source']
src_url = 'file://' + quote(src)
ov = probe(overlay)
seq_len = F(edl['cut_duration'])
src_len = F(edl['source_duration'])
W, H = ov['w'], ov['h']


def fileref(first, fid, path, dur, w, h, audio):
    if not first:
        return f'<file id="{fid}"/>'
    au = '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>' if audio else ''
    return (f'<file id="{fid}"><name>{os.path.basename(path)}</name><pathurl>{"file://" + quote(path)}</pathurl>{rate}'
            f'<duration>{dur}</duration><media><video><samplecharacteristics>{rate}<width>{w}</width><height>{h}</height>'
            f'<pixelaspectratio>square</pixelaspectratio></samplecharacteristics></video>{au}</media></file>')


scale = round(100 * max(W / edl['width'], H / edl['height']), 2)
motion = ('<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory>'
          '<effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>scale</parameterid>'
          f'<name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>{scale}</value></parameter></effect></filter>')
v1, a1, a2 = [], [], []
for k, p in enumerate(edl['pieces']):
    st, en, si, so = F(p['rec_in']), F(p['rec_out']), F(p['src_in']), F(p['src_out'])
    common = f'<name>{os.path.basename(src)}</name><enabled>TRUE</enabled><duration>{src_len}</duration>{rate}<start>{st}</start><end>{en}</end><in>{si}</in><out>{so}</out>'
    v1.append(f'<clipitem id="v{k}">{common}{fileref(k == 0, "src", src, src_len, edl["width"], edl["height"], True)}{motion}</clipitem>')
    for lst, ch in ((a1, 1), (a2, 2)):
        lst.append(f'<clipitem id="a{ch}_{k}">{common}<file id="src"/><sourcetrack><mediatype>audio</mediatype><trackindex>{ch}</trackindex></sourcetrack></clipitem>')
ovl = F(ov['dur'])
v2 = (f'<clipitem id="ov"><name>{os.path.basename(overlay)}</name><enabled>TRUE</enabled><duration>{ovl}</duration>{rate}'
      f'<start>0</start><end>{min(ovl, seq_len)}</end><in>0</in><out>{min(ovl, seq_len)}</out>'
      f'{fileref(True, "ovf", overlay, ovl, W, H, False)}</clipitem>')
fmt = f'<format><samplecharacteristics>{rate}<width>{W}</width><height>{H}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>'
doc = (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><sequence id="seq">'
       f'<name>{os.path.basename(base)}</name><duration>{seq_len}</duration>{rate}<media>'
       f'<video>{fmt}<track>{"".join(v1)}</track><track>{v2}</track></video>'
       f'<audio><track>{"".join(a1)}</track><track>{"".join(a2)}</track></audio>'
       f'</media></sequence></xmeml>\n')
open(base + '.xml', 'w').write(doc)
import xml.dom.minidom
xml.dom.minidom.parse(base + '.xml')   # fails loudly if the file is not well formed
print(f'editor files: {base}.xml (import into Premiere or Resolve), {overlay}, {base}.srt')
if abs(W / H - edl['width'] / edl['height']) > 0.01:
    print('note: this is a Short. The XML timeline is the recording size; scale/position V1 in your editor to frame the face.')
