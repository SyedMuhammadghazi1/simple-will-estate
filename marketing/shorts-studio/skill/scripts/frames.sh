#!/usr/bin/env bash
# frames.sh: grab stills from a video with a 10 x 10 grid drawn on top, so you can read where the face is.
# usage: bash scripts/frames.sh <video> <out dir> [how many, default 4]
# Each grid square is 10% of the width and 10% of the height. Write the face box as
# [left, top, right, bottom] in percent, with a little extra room around the head and hands.
set -e
V=${1:?usage: frames.sh <video> <out dir> [n]}; OUT=${2:?need an out dir}; N=${3:-4}
mkdir -p "$OUT"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
for i in $(seq 1 "$N"); do
  T=$(python3 -c "print(round($D * ($i - 0.5) / $N, 2))")
  ffmpeg -v error -y -ss "$T" -i "$V" -frames:v 1 \
    -vf "scale=960:-2,drawgrid=w=iw/10:h=ih/10:t=1:c=white@0.55" -q:v 5 "$OUT/frame-$i-at-${T}s.jpg"
  echo "$OUT/frame-$i-at-${T}s.jpg"
done
