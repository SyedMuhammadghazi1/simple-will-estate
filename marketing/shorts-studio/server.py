#!/usr/bin/env python3
"""Shorts Studio web app: a local page that runs the shorts-studio skill's pipeline.

    python3 marketing/shorts-studio/server.py            # then open http://127.0.0.1:8765

Upload a recording, and the app transcribes it, cuts the dead air, lets you remove retakes, pick a
look, place a title, cards and an end card, then renders the Short and runs the quality gate.
Everything runs on this computer. The server listens on 127.0.0.1 only and uses the Python standard
library; the work is done by the scripts in ./skill (ffmpeg, HyperFrames, a local speech model).

Environment:
  PORT                    port to listen on (default 8765)
  SHORTS_STUDIO_HOME      where projects are kept (default ./projects next to this file)
  SHORTS_WHISPER_PYTHON   a Python that has faster-whisper, used when whisper.cpp is not installed
  HF_VERSION              HyperFrames version (default: the one the skill pins)
"""
import http.server
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "skill")
SCRIPTS = os.path.join(SKILL, "scripts")
WEB = os.path.join(HERE, "web")
HOME = os.path.abspath(os.environ.get("SHORTS_STUDIO_HOME") or os.path.join(HERE, "projects"))
PORT = int(os.environ.get("PORT") or 8765)
HF_VERSION = os.environ.get("HF_VERSION", "0.8.181")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
KINDS = {
    "recording": (".mp4", ".mov", ".m4v", ".webm", ".mkv"),
    "panel": (".mp4", ".mov", ".m4v", ".webm", ".png", ".jpg", ".jpeg", ".webp"),
    "music": (".mp3", ".wav", ".m4a", ".aac"),
}
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm", ".mkv")
MAX_UPLOAD = 8 * 1024**3
JOBS = {}
LOCK = threading.Lock()


class StepError(Exception):
    pass


# ---- projects ------------------------------------------------------------------------------------
def pdir(pid):
    if not ID_RE.match(pid or ""):
        raise KeyError(pid)
    d = os.path.join(HOME, pid)
    if not os.path.isdir(d):
        raise KeyError(pid)
    return d


def read_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, path)


def meta(pid):
    return read_json(os.path.join(pdir(pid), "project.json"), {})


def save_meta(pid, m):
    write_json(os.path.join(pdir(pid), "project.json"), m)


def probe(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
             "-of", "json", path], capture_output=True, text=True, timeout=60).stdout
        j = json.loads(out)
        v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
        a = any(s.get("codec_type") == "audio" for s in j.get("streams", []))
        return {"dur": round(float(j.get("format", {}).get("duration") or 0), 2), "w": v.get("width"),
                "h": v.get("height"), "audio": a}
    except Exception:
        return {}


def default_plan():
    return {"style": "night", "accent": "", "layout": "auto", "captions": True, "max_words": 3,
            "face": [30, 10, 70, 75], "title": "", "end": {"on": True, "kicker": "Comment", "word": ""},
            "cards": []}


def new_project(name):
    os.makedirs(HOME, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "short").lower()).strip("-")[:40] or "short"
    pid = f"{slug}-{time.strftime('%m%d-%H%M%S')}"
    d = os.path.join(HOME, pid)
    for sub in ("src", "work", "deliver"):
        os.makedirs(os.path.join(d, sub))
    write_json(os.path.join(d, "project.json"), {
        "id": pid, "name": name or "Untitled Short", "created": time.time(), "files": {}, "drops": [],
        "fixes": {}, "cut": {"noise": -35, "min_silence": 0.4, "pad": 0.12, "from": 0, "to": 0},
        "model": "small.en", "plan": default_plan()})
    return pid


def list_projects():
    out = []
    if os.path.isdir(HOME):
        for pid in os.listdir(HOME):
            m = read_json(os.path.join(HOME, pid, "project.json"))
            if m and ID_RE.match(pid):
                out.append({"id": pid, "name": m.get("name"), "created": m.get("created", 0),
                            "final": os.path.exists(os.path.join(HOME, pid, "deliver", "final.mp4"))})
    return sorted(out, key=lambda p: -p["created"])


def styles():
    out = {}
    for f in sorted(os.listdir(os.path.join(SKILL, "styles"))):
        j = read_json(os.path.join(SKILL, "styles", f))
        if j:
            out[f[:-5]] = j
    return out


def state(pid):
    d = pdir(pid)
    m = meta(pid)
    ex = lambda *p: os.path.exists(os.path.join(d, *p))
    ver = lambda *p: int(os.path.getmtime(os.path.join(d, *p))) if ex(*p) else 0
    sd = os.path.join(d, "work", "stills")
    stills = sorted(os.listdir(sd)) if os.path.isdir(sd) else []
    edit = None
    if ex("edit", "index.html"):
        html = open(os.path.join(d, "edit", "index.html")).read()
        mm = re.search(r"window\.EDIT = (\{.*?\});</script>", html, re.S)
        if mm:
            e = json.loads(mm.group(1))
            top = re.search(r'id="vwrap" style="left:\d+px;top:(\d+)px', html)
            edit = {"D": e["D"], "face": e["face"], "captionBox": e["captionBox"],
                    "layout": "split" if top and int(top.group(1)) > 0 else "crop",
                    "graphics": [{k: g.get(k) for k in ("type", "t", "hold", "box", "side")} for g in e["graphics"]]}
    job = JOBS.get(pid)
    log = ""
    lp = os.path.join(d, "job.log")
    if os.path.exists(lp):
        with open(lp, "rb") as f:
            f.seek(max(0, os.path.getsize(lp) - 6000))
            log = f.read().decode("utf-8", "replace")
    return {
        "meta": m,
        "raw": read_json(os.path.join(d, "work", "words_raw.json"), []),
        "words": read_json(os.path.join(d, "work", "words.json"), []),
        "edl": read_json(os.path.join(d, "work", "edl.json")),
        "has": {"cut": ver("work", "cut.mp4"), "frame": ver("work", "frame.jpg"), "edit": ver("edit", "index.html"),
                "render": ver("deliver", "render.mp4"), "final": ver("deliver", "final.mp4"),
                "srt": ver("work", "captions.srt"), "contact": ver("deliver", "final-contact.jpg"),
                "stills": ver("work", "stills")},
        "edit": edit,
        "stills": stills,
        "gate": read_json(os.path.join(d, "deliver", "final-gate.json")),
        "job": job,
        "log": log,
    }


# ---- environment -----------------------------------------------------------------------------------
def whisper_backend():
    if shutil.which("whisper-cli") or shutil.which("whisper-cpp"):
        return "whisper.cpp", None
    py = os.environ.get("SHORTS_WHISPER_PYTHON")
    if py and os.path.exists(py):
        return "faster-whisper", py
    if importlib.util.find_spec("faster_whisper"):
        return "faster-whisper", sys.executable
    return None, None


def auphonic_key():
    """the key from the environment, ./.env or ~/.shorts-studio/.env ("" if there is none); never logged"""
    if os.environ.get("AUPHONIC_API_KEY"):
        return os.environ["AUPHONIC_API_KEY"]
    for p in (os.path.join(HERE, ".env"), os.path.expanduser("~/.shorts-studio/.env")):
        try:
            m = re.search(r"^AUPHONIC_API_KEY=(\S+)", open(p).read(), re.M)
            if m:
                return m.group(1).strip("\"'")
        except OSError:
            pass
    return ""


def doctor():
    rows = []

    def tool(name, cmd, fix, need=None):
        path = shutil.which(cmd)
        detail = ""
        ok = bool(path)
        if ok and need:
            try:
                v = subprocess.run([cmd, "-p", "process.versions.node.split('.')[0]"], capture_output=True,
                                   text=True, timeout=20).stdout.strip()
                ok, detail = int(v) >= need, f"v{v}"
            except Exception:
                ok = False
        rows.append({"name": name, "ok": ok, "detail": detail or ("found" if ok else "missing"),
                     "fix": "" if ok else fix})

    tool("Node 22+", "node", "Install Node 22 or newer from nodejs.org", need=22)
    tool("ffmpeg", "ffmpeg", "macOS: brew install ffmpeg")
    tool("ffprobe", "ffprobe", "macOS: brew install ffmpeg")
    np = bool(importlib.util.find_spec("numpy"))
    rows.append({"name": "numpy", "ok": np, "detail": "found" if np else "missing",
                 "fix": "" if np else "pip3 install numpy"})
    wb, _ = whisper_backend()
    rows.append({"name": "Speech-to-text", "ok": bool(wb), "detail": wb or "missing",
                 "fix": "" if wb else "macOS: brew install whisper-cpp   (or: pip3 install faster-whisper)"})
    rows.append({"name": "Auphonic key", "ok": bool(auphonic_key()), "optional": True,
                 "detail": "found" if auphonic_key() else "not set (optional)",
                 "fix": "" if auphonic_key() else "For a studio-clean voice add AUPHONIC_API_KEY=... to ~/.shorts-studio/.env"})
    return rows


# ---- pipeline steps ----------------------------------------------------------------------------------
def run(pid, cmd, cwd=None, ok_codes=(0,), extra_env=None):
    d = pdir(pid)
    env = dict(os.environ, HF_VERSION=HF_VERSION, DO_NOT_TRACK="1", PYTHONUNBUFFERED="1", **(extra_env or {}))
    with open(os.path.join(d, "job.log"), "a") as log:
        log.write("\n$ " + " ".join(os.path.basename(c) if os.sep in c else c for c in cmd[:6]) + " ...\n")
        log.flush()
        p = subprocess.Popen(cmd, cwd=cwd or d, stdout=log, stderr=subprocess.STDOUT, env=env)
        JOBS[pid]["pid"] = p.pid
        rc = p.wait()
    if rc not in ok_codes:
        tail = open(os.path.join(d, "job.log")).read()[-700:].strip().splitlines()
        raise StepError(next((l for l in reversed(tail) if l.strip() and not l.startswith("$ ")), f"exit code {rc}"))
    return rc


def src_path(pid, kind):
    f = meta(pid).get("files", {}).get(kind)
    return os.path.join(pdir(pid), f["path"]) if f else None


def step_transcribe(pid):
    d, m = pdir(pid), meta(pid)
    rec = src_path(pid, "recording") or _fail("Upload a recording first.")
    if not m["files"]["recording"].get("audio"):
        _fail("This recording has no sound, so there is nothing to transcribe.")
    backend, py = whisper_backend()
    model = m.get("model", "small.en")
    if backend == "whisper.cpp":
        run(pid, [sys.executable, os.path.join(SCRIPTS, "captions.py"), rec, "--out", "work", "--model", model])
    elif backend == "faster-whisper":
        run(pid, [py, os.path.join(HERE, "transcribe.py"), rec, "--out", os.path.join(d, "work"), "--model", model])
    else:
        _fail("No speech-to-text tool found. macOS: brew install whisper-cpp (or pip3 install faster-whisper).")


def step_cut(pid):
    d, m = pdir(pid), meta(pid)
    rec = src_path(pid, "recording") or _fail("Upload a recording first.")
    raw = os.path.join(d, "work", "words_raw.json")
    if not os.path.exists(raw):
        _fail("Transcribe the recording first.")
    use = os.path.join(d, "work", "words_use.json")
    shutil.copyfile(raw, use)
    if m.get("fixes"):
        run(pid, [sys.executable, os.path.join(SCRIPTS, "fix_words.py"), use, "--at", json.dumps(m["fixes"])])
    c = m.get("cut", {})
    dur = m["files"]["recording"].get("dur") or 0
    drops = [list(map(float, x)) for x in m.get("drops", [])]
    if float(c.get("from") or 0) > 0:
        drops.append([0.0, float(c["from"])])
    if float(c.get("to") or 0) > 0 and float(c["to"]) < dur:
        drops.append([float(c["to"]), dur])
    write_json(os.path.join(d, "work", "drops.json"), drops)
    run(pid, [sys.executable, os.path.join(SCRIPTS, "silence_cut.py"), rec, "--out", "work", "--words", use,
              "--drop", os.path.join("work", "drops.json"), "--noise", str(c.get("noise", -35)),
              "--min-silence", str(c.get("min_silence", 0.4)), "--pad", str(c.get("pad", 0.12))])
    # the renderer seeks frame by frame and freezes on sparse keyframes, so give the cut one every second
    kf = os.path.join("work", "cut-kf.mp4")
    run(pid, ["ffmpeg", "-v", "error", "-y", "-i", os.path.join("work", "cut.mp4"), "-c:v", "libx264", "-crf", "16",
              "-preset", "medium", "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30", "-c:a", "copy",
              "-movflags", "+faststart", kf])
    os.replace(os.path.join(d, kf), os.path.join(d, "work", "cut.mp4"))
    panel = src_path(pid, "panel")
    if panel and panel.lower().endswith(VIDEO_EXT):
        run(pid, [sys.executable, os.path.join(SCRIPTS, "follow_cut.py"), panel, "--edl",
                  os.path.join("work", "edl.json"), "--out", os.path.join("work", "screen-cut.mp4")])
    shutil.rmtree(os.path.join(d, "work", "stills"), ignore_errors=True)
    cd = probe(os.path.join(d, "work", "cut.mp4")).get("dur") or 1
    run(pid, ["ffmpeg", "-v", "error", "-y", "-ss", f"{cd * 0.4:.2f}", "-i", os.path.join("work", "cut.mp4"),
              "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", os.path.join("work", "frame.jpg")])


def build_plan(pid):
    """the page's simple plan -> the plan.json the skill's builder reads (references/LAYOUTS.md)"""
    d, m = pdir(pid), meta(pid)
    p = m.get("plan") or default_plan()
    words = read_json(os.path.join(d, "work", "words.json"), [])
    dur = probe(os.path.join(d, "work", "cut.mp4")).get("dur") or 0
    st = dict(styles().get(p.get("style") or "night", {}).get("style", {}))
    if re.match(r"^#[0-9a-fA-F]{6}$", p.get("accent") or ""):
        st["accent"] = st["capaccent"] = p["accent"]
    plan = {"format": "short", "face": [float(x) for x in p.get("face") or [30, 10, 70, 75]], "keep_clear": [],
            "style": st, "captions": {"on": bool(p.get("captions", True)), "max_words": int(p.get("max_words") or 3)},
            "graphics": []}
    if p.get("layout") in ("crop", "split"):
        plan["short_layout"] = p["layout"]
    panel = src_path(pid, "panel")
    if panel:
        cutp = os.path.join(d, "work", "screen-cut.mp4")
        plan["panel"] = {"file": cutp if panel.lower().endswith(VIDEO_EXT) and os.path.exists(cutp) else panel}
        plan["short_layout"] = "split"
    if (p.get("title") or "").strip():
        plan["graphics"].append({"type": "title", "t": 0, "text": p["title"].strip(), "hold": 3.0})
    known = {w["i"] for w in words}
    for c in p.get("cards", []):
        if c.get("word_i") not in known:
            continue                       # the word was cut out since the card was added
        g = {"type": c.get("type", "callout"), "word_i": c["word_i"], "hold": float(c.get("hold") or 2.6)}
        if g["type"] == "stat":
            g.update({"value": float(c.get("value") or 0), "suffix": c.get("suffix", ""), "label": c.get("label", "")})
            if g["value"] == int(g["value"]):
                g["value"] = int(g["value"])
        else:
            g["text"] = c.get("text", "")
        plan["graphics"].append(g)
    e = p.get("end") or {}
    if e.get("on") and (e.get("word") or "").strip() and dur > 4:
        hold = 2.8
        t = round(max(0.0, dur - hold), 2)
        said = next((w for w in words if re.sub(r"\W", "", w["text"]).lower() == (e.get("kicker") or "comment").lower()
                     and w["start"] > dur - 8), None)
        if said:
            t, hold = round(said["start"], 2), round(max(1.6, dur - said["start"]), 2)
        plan["graphics"].append({"type": "end", "t": t, "kicker": e.get("kicker") or "Comment",
                                 "text": f"**{e['word'].strip().upper()}**", "hold": hold})
    write_json(os.path.join(d, "plan.json"), plan)
    return plan


def step_build(pid):
    d = pdir(pid)
    if not os.path.exists(os.path.join(d, "work", "cut.mp4")):
        _fail("Cut the recording first.")
    build_plan(pid)
    for stale in ("edit", os.path.join("work", "stills")):   # preview frames belong to the layout they were taken from
        shutil.rmtree(os.path.join(d, stale), ignore_errors=True)
    run(pid, [sys.executable, os.path.join(SCRIPTS, "edit_build.py"), "--cut", os.path.join("work", "cut.mp4"),
              "--words", os.path.join("work", "words.json"), "--plan", "plan.json", "--out", "edit"])


def step_stills(pid):
    d = pdir(pid)
    st = state(pid)
    D = st["edit"]["D"] if st["edit"] else 10
    times = {0.9, round(D / 2, 2), round(max(0, D - 0.4), 2)}
    for g in (st["edit"] or {}).get("graphics", []):
        times.add(round(min(D - 0.1, g["t"] + 0.7), 2))
    run(pid, ["bash", os.path.join(SCRIPTS, "stills.sh"), os.path.join(d, "edit"),
              ",".join(str(t) for t in sorted(times)[:8])])
    # keep the small copies outside ./edit, which is rebuilt from scratch before every render
    keep = os.path.join(d, "work", "stills")
    shutil.rmtree(keep, ignore_errors=True)
    os.makedirs(keep)
    src = os.path.join(d, "edit", "stills")
    for f in sorted(os.listdir(src)):
        if f.endswith(".jpg") and not f.startswith(("contact", "peek")):
            shutil.copyfile(os.path.join(src, f), os.path.join(keep, f))


def step_render(pid):
    d, m = pdir(pid), meta(pid)
    for f in ("render.mp4", "final.mp4", "final-gate.json", "final-contact.jpg", "final-pacing.json"):
        try:
            os.remove(os.path.join(d, "deliver", f))
        except OSError:
            pass
    run(pid, [sys.executable, os.path.join(SCRIPTS, "export_edit.py"), "--project", "edit", "--work", "work",
              "--out", os.path.join("deliver", "render.mp4"), "--quality", m.get("quality", "draft")])


def step_mix(pid):
    cmd = [sys.executable, os.path.join(SCRIPTS, "mix.py"), os.path.join("deliver", "render.mp4"),
           "--out", os.path.join("deliver", "final.mp4")]
    music = src_path(pid, "music")
    if music:
        cmd += ["--music", music]
    run(pid, cmd)


def step_gate(pid):
    # exit code 1 = at least one check failed; that is a result to show, not a broken step
    run(pid, [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--project", "edit", "--final",
              os.path.join("deliver", "final.mp4")], ok_codes=(0, 1))


def step_voice(pid):
    if not auphonic_key():
        _fail("No Auphonic key. Add AUPHONIC_API_KEY=... to ~/.shorts-studio/.env first.")
    run(pid, [sys.executable, os.path.join(SCRIPTS, "auphonic.py"), os.path.join("work", "cut.mp4"),
              "--out", os.path.join("work", "cut.mp4"), "--title", meta(pid).get("name", "short")],
        extra_env={"AUPHONIC_API_KEY": auphonic_key()})


def _fail(msg):
    raise StepError(msg)


STEPS = {"transcribe": ("Transcribe", step_transcribe), "cut": ("Cut the silence", step_cut),
         "voice": ("Clean the voice", step_voice), "build": ("Lay it out", step_build),
         "stills": ("Preview stills", step_stills), "render": ("Render", step_render),
         "mix": ("Level the sound", step_mix), "gate": ("Quality gate", step_gate)}
CHAINS = {"prepare": ["transcribe", "cut"], "recut": ["cut"], "voice": ["voice"], "preview": ["build", "stills"],
          "make": ["build", "render", "mix", "gate"]}


def start_job(pid, chain):
    with LOCK:
        j = JOBS.get(pid)
        if j and j["status"] == "running":
            raise StepError("Something is already running for this project.")
        JOBS[pid] = {"chain": chain, "status": "running", "started": time.time(), "error": "",
                     "steps": [{"id": s, "name": STEPS[s][0], "status": "waiting"} for s in CHAINS[chain]]}
    open(os.path.join(pdir(pid), "job.log"), "w").close()

    def work():
        j = JOBS[pid]
        for s in j["steps"]:
            s["status"], s["started"] = "running", time.time()
            try:
                STEPS[s["id"]][1](pid)
                s["status"] = "done"
            except StepError as e:
                s["status"], j["status"], j["error"] = "failed", "failed", str(e)
            except Exception as e:  # a bug here must still end the job, not hang the page
                s["status"], j["status"], j["error"] = "failed", "failed", f"{type(e).__name__}: {e}"
            s["seconds"] = round(time.time() - s["started"], 1)
            if j["status"] == "failed":
                break
        if j["status"] == "running":
            j["status"] = "done"
        j["ended"] = time.time()

    threading.Thread(target=work, daemon=True).start()


# ---- http ----------------------------------------------------------------------------------------
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def guard(self):
        """loopback only: refuse other Host names (DNS rebinding) and writes sent by other websites"""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        if host not in ("127.0.0.1", "localhost"):
            self.send_json({"error": "local only"}, 403)
            return False
        origin = self.headers.get("Origin")
        if self.command != "GET" and origin and urllib.parse.urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            self.send_json({"error": "cross-site request refused"}, 403)
            return False
        return True

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise StepError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def send_file(self, path):
        if not os.path.isfile(path):
            return self.send_json({"error": "not found"}, 404)
        size = os.path.getsize(path)
        ctype = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4",
                 ".jpg": "image/jpeg", ".png": "image/png", ".srt": "text/plain; charset=utf-8", ".json": "application/json",
                 ".svg": "image/svg+xml", ".mov": "video/quicktime", ".xml": "application/xml"
                 }.get(os.path.splitext(path)[1].lower(), "application/octet-stream")
        a, b = 0, size - 1
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                a = int(m.group(1))
                b = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:
                a = max(0, size - int(m.group(2)))
            if a > b or a >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                return self.end_headers()
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(b - a + 1))
        self.send_header("Cache-Control", "no-store")
        if "download" in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query):
            self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(path)}"')
        self.end_headers()
        left = b - a + 1
        try:
            with open(path, "rb") as f:
                f.seek(a)
                while left > 0:
                    buf = f.read(min(1 << 16, left))
                    if not buf:
                        break
                    self.wfile.write(buf)
                    left -= len(buf)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def route(self):
        u = urllib.parse.urlparse(self.path)
        return [urllib.parse.unquote(x) for x in u.path.strip("/").split("/")], urllib.parse.parse_qs(u.query)

    def do_GET(self):
        if not self.guard():
            return
        parts, _ = self.route()
        try:
            if parts == [""]:
                return self.send_file(os.path.join(WEB, "index.html"))
            if parts[0] in ("app.js", "app.css") and len(parts) == 1:
                return self.send_file(os.path.join(WEB, parts[0]))
            if parts[:2] == ["api", "doctor"]:
                return self.send_json(doctor())
            if parts[:2] == ["api", "styles"]:
                return self.send_json(styles())
            if parts[:2] == ["api", "projects"] and len(parts) == 2:
                return self.send_json(list_projects())
            if parts[:2] == ["api", "projects"] and len(parts) == 3:
                return self.send_json(state(parts[2]))
            if parts[0] == "p" and len(parts) >= 3:          # a file inside a project
                root = os.path.realpath(pdir(parts[1]))
                path = os.path.realpath(os.path.join(root, *parts[2:]))
                if not path.startswith(root + os.sep):
                    return self.send_json({"error": "not found"}, 404)
                return self.send_file(path)
        except KeyError:
            return self.send_json({"error": "no such project"}, 404)
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        if not self.guard():
            return
        parts, _ = self.route()
        try:
            if parts == ["api", "projects"]:
                return self.send_json({"id": new_project(str(self.body_json().get("name", ""))[:80])})
            if parts[:2] == ["api", "projects"] and len(parts) == 4 and parts[3] == "save":
                pid, body = parts[2], self.body_json()
                m = meta(pid)
                for k in ("name", "drops", "fixes", "cut", "model", "plan", "quality"):
                    if k in body:
                        m[k] = body[k]
                save_meta(pid, m)
                return self.send_json({"ok": True})
            if parts[:2] == ["api", "projects"] and len(parts) == 5 and parts[3] == "run" and parts[4] in CHAINS:
                start_job(parts[2], parts[4])
                return self.send_json({"ok": True})
            if parts[:2] == ["api", "projects"] and len(parts) == 4 and parts[3] == "delete":
                pid = parts[2]
                if JOBS.get(pid, {}).get("status") == "running":
                    raise StepError("Wait for the running step to finish first.")
                shutil.rmtree(pdir(pid))
                return self.send_json({"ok": True})
        except KeyError:
            return self.send_json({"error": "no such project"}, 404)
        except (StepError, ValueError) as e:
            return self.send_json({"error": str(e)}, 400)
        self.send_json({"error": "not found"}, 404)

    def do_PUT(self):
        """upload: PUT /api/projects/<id>/upload/<kind>?name=<file name>, the file as the request body"""
        if not self.guard():
            return
        parts, q = self.route()
        try:
            if not (parts[:2] == ["api", "projects"] and len(parts) == 5 and parts[3] == "upload" and parts[4] in KINDS):
                return self.send_json({"error": "not found"}, 404)
            pid, kind = parts[2], parts[4]
            d = pdir(pid)
            name = os.path.basename((q.get("name") or ["file"])[0])
            ext = os.path.splitext(name)[1].lower()
            n = int(self.headers.get("Content-Length") or 0)
            if ext not in KINDS[kind]:
                self.close_connection = True
                return self.send_json({"error": f"That file type is not supported here. Use one of: {', '.join(KINDS[kind])}"}, 400)
            if not 0 < n <= MAX_UPLOAD:
                self.close_connection = True
                return self.send_json({"error": "The file is empty or larger than 8 GB."}, 400)
            for old in os.listdir(os.path.join(d, "src")):
                if old.startswith(kind + "."):
                    os.remove(os.path.join(d, "src", old))
            rel = os.path.join("src", kind + ext)
            left = n
            with open(os.path.join(d, rel), "wb") as f:
                while left > 0:
                    buf = self.rfile.read(min(1 << 20, left))
                    if not buf:
                        break
                    f.write(buf)
                    left -= len(buf)
            if left:
                os.remove(os.path.join(d, rel))
                return self.send_json({"error": "The upload was interrupted. Try again."}, 400)
            info = probe(os.path.join(d, rel))
            if kind == "recording" and not info.get("w"):
                os.remove(os.path.join(d, rel))
                return self.send_json({"error": "That file could not be read as a video."}, 400)
            m = meta(pid)
            m.setdefault("files", {})[kind] = dict(info, name=name, path=rel, size=n)
            if kind == "recording":           # a new recording makes the old transcript and cut meaningless
                m["drops"], m["fixes"] = [], {}
                for stale in ("work", "edit", "deliver"):
                    shutil.rmtree(os.path.join(d, stale), ignore_errors=True)
                for sub in ("work", "deliver"):
                    os.makedirs(os.path.join(d, sub), exist_ok=True)
            save_meta(pid, m)
            return self.send_json({"ok": True, "file": m["files"][kind]})
        except KeyError:
            return self.send_json({"error": "no such project"}, 404)


def main():
    os.makedirs(HOME, exist_ok=True)
    # HyperFrames sends anonymous usage data unless told not to; this app turns it off
    threading.Thread(target=lambda: subprocess.run(
        ["npx", "--yes", f"hyperframes@{HF_VERSION}", "telemetry", "disable"], capture_output=True), daemon=True).start()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Shorts Studio: http://127.0.0.1:{PORT}   (projects in {HOME})   Ctrl+C to stop", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
