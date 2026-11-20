#!/bin/bash
# Short mode: render the final picture and the two transparent layers, one after the other (leaves no browser running).
# usage: render.sh <project> [final] [graphics] [captions]
#   final    -> work/renders/final.mp4 (picture only; the audio step muxes the mix into deliver/final.mp4)
#   graphics -> work/renders/graphics.mov (ProRes 4444 alpha, for Premiere) + deliver/layers/graphics.webm (VP9 alpha)
#   captions -> work/renders/captions.mov + deliver/layers/captions.webm
# Run gen.py first. Workers default to 6 so a second render on the Mac does not starve (set WORKERS=auto to use all cores).
set -u
P="$(cd "$1" && pwd)"; shift
WD="$P/work"; HFV="hyperframes@0.8.181"; W="${WORKERS:-6}"
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1
mkdir -p "$WD/renders" "$P/deliver/layers"
cd "$WD"
for job in "$@"; do
  case $job in
    final) cp comps/final.html hf/index.html
           (cd hf && npx --yes $HFV render --quality looks -w "$W" --output ../renders/final.mp4 < /dev/null > ../renders/final.log 2>&1); echo "final exit $?";;
    captions|graphics) cp comps/layer-$job.html hf/index.html
           (cd hf && npx --yes $HFV render --format mov --quality looks -w "$W" --output ../renders/$job.mov < /dev/null > ../renders/$job.log 2>&1); echo "$job exit $?"
           ffmpeg -v error -y -i renders/$job.mov -an -r 30 -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf 28 -row-mt 1 -deadline good -cpu-used 3 "$P/deliver/layers/$job.webm"; echo "$job webm exit $?";;
  esac
done
cp comps/final.html hf/index.html
O=$(ps -axo ppid=,command= | awk '$1==1 && /chrome-headless-shell/ && !/--type=/' | wc -l | tr -d ' ')
echo "RENDERDONE (orphan headless Chrome left: $O)"
