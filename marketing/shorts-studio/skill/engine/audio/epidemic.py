#!/usr/bin/env python3
"""Epidemic Sound for the audio step: search and download music and sound effects, log every file.

Two keys in ~/.shorts-studio/.env (never printed):
  EPIDEMIC_SOUND_API_KEY      REST API, https://api.epidemicsound.com/v0 : search AND download (used by default)
  EPIDEMIC_SOUND_MCP_API_KEY  MCP server, https://www.epidemicsound.com/a/mcp-service/mcp : search only (downloads are
                              forbidden on this key). Richer SFX search (duration filter, tags). Optional.
Downloads are covered by Jack's subscription (no charge per call). A signed URL is used unmodified within 1 h.

usage:
  epidemic.py ok                                      exit 0 when the REST key works
  epidemic.py sfx "<term>" [--n 8]                    search sound effects (id, length s, title)
  epidemic.py music "<term>" [--n 8] [--bpm 105-125]  search tracks (id, bpm, length, vocals, preview-only, title)
  epidemic.py get sfx|music <id> <out_file> [--title T] [--role R] [--log licences.jsonl]
  epidemic.py mcp-tools                               list the MCP tools (search key)
As a module: import epidemic as ep; ep.search_sfx('ui pop'); ep.download('sfx', id, path, log=..., title=..., role=...)
"""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error

KEYS = os.path.expanduser('~/.shorts-studio/.env')
REST = 'https://api.epidemicsound.com/v0'
MCP = 'https://www.epidemicsound.com/a/mcp-service/mcp'
LICENCE = ('Epidemic Sound subscription licence (Jack Roberts account): cleared for his YouTube and social channels while '
           'the subscription is active when the video is published. Keep the id: it clears a Content ID claim.')
UA = 'jack-youtube/1'


def key(name):
    k = os.environ.get(name)
    if not k and os.path.exists(KEYS):
        for line in open(KEYS):
            if line.startswith(name + '='): k = line.split('=', 1)[1].strip().strip('"').strip("'")
    return k or None


def available():
    return key('EPIDEMIC_SOUND_API_KEY') is not None


def _get(path, **q):
    k = key('EPIDEMIC_SOUND_API_KEY')
    if not k: raise RuntimeError('no EPIDEMIC_SOUND_API_KEY')
    url = REST + path + ('?' + urllib.parse.urlencode({a: b for a, b in q.items() if b is not None}) if q else '')
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + k, 'Accept': 'application/json', 'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2: time.sleep(3 + 5 * attempt); continue
            raise RuntimeError(f'Epidemic {path}: HTTP {e.code} {e.read()[:200]!r}')


def search_sfx(term, n=8):
    r = _get('/sound-effects/search', term=term, limit=n)
    return [dict(id=s['id'], title=s['title'], length=s.get('length')) for s in r.get('soundEffects', [])]


def search_music(term, n=8, bpm=None, vocals=False, allow_preview_only=True):   # every REST hit says isPreviewOnly today; downloads still work
    r = _get('/tracks/search', term=term, limit=max(n * 3, 10))
    out = []
    for t in r.get('tracks', []):
        if bpm and not (bpm[0] <= (t.get('bpm') or 0) <= bpm[1]): continue
        if not vocals and t.get('hasVocals'): continue
        if not allow_preview_only and t.get('isPreviewOnly'): continue
        out.append(dict(id=t['id'], title=t['title'], bpm=t.get('bpm'), length=t.get('length'), vocals=t.get('hasVocals'),
                        preview_only=t.get('isPreviewOnly'), artists=t.get('mainArtists', []),
                        moods=[m['name'] for m in t.get('moods', [])], genres=[g['name'] for g in t.get('genres', [])]))
    return out[:n]


def download(kind, id_, out, log=None, title=None, role=None, extra=None):
    """kind sfx|music. Writes out (mp3), appends a licence row to log (jsonl). Returns the row."""
    if kind == 'sfx': r = _get(f'/sound-effects/{id_}/download', quality='high')
    else: r = _get(f'/tracks/{id_}/download', format='mp3', quality='high')
    req = urllib.request.Request(r['url'], headers={'User-Agent': UA})   # signed URL, used unmodified
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with urllib.request.urlopen(req, timeout=120) as f, open(out, 'wb') as g: g.write(f.read())
    row = dict(file=out.replace(os.path.expanduser('~'), '~'), source='Epidemic Sound', kind=kind, id=id_, title=title, role=role,
               page=f'https://www.epidemicsound.com/{"sound-effects" if kind == "sfx" else "track"}/{id_}/', licence=LICENCE,
               downloaded=time.strftime('%Y-%m-%d %H:%M:%S'), **(extra or {}))
    if log:
        with open(log, 'a') as h: h.write(json.dumps(row, ensure_ascii=False) + '\n')
    return row


class MCPClient:
    """search-only MCP client (streamable HTTP JSON-RPC)."""
    def __init__(self):
        self.k = key('EPIDEMIC_SOUND_MCP_API_KEY')
        if not self.k: raise RuntimeError('no EPIDEMIC_SOUND_MCP_API_KEY')
        self.sid, self.n = None, 0
        self.rpc('initialize', dict(protocolVersion='2025-03-26', capabilities={}, clientInfo=dict(name='jack-youtube', version='1')))
        self.rpc('notifications/initialized', notify=True)

    def rpc(self, method, params=None, notify=False):
        body = dict(jsonrpc='2.0', method=method)
        if params is not None: body['params'] = params
        if not notify: self.n += 1; body['id'] = self.n
        h = {'Authorization': 'Bearer ' + self.k, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'User-Agent': UA}
        if self.sid: h['Mcp-Session-Id'] = self.sid
        with urllib.request.urlopen(urllib.request.Request(MCP, data=json.dumps(body).encode(), headers=h, method='POST'), timeout=90) as r:
            self.sid = r.headers.get('Mcp-Session-Id') or self.sid
            raw = r.read().decode('utf-8', 'replace')
        if notify: return None
        for line in raw.splitlines():   # the server sends an empty "data:" first; skip it
            if line.startswith('data:') and line[5:].strip():
                m = json.loads(line[5:].strip())
                if m.get('id') == body['id']:
                    if 'error' in m: raise RuntimeError(str(m['error'])[:300])
                    return m.get('result')
        if raw.strip().startswith('{'): return json.loads(raw).get('result')
        raise RuntimeError(f'{method}: no answer')

    def call(self, name, args):
        r = self.rpc('tools/call', dict(name=name, arguments=args))
        if r.get('structuredContent') is not None: return r['structuredContent']
        for c in r.get('content', []):
            if c.get('type') == 'text':
                try: return json.loads(c['text'])
                except ValueError: return c['text']


def main(a):
    if not a or a[0] in ('-h', '--help'): print(__doc__); return 0
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if a[0] == 'ok':
        try: search_sfx('pop', 1); print('epidemic REST ok'); return 0
        except Exception as e: print('epidemic not available:', str(e)[:200]); return 1
    if a[0] == 'sfx':
        for s in search_sfx(a[1], int(opt('--n', 8))): print(s['id'], f"{s['length']}s", s['title'])
        return 0
    if a[0] == 'music':
        b = opt('--bpm'); bpm = tuple(int(x) for x in b.split('-')) if b else None
        for t in search_music(a[1], int(opt('--n', 8)), bpm): print(t['id'], t['bpm'], f"{t['length']}s", t['title'], '|', ', '.join(t['moods'][:3]))
        return 0
    if a[0] == 'get':
        print(json.dumps(download(a[1], a[2], a[3], log=opt('--log'), title=opt('--title'), role=opt('--role')), indent=1)); return 0
    if a[0] == 'mcp-tools':
        for t in MCPClient().rpc('tools/list', {})['tools']: print(t['name'])
        return 0
    print('unknown command'); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
