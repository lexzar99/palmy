var e=()=>new Promise(e=>requestAnimationFrame(()=>e()));function t(e){let t=new Image;return t.decoding=`async`,t.src=e,t.decode().then(()=>t)}async function n(n,{sdf:r,logo:i,photo:a}){let o=n.getContext(`webgl`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,powerPreference:`high-performance`});if(!o)return null;let s=(e,t)=>{let n=o.createShader(e);if(o.shaderSource(n,t),o.compileShader(n),!o.getShaderParameter(n,o.COMPILE_STATUS))throw Error(o.getShaderInfoLog(n));return n},c=o.createProgram();if(o.attachShader(c,s(o.VERTEX_SHADER,`
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`)),o.attachShader(c,s(o.FRAGMENT_SHADER,`
precision highp float;
uniform vec2 uRes;          // canvasens storlek i enhetspixlar
uniform vec4 uHole;         // elefanternas ruta: x, y, bredd, höjd (enhetspixlar, y nedåt)
uniform vec4 uPhoto;        // fotots ruta (täcker skärmen)
uniform float uPxPerTexel;  // enhetspixlar per texel i avståndsfältet
uniform float uFade;        // 0 = röda elefanterna, 1 = fotot syns i formen
uniform float uOpen;        // 0 = ram runt formen, 1 = hela fotot
uniform float uShade;       // mörk toning nedtill när man är inne
uniform sampler2D uSdf;
uniform sampler2D uLogo;
uniform sampler2D uImg;
const float R = 12.0;       // avståndsomfånget i texlar, samma som när fältet genererades
const vec3 GLOW = vec3(0.1137, 0.1647, 0.4784);   // #1d2a7a
const vec3 NIGHT = vec3(0.0549, 0.0784, 0.2510);  // #0e1440

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 m = (p - uHole.xy) / uHole.zw;
  float mask = 0.0;
  vec4 logo = vec4(0.0);
  if (m.x >= 0.0 && m.x <= 1.0 && m.y >= 0.0 && m.y <= 1.0) {
    float d = (texture2D(uSdf, m).r - 0.5) * 2.0 * R * uPxPerTexel;
    mask = clamp(d + 0.5, 0.0, 1.0);
    logo = texture2D(uLogo, m);
  }
  vec2 c = uHole.xy + uHole.zw * vec2(0.5, 0.55);
  float t = clamp(length((p - c) / vec2(uHole.z * 1.3, uHole.z)), 0.0, 1.0);
  vec3 bg = mix(GLOW, NIGHT, t);
  vec3 photo = texture2D(uImg, (p - uPhoto.xy) / uPhoto.zw).rgb;
  vec3 logoCol = logo.rgb + (1.0 - logo.a) * bg;
  vec3 col = mix(bg, mix(logoCol, photo, uFade), mix(mask, 1.0, uOpen));
  float up = 1.0 - p.y / uRes.y;
  float a = up < 0.55 ? mix(0.9, 0.2, up / 0.55) : mix(0.2, 0.35, (up - 0.55) / 0.45);
  gl_FragColor = vec4(mix(col, NIGHT, a * uShade), 1.0);
}
`)),o.linkProgram(c),!o.getProgramParameter(c,o.LINK_STATUS))throw Error(o.getProgramInfoLog(c));o.useProgram(c);let l=o.createBuffer();o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferData(o.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),o.STATIC_DRAW);let u=o.getAttribLocation(c,`aPos`);o.enableVertexAttribArray(u),o.vertexAttribPointer(u,2,o.FLOAT,!1,0,0);let[d,f,p]=await Promise.all([t(r),t(i),t(a)]),m=(e,t,n)=>{let r=o.createTexture();o.activeTexture(o.TEXTURE0+e),o.bindTexture(o.TEXTURE_2D,r),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n),o.texImage2D(o.TEXTURE_2D,0,o.RGBA,o.RGBA,o.UNSIGNED_BYTE,t),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE)};m(0,d,!1),await e(),m(1,f,!0),await e(),m(2,p,!1),await e();let h=e=>o.getUniformLocation(c,e);o.uniform1i(h(`uSdf`),0),o.uniform1i(h(`uLogo`),1),o.uniform1i(h(`uImg`),2);let g={res:h(`uRes`),hole:h(`uHole`),photo:h(`uPhoto`),ppt:h(`uPxPerTexel`),fade:h(`uFade`),open:h(`uOpen`),shade:h(`uShade`)},_=d.naturalWidth,v=p.naturalWidth/p.naturalHeight,y=1,b=0,x=0;return{setSize(e,t){y=Math.min(window.devicePixelRatio||1,3),b=e,x=t,n.width=Math.round(e*y),n.height=Math.round(t*y),o.viewport(0,0,n.width,n.height),o.uniform2f(g.res,n.width,n.height);let r=Math.max(b,x*v),i=r/v;o.uniform4f(g.photo,(b-r)/2*y,(x-i)/2*y,r*y,i*y)},render({x:e,y:t,w:n,h:r,fade:i,open:a,shade:s}){o.uniform4f(g.hole,e*y,t*y,n*y,r*y),o.uniform1f(g.ppt,n*y/_),o.uniform1f(g.fade,i),o.uniform1f(g.open,a),o.uniform1f(g.shade,s),o.drawArrays(o.TRIANGLE_STRIP,0,4)}}}export{n as createPortalGL};