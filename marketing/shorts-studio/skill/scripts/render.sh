#!/usr/bin/env bash
# render.sh: render a project to MP4.
# usage: bash scripts/render.sh <project dir> <out.mp4> [draft|high] [composition.html]
set -e
HF="npx --yes hyperframes@${HF_VERSION:-0.8.181}"
DIR=$(cd "${1:?usage: render.sh <dir> <out.mp4> [draft|high]}" && pwd)
OUT=${2:?need an output path}; Q=${3:-draft}; C=${4:-}
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac
mkdir -p "$(dirname "$OUT")"
ARGS=(render "$DIR" -o "$OUT" -q "$Q" --quiet)
[ -n "$C" ] && ARGS+=(-c "$C")
$HF "${ARGS[@]}"
ffprobe -v error -show_entries format=duration:stream=width,height -of compact=p=0 "$OUT" | tr '\n' ' '; echo
echo "rendered: $OUT"
