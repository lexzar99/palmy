#!/bin/zsh
# Rund tallrik som PNG med alfa: mäter tallriken i alfakanalen, beskär till kvadrat och maskar till cirkel.
# plate-png.sh <in.png> <ut.png> <storlek>
export PATH="/opt/homebrew/bin:$PATH"
in="$1"; out="$2"; size="$3"
W=$(ffprobe -v error -show_entries stream=width -of csv=p=0 "$in")
read sx sy d <<< "$(ffmpeg -v error -i "$in" -vf "alphaextract,format=gray,scale=512:512:flags=area" -f rawvideo - | python3 -I -c "
import sys
b=sys.stdin.buffer.read(); N=512; W=$W
rows=[i for i in range(N) if max(b[i*N:(i+1)*N])>128]
cols=[j for j in range(N) if max(b[i*N+j] for i in range(N))>128]
y0,y1,x0,x1=rows[0],rows[-1]+1,cols[0],cols[-1]+1
s=W/N; d=min(x1-x0,y1-y0)*s; cx=(x0+x1)/2*s; cy=(y0+y1)/2*s
d=int(d)//2*2; print(int(cx-d/2), int(cy-d/2), d)")"
ffmpeg -v error -y -i "$in" -vf "crop=${d}:${d}:${sx}:${sy},scale=${size}:${size}:flags=lanczos,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip((W/2*0.99-hypot(X-W/2+0.5,Y-H/2+0.5))/1.2,0,1)'" "$out"
echo "$(basename "$out") ${size}px"
