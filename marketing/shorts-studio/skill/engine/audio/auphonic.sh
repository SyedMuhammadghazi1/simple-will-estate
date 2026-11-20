#!/bin/zsh
# copied from ~/code/audio-enhanced/auphonic.sh (21 Oct 2026). Output still carries the ~6.42 s Auphonic intro: voice.py align cuts it.
# usage: auphonic.sh <in-audio> <out.wav> <title>   (key: AUPHONIC_API_KEY in ~/.shorts-studio/.env)
set -e
IN="$1"; OUT="$2"; T="$3"
K="${AUPHONIC_API_KEY:-$(grep -hs '^AUPHONIC_API_KEY=' .env ~/.shorts-studio/.env | head -1 | cut -d= -f2)}"; H="Authorization: bearer $K"
UUID=$(curl -s -X POST https://auphonic.com/api/productions.json -H "$H" -H "Content-Type: application/json" \
 -d "{\"metadata\":{\"title\":\"$T\"},\"output_files\":[{\"format\":\"wav\"}],\"algorithms\":{\"leveler\":true,\"loudnesstarget\":-14,\"denoise\":true,\"denoisemethod\":\"dynamic\",\"filtering\":true,\"filtermethod\":\"studiovoice\",\"gate\":true}}" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['uuid'])")
curl -s -X POST "https://auphonic.com/api/production/$UUID/upload.json" -H "$H" -F "input_file=@$IN" >/dev/null
curl -s -X POST "https://auphonic.com/api/production/$UUID/start.json" -H "$H" >/dev/null
for i in $(seq 1 60); do sleep 10
  J=$(curl -s "https://auphonic.com/api/production/$UUID.json" -H "$H")
  ST=$(echo "$J" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(d['status'])")
  [[ "$ST" == 3 ]] && break; [[ "$ST" == 2 || "$ST" == 9 || "$ST" == 11 || "$ST" == 13 ]] && { echo "[$T] FAILED $ST"; exit 1; }
done
URL=$(echo "$J" | python3 -c "import json,sys,urllib.parse;print(urllib.parse.quote(json.load(sys.stdin)['data']['output_files'][0]['download_url'],safe=':/?=&%'))")
curl -s -L "$URL" -H "$H" -o "$OUT"; echo "[$T] done -> $OUT"
