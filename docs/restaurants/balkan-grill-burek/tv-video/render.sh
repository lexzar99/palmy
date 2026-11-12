#!/bin/zsh
# Renderar TV-menyn som video: tavlan, sex tallrikar och fyra små tallrikar som vrids sakta,
# och de två annonserna på sina platser. Varvtiderna går jämnt upp i 720 s, så loopen är sömlös.
# render.sh <längd s> <beställ-start s> <logga-start s> <ut.mp4>
export PATH="/opt/homebrew/bin:$PATH"
V=${0:a:h}; C="$V/clips"; P="$V/plates"
DUR=$1; ORDER_AT=$2; BRAND_AT=$3; OUT=$4

# namn x y varvtid förskjutning (s). Storlek: stora 244 px, små 52 px (i 1080×1920)
big=(cevapi:76:184:144:0 grillmix:418:184:180:40 pljeskavica:760:184:240:95 skenderbeg:76:582:180:20 sofra:418:582:240:130 burek:760:582:144:70)
small=(hamburgare:36:1101:360:0 entrecote:447:1101:360:90 shopska:447:1348:360:180 baklava:790:1101:360:270)

args=(-loop 1 -framerate 25 -t $DUR -i "$C/base1080.png")
graph=""; last="0:v"; n=1
add() { # namn x y varv off storlek
  args+=(-loop 1 -framerate 25 -i "$P/${1}.png")
  graph+="[${n}:v]format=rgba,rotate=a='2*PI*(t+${5})/${4}':c=none:ow=iw:oh=ih:bilinear=1,scale=${6}:${6}:flags=lanczos[p$n];"
  graph+="[$last][p$n]overlay=x=${2}:y=${3}:format=auto:eof_action=repeat[v$n];"
  last="v$n"; n=$((n + 1))
}
for s in $big; do IFS=: read nm x y per off <<< "$s"; add $nm $x $y $per $off 244; done
for s in $small; do IFS=: read nm x y per off <<< "$s"; add $nm $x $y $per $off 52; done

# Annonserna läggs på vid sina tider. De har egen toning in och ut i alfakanalen.
args+=(-itsoffset $ORDER_AT -i "$C/order.mov" -itsoffset $BRAND_AT -i "$C/brand.mov")
graph+="[$last][${n}:v]overlay=0:0:format=auto:eof_action=pass[o1];"; n=$((n + 1))
graph+="[o1][${n}:v]overlay=0:0:format=auto:eof_action=pass[o2];"; n=$((n + 1))
# RGB till BT.709 med begränsat omfång, som TV-apparater förväntar sig
graph+="[o2]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[out]"

args+=(-f lavfi -t $DUR -i "anullsrc=r=48000:cl=stereo")
ffmpeg -v error -stats -y "${args[@]}" -filter_complex "$graph" -map "[out]" -map "${n}:a" -t $DUR -r 25 \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -x264-params "keyint=50:min-keyint=25:aq-mode=3:colorprim=bt709:transfer=bt709:colormatrix=bt709" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 32k -movflags +faststart "$OUT"
