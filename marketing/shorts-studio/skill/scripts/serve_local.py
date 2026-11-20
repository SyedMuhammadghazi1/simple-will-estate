#!/usr/bin/env python3
"""serve_local.py: a local, read-only web server for reviewing videos (byte ranges, so the player can scrub).
usage: serve_local.py PORT ROOT      loopback only; serves ROOT/index.html at /
"""
import http.server, os, re, sys
PORT, ROOT = int(os.environ.get('PORT') or sys.argv[1]), os.path.abspath(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def send_head(self):
        if self.headers.get('Host', '').split(':')[0] not in ('127.0.0.1', 'localhost'): self.send_error(403); return None
        path = self.translate_path(self.path)
        if os.path.isdir(path): path = os.path.join(path, 'index.html')
        if not os.path.isfile(path): self.send_error(404); return None
        size = os.path.getsize(path); ctype = self.guess_type(path); f = open(path, 'rb')
        m = re.match(r'bytes=(\d*)-(\d*)', self.headers.get('Range', '') or '')
        if m and (m.group(1) or m.group(2)):
            a = int(m.group(1)) if m.group(1) else size - int(m.group(2)); b = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
            b = min(b, size - 1); f.seek(a); self.send_response(206); self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); n = b - a + 1
        else: self.send_response(200); n = size
        self.send_header('Content-Type', ctype); self.send_header('Accept-Ranges', 'bytes'); self.send_header('Content-Length', str(n)); self.end_headers()
        self._left = n; return f
    def copyfile(self, src, dst):
        left = getattr(self, '_left', None)
        while left is None or left > 0:
            buf = src.read(min(65536, left) if left is not None else 65536)
            if not buf: break
            dst.write(buf); left = None if left is None else left - len(buf)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
