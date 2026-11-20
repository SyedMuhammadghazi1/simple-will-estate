#!/usr/bin/env bash
# Downloads the official GTA VI artwork this reel uses from rockstargames.com/VI and prepares it
# in ./assets (logos, key art, and the site's animated stickers as transparent sprite sheets).
# The files are Rockstar Games' property; they are not committed to this repository. Use them
# only as your agreement with Rockstar / Take-Two allows.
#
#   bash marketing/reel-kit/reels/echelons-gta-maths/fetch-assets.sh
#
# Needs curl and ffmpeg (with libwebp). Rockstar renames these files when it updates the site;
# if a download fails, open the page, find the new name of the same image and update it below.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p assets .src
BASE="https://www.rockstargames.com/VI/_next/static/media"
get() { [ -s ".src/$1" ] || curl -fsS -A "Mozilla/5.0" "$BASE/$1" -o ".src/$1"; }

# The logo files are mostly transparent padding. Crop each to its artwork (plus a small margin)
# so the size set in reel.json is the size the logo is drawn at.
trim() {
  local c w h x y m=16
  c=$(ffmpeg -hide_banner -loop 1 -i "$1" -frames:v 3 \
    -vf "format=rgba,alphaextract,cropdetect=limit=0.02:round=2:skip=0:reset=0" -f null - 2>&1 |
    grep -o "crop=[0-9:]*" | tail -1 || true)
  if [ -z "$c" ]; then
    cp "$1" "$2"
    return
  fi
  IFS=: read -r w h x y <<<"${c#crop=}"
  x=$((x > m ? x - m : 0))
  y=$((y > m ? y - m : 0))
  ffmpeg -v error -y -i "$1" -vf "crop='min($((w + 2 * m)),iw-$x)':'min($((h + 2 * m)),ih-$y)':$x:$y" "$2"
}

# name in this reel -> file on rockstargames.com
declare -A ART=(
  [logo-gta6-wide.png]="poster_logo.0m-7c805zusl7.png"
  [logo-gta6-tall.png]="poster_logo.0c1t44bwef8fc.png"
  [logo-vi.png]="logo_vi.13u0vs8.9roug.png"
  [keyart-wide.jpg]="poster_full.10y8e6nwjx9t5.jpg"
  [keyart-tall.jpg]="poster_full.02ig6s_80ei58.jpg"
  [jason-lucia-sunset.jpg]="trailer-1.06b6paykx247w.jpg"
  [jason-lucia-dock.jpg]="trailer-2.0l.7aqib91fz6.jpg"
  [jason-lucia-car.jpg]="launch-trailer.0cq1gbt4507ty.jpg"
  [jason-lucia-car-wide.jpg]="launch-trailer.0_q-sdrgufc.s.jpg"
  [leonida-night.jpg]="onlyInLeonidaMobile.0mupfnk-x6x~r.jpg"
  [leonida-pool.jpg]="screenshotsMobile.01nsldjqbta4u.jpg"
  [vice-city-poster.jpg]="intro-mobile.0.97ufm766d4x.png"
  [walk.jpg]="an-extended-look-mobile.0f0-3vo3w9u26.jpg"
  [couple-sunset.jpg]="musicMobile.16pdg34v6lit..jpg"
  [rooftop.jpg]="pre-load-mobile.0w0e-.3-xgjgh.jpg"
  [city-night.jpg]="mobile.0mi46.hy2kwfa.jpg"
  [city-night-wide.jpg]="desktop.00.5pzu2sm-z4.jpg"
  [neon-car.jpg]="VINTAGE_VICE_CITY_PACK_VAPID_STANIER_01.004m_8d1~qngy.jpg"
)
for out in "${!ART[@]}"; do
  src="${ART[$out]}"
  get "$src"
  case "$out" in
    *.png) trim ".src/$src" "assets/$out" ;;
    *) ffmpeg -v error -y -i ".src/$src" -vf "scale='min(3840,iw)':-2" -q:v 3 "assets/$out" ;;
  esac
done

# animated stickers: each video stacks the colour (top) over its alpha mask (bottom); they become
# 10-column sprite sheets of 420 px wide frames (frame counts and sizes are in reel.json)
declare -A STICKERS=(
  [truck]="1920_hvec.0-0dho2m~tnyr.mp4"
  [sun]="1920_hvec.08xz5161.ed04.mp4"
  [flamingo]="1920_hvec.0_ji97d~ir4ki.mp4"
  [gator]="1920_hvec.0f-99y62dfbwx.mp4"
  [palm]="1920_hvec.0gyb6md9cezo~.mp4"
  [manatee]="1920_hvec.0hngqdd_9x2p3.mp4"
  [crab]="1920_hvec.0nk5gih2-3jni.mp4"
)
for k in "${!STICKERS[@]}"; do
  f=".src/${STICKERS[$k]}"
  get "${STICKERS[$k]}"
  H=$(ffprobe -v error -show_entries stream=height -of csv=p=0 "$f")
  h=$((H / 2))
  n=$(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$f")
  sh=$(((h * 420 / 1920 + 1) / 2 * 2))
  rows=$(((n + 9) / 10))
  ffmpeg -v error -y -i "$f" -filter_complex \
    "[0:v]split[a][b];[a]crop=1920:$h:0:0[c];[b]crop=1920:$h:0:$h,format=gray[m];[c][m]alphamerge,scale=420:$sh,tile=10x$rows" \
    -frames:v 1 -c:v libwebp -q:v 82 "assets/sticker-$k.webp"
  echo "sticker-$k.webp: $n frames of 420x$sh"
done
echo "assets ready in $(pwd)/assets"
