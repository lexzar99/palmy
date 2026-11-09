// Matmasters scen: omslagsbilden och fyra rätter som glider över i varandra när man skrollar.
// Ren WebGL2. En bild åt gången plus nästa, så att bara två texturer används per bildruta.
// Övergången är en mjuk diagonal våg med brus och en lätt zoom. Inga rotationer, inga lutande plan.

const VERT = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 color;
uniform sampler2D uA, uB;
uniform vec2 uRes, uSizeA, uSizeB;
uniform float uMix, uDrift;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Bilden fyller skärmen som object-fit: cover, och zoomar runt mitten
vec2 cover(vec2 uv, vec2 size, float zoom) {
  float rs = uRes.x / uRes.y, ri = size.x / size.y;
  vec2 s = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
  return (uv - 0.5) * s / zoom + 0.5;
}
void main() {
  vec2 uv = vUv;
  float n = noise(uv * vec2(3.2, 2.4) + uDrift) * 0.6 + noise(uv * 9.0 - uDrift) * 0.4;
  // Vågen går från nedre vänstra hörnet upp mot höger
  float d = uv.x * 0.55 + (1.0 - uv.y) * 0.45 + (n - 0.5) * 0.38;
  float th = mix(-0.45, 1.45, uMix);
  float b = 1.0 - smoothstep(th - 0.14, th + 0.14, d);
  // Kanten i vågen förskjuter bilderna en aning, som värme i luften
  float edge = smoothstep(0.14, 0.0, abs(d - th));
  vec2 push = vec2(n - 0.5, 0.5 - n) * 0.045 * edge;
  vec3 a = texture(uA, cover(uv + push, uSizeA, 1.0 + uMix * 0.09)).rgb;
  vec3 c = texture(uB, cover(uv - push, uSizeB, 1.09 - uMix * 0.09)).rgb;
  vec3 col = mix(a, c, b);
  col += edge * 0.05;
  // Kornighet och mörka hörn gör bilderna mindre glansiga
  col += (hash(uv * uRes + uDrift) - 0.5) * 0.035;
  float v = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(1.1, 1.0)));
  color = vec4(col * mix(0.72, 1.0, v), 1.0);
}`;

/** images: lista med { src } i den ordning de visas. Returnerar null om WebGL2 saknas, då visar sidan CSS-bilden. */
export function createScene(canvas, images) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = Object.fromEntries(["uA", "uB", "uRes", "uSizeA", "uSizeB", "uMix", "uDrift"].map((k) => [k, gl.getUniformLocation(prog, k)]));
  gl.uniform1i(u.uA, 0);
  gl.uniform1i(u.uB, 1);

  // Tills en bild har laddats används en mörk pixel i samma ton som sidan
  const textures = images.map(() => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 17, 15, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  const sizes = images.map(() => [1, 1]);
  let onReady = () => {};

  // Första bilden direkt, resten efter, så att omslaget syns så fort som möjligt
  const load = (i) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      sizes[i] = [img.naturalWidth, img.naturalHeight];
      onReady();
      resolve();
    };
    img.onerror = resolve;
    img.src = images[i].src;
  });
  load(0).then(() => Promise.all(images.slice(1).map((_, i) => load(i + 1))));

  return {
    onReady(fn) { onReady = fn; },
    layout() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    /** at = läget i bildlistan, till exempel 1.4 betyder 40 procent på väg från bild 1 till bild 2. */
    draw(at) {
      const last = images.length - 1;
      const i = Math.min(Math.floor(at), last - 1);
      const local = at - i;
      // Bilden står still i början och slutet av varje steg och glider över i mitten
      const k = Math.min(1, Math.max(0, (local - 0.22) / 0.56));
      const mix = k * k * (3 - 2 * k);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[i + 1]);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform2f(u.uSizeA, ...sizes[i]);
      gl.uniform2f(u.uSizeB, ...sizes[i + 1]);
      gl.uniform1f(u.uMix, at >= last ? 1 : mix);
      gl.uniform1f(u.uDrift, at * 0.35);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
