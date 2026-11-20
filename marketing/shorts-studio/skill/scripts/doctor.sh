#!/usr/bin/env bash
# doctor.sh: check the tools this skill needs. Prints one fix command for each missing tool.
ok=1
say() { printf '%-11s %s\n' "$1" "$2"; }
if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$v" -ge 22 ]; then say node "ok ($(node -v))"; else say node "too old ($(node -v)). Fix: install Node 22 or newer from https://nodejs.org"; ok=0; fi
else say node "missing. Fix: install Node 22 or newer from https://nodejs.org"; ok=0; fi
for t in ffmpeg ffprobe; do command -v $t >/dev/null && say $t ok || { say $t "missing. Fix: brew install ffmpeg"; ok=0; }; done
command -v python3 >/dev/null && say python3 ok || { say python3 "missing. Fix: brew install python"; ok=0; }
python3 -c "import numpy" 2>/dev/null && say numpy ok || { say numpy "missing. Fix: pip3 install numpy"; ok=0; }
command -v whisper-cli >/dev/null || command -v whisper-cpp >/dev/null && say whisper ok || say whisper "not found yet. If captions fail: brew install whisper-cpp"
if [ -n "$AUPHONIC_API_KEY" ] || grep -qs '^AUPHONIC_API_KEY=' .env ~/.shorts-studio/.env; then
  say auphonic "key found (not shown)"
else
  say auphonic "no key (optional). For a studio-clean voice add AUPHONIC_API_KEY=your_key to a .env file in this folder. Get it at https://auphonic.com"
fi
[ $ok = 1 ] && echo "ready" || { echo "fix the lines above, then run this again"; exit 1; }
