#!/bin/zsh
# Bygger de två annonsklippen med alfakanal (qtrle) ur filmerna och de fångade lagren.
# breaks.sh <mapp med clips/> <degfilm.mp4> <grillfilm.mp4>
#   degfilmen: Pexels 30771191 (1080×1920), avsnittet 4,2–9,2 s är utan person i bild
#   grillfilmen: Pixabay 124830 (3840×2160)
export PATH="/opt/homebrew/bin:$PATH"
C="$1/clips"; DEG="$2"; GRILL="$3"
Z="(1+0.06*pow(1-min(t/3.4,1),2))"   # bakgrunden zoomar sakta från 1,06 till 1 på 3,4 s
RISE="x=0:y='26*pow(1-clip((t-0.1)/0.9,0,1),4)':format=auto:shortest=1"   # texten glider upp 26 px

ffmpeg -v error -y -ss 4.2 -t 5.2 -i "$DEG" -loop 1 -framerate 25 -t 5 -i "$C/break-order-grad.png" -loop 1 -framerate 25 -t 5 -i "$C/break-order-text.png" \
  -filter_complex "[0:v]fps=25,setpts=PTS-STARTPTS,scale=w='trunc(1080*${Z}/2)*2':h='trunc(1920*${Z}/2)*2':eval=frame:flags=lanczos,crop=1080:1920,setsar=1,format=rgba[bg];[bg][1:v]overlay=0:0:format=auto:shortest=1[g];[2:v]format=rgba,fade=t=in:st=0.1:d=0.9:alpha=1[tx];[g][tx]overlay=${RISE},format=argb,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=4.65:d=0.35:alpha=1[out]" \
  -map "[out]" -an -frames:v 125 -c:v qtrle "$C/order.mov"

ffmpeg -v error -y -t 3.2 -i "$GRILL" -loop 1 -framerate 25 -t 3 -i "$C/break-brand-grad.png" -loop 1 -framerate 25 -t 3 -i "$C/break-brand-text.png" \
  -filter_complex "[0:v]fps=25,crop=1215:2160:(iw-1215)*0.38:0,scale=w='trunc(1080*${Z}/2)*2':h='trunc(1920*${Z}/2)*2':eval=frame:flags=lanczos,crop=1080:1920,setsar=1,format=rgba[bg];[bg][1:v]overlay=0:0:format=auto:shortest=1[g];[2:v]format=rgba,fade=t=in:st=0.1:d=0.9:alpha=1[tx];[g][tx]overlay=${RISE},format=argb,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=2.65:d=0.35:alpha=1[out]" \
  -map "[out]" -an -frames:v 75 -c:v qtrle "$C/brand.mov"
echo "klar: $C/order.mov $C/brand.mov"
