#!/usr/bin/env python3
"""clip.py: cut a moment out of a long stream and turn it into a captioned 9:16 Short.

    python3 marketing/shorts-studio/clip.py marketing/shorts-studio/clips/<name>.json
        [--source FILE [--offset SECONDS]]   use a file you already have instead of downloading
        [--quality draft|high]               render quality (default high)
        [--stills]                           stop after the preview frames, before the render

A clip plan (see clips/*.json) lists the pieces of the source to keep, the hook title and the words
spoken. This script then:
  1. downloads only the seconds it needs (yt-dlp), or uses --source;
  2. moves every cut to the quietest instant near it, so no word is clipped;
  3. looks at each piece to see whether the stream shows the camera full screen or the game with a
     small camera box, and re-frames it for a phone: face full height, or face stacked over the game;
  4. alternates a punch-in on every cut, so jump cuts read as intended;
  5. hands the result to the shorts-studio skill for word-by-word captions and the title, renders,
     levels the sound to -14 LUFS and runs the quality gate.
Output: clips/out/<name>/deliver/<name>.mp4 (+ cover.jpg, contact sheet, gate report).

Needs ffmpeg, numpy, Node 22+ (the renderer) and, unless --source is given, yt-dlp."""
import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "skill")
SCRIPTS = os.path.join(SKILL, "scripts")
FONT = os.path.join(SKILL, "gate", "fonts", "Switzer-Variable.ttf")
W, H, FPS = 1080, 1920, 30
TOP_H = 608          # camera panel in the stacked layout (1080 x 608 is 16:9)
SR = 16000


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    j = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", path]))
    return {"w": j["streams"][0]["width"], "h": j["streams"][0]["height"], "dur": float(j["format"]["duration"])}


# ---- 1. the source -------------------------------------------------------------------------------
def fetch(plan, work):
    """download only the span the plan uses; returns (file, time of the file's first frame in the source)"""
    a = max(0.0, min(s["from"] for s in plan["segments"]) - 2)
    b = max(s["to"] for s in plan["segments"]) + 2
    out = os.path.join(work, "source.mp4")
    if os.path.exists(out):
        return out, a
    if not shutil.which("yt-dlp"):
        sys.exit("yt-dlp is not installed. macOS: brew install yt-dlp   (or pass --source FILE)")
    print(f"downloading {a:.0f} s to {b:.0f} s of {plan['source']['url']}", flush=True)
    r = subprocess.run(["yt-dlp", "--no-warnings", "--no-playlist",
                        "-f", "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[height<=1080]/b",
                        "--download-sections", f"*{a}-{b}", "--force-keyframes-at-cuts",
                        "--merge-output-format", "mp4", "-o", out, plan["source"]["url"]])
    if r.returncode or not os.path.exists(out):
        sys.exit("The download failed. If the site refuses this computer, download the video in a browser "
                 "and run again with --source FILE (and --offset if the file does not start at 0:00).")
    return out, a


# ---- 2. cuts on quiet points ------------------------------------------------------------------------
def envelope(path):
    """loudness of the sound in 10 ms steps"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = len(x) // 160
    return np.sqrt((x[:n * 160].reshape(n, 160) ** 2).mean(axis=1) + 1e-12)


def snap(t, env, win):
    """the quietest 60 ms within +-win seconds of t (file time)"""
    c, r = int(round(t * 100)), int(round(win * 100))
    lo, hi = max(0, c - r), min(len(env) - 6, c + r)
    if hi <= lo:
        return t
    best = min(range(lo, hi + 1), key=lambda k: (env[k:k + 6].mean(), abs(k - c)))
    return (best + 3) / 100


# ---- 3. what is on screen ----------------------------------------------------------------------------
def box_score(g, box):
    """how strongly a picture-in-picture box with these edges shows in a grey frame"""
    h, w = g.shape
    x1, y0, y1 = box[2] / 100 * w, box[1] / 100 * h, box[3] / 100 * h
    r = max(1, round(h / 240))
    xs = slice(int(0.01 * w), int(x1 - 0.01 * w))
    ys = slice(int(y0 + 0.02 * h), int(y1 - 0.02 * h))
    top = max(np.abs(g[int(y0) + d + 1, xs] - g[int(y0) + d - 1, xs]).mean() for d in range(-r, r + 1))
    right = max(np.abs(g[ys, int(x1) + d + 1] - g[ys, int(x1) + d - 1]).mean() for d in range(-r, r + 1))
    return max(float(top), float(right))


def views(path, a, b, box, threshold):
    """[(from, to, 'cam' | 'game')] for the piece a..b: sampled 5 times a second, split where the stream switches"""
    info = probe(path)
    gw = 640
    gh = int(round(info["h"] * gw / info["w"] / 2)) * 2
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", path, "-vf",
                          f"fps=5,scale={gw}:{gh}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    n = len(raw) // (gw * gh)
    if not n:
        return [(a, b, "cam")]
    fr = np.frombuffer(raw[:n * gw * gh], np.uint8).reshape(n, gh, gw).astype(np.float32)
    v = ["game" if box_score(f, box) >= threshold else "cam" for f in fr]
    for k in range(1, n - 1):                       # one odd frame between two that agree is noise
        if v[k - 1] == v[k + 1] != v[k]:
            v[k] = v[k - 1]
    out, start = [], 0
    for k in range(1, n + 1):
        if k == n or v[k] != v[start]:
            t0, t1 = a + start / 5, (a + k / 5 if k < n else b)
            out.append([t0, t1, v[start]])
            start = k
    merged = []
    for s in out:                                   # a view shorter than 0.6 s joins its neighbour
        if merged and (s[1] - s[0] < 0.6 or merged[-1][1] - merged[-1][0] < 0.6):
            merged[-1][1] = s[1]
            if s[1] - s[0] >= 0.6 > merged[-1][1] - s[1] + (s[0] - merged[-1][0]):
                merged[-1][2] = s[2]
        else:
            merged.append(list(s))
    # the 5-a-second pass only knows a switch to the nearest 0.2 s: find the exact frame
    for k in range(len(merged) - 1):
        t = switch_frame(path, merged[k][1], box, threshold, merged[k + 1][2], gw, gh)
        merged[k][1] = merged[k + 1][0] = t
    for m in merged:
        if m[1] - m[0] < 0.8:
            print(f"  note: the {m[2]} view lasts only {m[1] - m[0]:.2f} s at {m[0]:.2f} s. "
                  "Move that piece's from/to in the plan so the switch is not inside it.")
    return [tuple(m) for m in merged]


def switch_frame(path, t, box, threshold, after, gw, gh):
    """the time of the first frame that shows the view `after`, searched frame by frame around t"""
    a, fps = max(0.0, t - 0.3), 60
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-t", "0.45", "-i", path, "-vf",
                          f"fps={fps},scale={gw}:{gh}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    n = len(raw) // (gw * gh)
    fr = np.frombuffer(raw[:n * gw * gh], np.uint8).reshape(n, gh, gw).astype(np.float32)
    for k in range(n):
        if ("game" if box_score(fr[k], box) >= threshold else "cam") == after:
            return a + k / fps
    return t


# ---- 4. re-frame for a phone ---------------------------------------------------------------------------
def even(x):
    return int(round(x / 2)) * 2


def compose(source, shots, out, st, credit, work):
    """shots: [(from, to, view)] in file time -> one 1080x1920 video with sound"""
    info = probe(source)
    sw, sh = info["w"], info["h"]
    parts, labels, k_cam = [], [], 0
    for i, (a, b, view) in enumerate(shots):
        d = b - a
        head = f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,fps={FPS}"
        if view == "cam":
            cw = even(sh * 9 / 16)
            x0 = int(min(max(0, st.get("cam_center", 50) / 100 * sw - cw / 2), sw - cw))
            z0, z1 = ((1.0, 1.045) if k_cam % 2 == 0 else (1.11, 1.15))      # punch in on every other shot
            k_cam += 1
            z = f"({z0}+({z1}-{z0})*t/{d:.3f})"
            parts.append(f"{head},crop={cw}:{sh}:{x0}:0,scale={W}:{H}:flags=lanczos,"
                         f"scale=w='2*trunc({W // 2}*{z})':h='2*trunc({H // 2}*{z})':eval=frame:flags=bilinear,"
                         f"crop={W}:{H},setsar=1[v{i}];")
        else:
            bx, by, bx1, by1 = [v / 100 for v in st["cam_box"]]
            cw = even((bx1 - bx) * sw - 6)
            ch = even(cw * 9 / 16)
            cx = int(bx * sw + 3)
            cy = int(by * sh + ((by1 - by) * sh - ch) / 2)
            gh = H - TOP_H
            gw = even(sh * W / gh)
            gx = int(min(max(bx1 * sw + 4, st.get("game_center", 55) / 100 * sw - gw / 2), sw - gw))
            parts.append(f"{head},split[c{i}][g{i}];"
                         f"[c{i}]crop={cw}:{ch}:{cx}:{cy},scale={W}:{TOP_H}:flags=lanczos,unsharp=5:5:0.7[t{i}];"
                         f"[g{i}]crop={gw}:{sh}:{gx}:0,scale={W}:{gh}:flags=lanczos[b{i}];"
                         f"[t{i}][b{i}]vstack,setsar=1[v{i}];")
        fd = min(0.012, d / 4)
        parts.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fd},"
                     f"afade=t=out:st={d - fd:.3f}:d={fd}[a{i}];")
        labels.append(f"[v{i}][a{i}]")
    fc = "".join(parts) + "".join(labels) + f"concat=n={len(shots)}:v=1:a=1[vc][a]"
    if credit:
        tf = os.path.join(work, "credit.txt")
        open(tf, "w").write(credit)
        esc = lambda p: p.replace("\\", "/").replace(":", "\\:")
        fc += (f";[vc]drawtext=fontfile='{esc(FONT)}':textfile='{esc(tf)}':fontsize=27:fontcolor=white@0.8:"
               f"x=(w-text_w)/2:y=1550:shadowcolor=black@0.7:shadowx=0:shadowy=2[v]")
    else:
        fc += ";[vc]null[v]"
    script = os.path.join(work, "compose_filter.txt")
    open(script, "w").write(fc)
    run(["ffmpeg", "-v", "error", "-y", "-i", source, "-filter_complex_script", script, "-map", "[v]", "-map", "[a]",
         "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p",
         "-g", str(FPS), "-keyint_min", str(FPS),      # a keyframe every second: the renderer seeks frame by frame
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out])


# ---- the whole job -------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan")
    ap.add_argument("--source")
    ap.add_argument("--offset", type=float, default=0.0, help="source time of the first frame of --source")
    ap.add_argument("--quality", default="high", choices=["draft", "high"])
    ap.add_argument("--stills", action="store_true")
    a = ap.parse_args()
    plan = json.load(open(a.plan))
    name = plan["name"]
    P = os.path.join(os.path.dirname(os.path.abspath(a.plan)), "out", name)
    work, deliver = os.path.join(P, "work"), os.path.join(P, "deliver")
    for d in (work, deliver):
        os.makedirs(d, exist_ok=True)
    env = dict(os.environ, HF_VERSION=os.environ.get("HF_VERSION", "0.8.181"), DO_NOT_TRACK="1")

    source, offset = (a.source, a.offset) if a.source else fetch(plan, work)
    st = plan.get("stream", {})
    lvl = envelope(source)
    win = float(plan.get("snap", 0.25))

    # pieces in file time, cut on quiet points, then split wherever the stream changes view
    shots, pieces = [], []
    for seg in plan["segments"]:
        f0 = snap(seg["from"] - offset, lvl, float(seg.get("snap", win)))
        f1 = snap(seg["to"] - offset, lvl, float(seg.get("snap", win)))
        pieces.append((f0 + offset, f1 + offset))
        if seg.get("view") in ("cam", "game") or "cam_box" not in st:
            shots.append((f0, f1, seg.get("view") or "cam"))
        else:
            shots += views(source, f0, f1, st["cam_box"], float(st.get("threshold", 50)))
    print("shots:")
    rec = 0.0
    for s0, s1, v in shots:
        print(f"  {rec:6.2f} s  {s1 - s0:5.2f} s  {v:4s}  (source {s0 + offset:7.2f} to {s1 + offset:7.2f})")
        rec += s1 - s0
    compose(source, shots, os.path.join(work, "cut.mp4"), st, plan["source"].get("credit", ""), work)

    # the words, moved onto the new timeline
    words, rec = [], 0.0
    for p0, p1 in pieces:
        for w in plan["captions"]["words"]:
            if p0 - 0.05 <= w["start"] < p1 - 0.05:
                s = rec + max(0.0, w["start"] - p0)
                e = min(rec + (p1 - p0), rec + max(w["end"] - p0, w["start"] - p0 + 0.08))
                words.append({"i": len(words), "text": w["text"], "start": round(s, 3), "end": round(e, 3)})
        rec += p1 - p0
    json.dump(words, open(os.path.join(work, "words.json"), "w"), indent=0)
    print(f"cut: {rec:.1f} s, {len(words)} words ({len(words) / rec:.1f} a second)")

    style = dict(json.load(open(os.path.join(SKILL, "styles", plan.get("style", "bold") + ".json")))["style"])
    style.update(plan.get("style_overrides", {}))
    gfx = [{"type": "title", "t": 0, "text": plan["title"], "hold": float(plan.get("title_hold", 3.0))}]
    for g in plan.get("graphics", []):
        gfx.append(g)
    build = {"format": "short", "short_layout": "crop", "face": plan.get("face", [22, 22, 78, 54]), "keep_clear": [],
             "style": style, "captions": {"on": True, "max_words": int(plan["captions"].get("max_words", 3))},
             "graphics": gfx}
    json.dump(build, open(os.path.join(P, "plan.json"), "w"), indent=1)
    shutil.rmtree(os.path.join(P, "edit"), ignore_errors=True)
    py = sys.executable
    run([py, os.path.join(SCRIPTS, "edit_build.py"), "--cut", os.path.join(work, "cut.mp4"), "--words",
         os.path.join(work, "words.json"), "--plan", os.path.join(P, "plan.json"), "--out", os.path.join(P, "edit")], env=env)

    # preview frames: one in every shot, plus the first second
    times, rec = [0.6], 0.0
    for s0, s1, _ in shots:
        times.append(round(rec + (s1 - s0) * 0.6, 2))
        rec += s1 - s0
    run(["bash", os.path.join(SCRIPTS, "stills.sh"), os.path.join(P, "edit"), ",".join(str(t) for t in times[:10])], env=env)
    print(f"preview frames: {os.path.join(P, 'edit', 'stills')}")
    if a.stills:
        return

    final = os.path.join(deliver, name + ".mp4")
    run([py, os.path.join(SCRIPTS, "export_edit.py"), "--project", os.path.join(P, "edit"), "--work", work,
         "--out", os.path.join(deliver, "render.mp4"), "--quality", a.quality], env=env, cwd=P)
    run([py, os.path.join(SCRIPTS, "mix.py"), os.path.join(deliver, "render.mp4"), "--out", final], env=env)
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(plan.get("cover_at", 1.0)), "-i", final, "-frames:v", "1",
         "-q:v", "2", os.path.join(deliver, "cover.jpg")])
    gate = subprocess.run([py, os.path.join(SCRIPTS, "gate.py"), "--project", os.path.join(P, "edit"), "--final", final],
                          env=env, cwd=P)
    print(f"\nShort: {final}")
    print("The gate's 'ending' line asks for a spoken or written ask; a clip that loops is a fair reason to leave it out.")
    sys.exit(gate.returncode)


if __name__ == "__main__":
    main()
