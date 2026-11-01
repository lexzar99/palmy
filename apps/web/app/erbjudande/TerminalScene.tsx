"use client";
import { useEffect, useRef } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { atJourney } from "./visitStats";

const ART = "/erbjudande/gl";
/** Terminalens skärm i bilden, som andel av bilden. */
const SCREEN = { x: 0.1694, y: 0.2867, w: 0.6593, h: 0.6367 };
/** Skrivarens springa i bilden, som andel av bilden. */
const SLOT = { x: 0.24, y: 0.248, w: 0.52 };
/** Kvittots proportioner, höjd delat med bredd. */
const RECEIPT_RATIO = 610 / 400;
/** Hur nära kameran går kvittot. */
const MAX_ZOOM = 1.85;
/** Resans längd i skärmhöjder. */
const JOURNEY = 6;
/** Hur långt ett fingerdrag tar en. */
const TOUCH = 1.6;
/** Hur snabbt rörelsen klingar av när fingret släpps. */
const GLIDE = 3.2;
/** Hur snabbt bilden hinner ikapp fingret. */
const FOLLOW = 9;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const VERTEX = `attribute vec2 p;uniform vec4 box;uniform vec4 uv;uniform vec2 size;varying vec2 v;
void main(){vec2 q=box.xy+p*box.zw;gl_Position=vec4(q.x/size.x*2.-1.,1.-q.y/size.y*2.,0,1);v=uv.xy+p*uv.zw;}`;
const FRAGMENT = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform float a;void main(){gl_FragColor=texture2D(t,v)*a;}`;

/** Hela resan ritas i ett enda WebGL-lager. Det är det som gör rörelsen jämn på telefon. */
export default function TerminalScene() {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const compare = useRef<HTMLElement>(null);
  const signup = useRef<HTMLElement>(null);

  useEffect(() => {
    const view = canvas.current;
    const box = stage.current;
    if (!view || !box) return;
    const gl = view.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "high-performance" }) as WebGL2RenderingContext | null;
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.bindAttribLocation(program, 0, "p");
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "p"), 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const uBox = gl.getUniformLocation(program, "box");
    const uUv = gl.getUniformLocation(program, "uv");
    const uSize = gl.getUniformLocation(program, "size");
    const uAlpha = gl.getUniformLocation(program, "a");

    const textures: Record<string, WebGLTexture | null> = {};
    const load = async (name: string) => {
      const image = new Image();
      image.src = `${ART}/${name}.webp`;
      await image.decode();
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textures[name] = texture;
    };

    const shade = document.createElement("canvas");
    shade.width = 4;
    shade.height = 128;
    const paint = shade.getContext("2d")!;
    const fade = paint.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, "rgba(0,0,0,0.5)");
    fade.addColorStop(0.62, "rgba(0,0,0,0.42)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    paint.fillStyle = fade;
    paint.fillRect(0, 0, 4, 128);
    textures.toning = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textures.toning);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shade);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const quad = (name: string, x: number, y: number, w: number, h: number, alpha = 1, u = 0, v = 0, us = 1, vs = 1) => {
      const texture = textures[name];
      if (!texture || alpha <= 0) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform4f(uBox, x, y, w, h);
      gl.uniform4f(uUv, u, v, us, vs);
      gl.uniform1f(uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    /** Ritar en bild som täcker hela ytan, centrerad och skalad kring mitten. */
    const cover = (name: string, zoom: number, alpha = 1) => {
      const h = Math.max(vh, vw * 1.7778) * zoom;
      const w = h * 0.5625;
      quad(name, (vw - w) / 2, (vh - h) / 2, w, h, alpha);
    };

    let raf = 0;
    let vw = 0;
    let vh = 0;
    let visibleHeight = 0;
    let lastWidth = 0;
    let copyBottom = 0;
    let g = 0;
    let target = 0;
    let speed = 0;
    let touching = false;
    let locked = true;
    let ready = false;
    let lastY: number | null = null;
    let lastT = 0;
    let last = performance.now();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const measure = () => {
      if (intro.current) copyBottom = intro.current.offsetTop + intro.current.offsetHeight;
    };
    const layout = () => {
      // Adressfältet på mobilen ändrar höjden under skrollen. Då ska bilden inte hoppa.
      if (window.innerWidth === lastWidth && visibleHeight) return;
      measure();
      lastWidth = window.innerWidth;
      visibleHeight = window.innerHeight;
      vw = box.clientWidth;
      vh = box.clientHeight;
      // Samma tak som referenssidorna: högst dubbel pixeltäthet.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.width = Math.round(vw * dpr);
      view.height = Math.round(vh * dpr);
      gl.viewport(0, 0, view.width, view.height);
      gl.uniform2f(uSize, vw, vh);
    };

    const travel = () => visibleHeight * JOURNEY;
    const lock = (on: boolean) => {
      locked = on;
      document.documentElement.classList.toggle("fs-lock", on);
    };
    const push = (dy: number) => {
      if (locked) target = clamp(target + dy, 0, travel());
    };
    const show = (el: HTMLElement | null, value: number, scale: number) => {
      if (!el) return;
      el.style.opacity = String(value);
      el.style.visibility = value > 0 ? "visible" : "hidden";
      el.style.pointerEvents = value > 0.6 ? "auto" : "none";
      el.style.transform = `translate3d(-50%, -50%, 0) scale(${scale})`;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!ready || (!locked && window.scrollY > vh)) return;
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      if (speed && !touching) {
        push(speed * dt * 60);
        speed *= Math.exp(-dt * GLIDE);
        if (Math.abs(speed) < 0.15) speed = 0;
      }
      const goal = target / travel();
      g = clamp(g + (goal - g) * (still ? 1 : 1 - Math.exp(-dt * FOLLOW)));
      if (Math.abs(goal - g) < 0.00006) g = goal;
      // Fingret måste vara framme också, annars släpps låset direkt på väg tillbaka.
      if (locked && goal >= 0.999 && g >= 0.999) lock(false);

      if (locked) atJourney(g);

      if (intro.current) {
        intro.current.style.opacity = String(1 - clamp(g / 0.05));
        intro.current.style.transform = `translate3d(0, ${-g * 300}px, 0)`;
      }
      if (cue.current) cue.current.style.opacity = String(1 - clamp(g / 0.03));

      const zoom = smooth(clamp((g - 0.1) / 0.3));
      const leave = smooth(clamp((g - 0.62) / 0.08));
      const t = now / 1000;

      cover("djungel", 1.04 + zoom * 0.1 + leave * 0.3);
      // Toningen bakom rubriken ligger under terminalen, så loggan och skärmen behåller sina färger.
      quad("toning", 0, 0, vw, visibleHeight * 0.48, 1 - clamp(g / 0.05));
      const base = Math.min(vw * 0.84, visibleHeight * 0.385);
      const scale = lerp(1, MAX_ZOOM, zoom);
      const w = base * scale;
      const h = w * 1.7778;
      // Terminalen börjar alltid under texten, även på låga skärmar.
      const startY = Math.max(visibleHeight * 0.5 - base * 0.889 + visibleHeight * 0.1, copyBottom + 14);
      const endY = visibleHeight * 0.9 - SLOT.y * h;
      const buzz = !still && g > 0.01 && g < 0.09 ? Math.sin(t * 70) * 0.7 : 0;
      const x = (vw - w) / 2 + buzz;
      const y = lerp(startY, endY, zoom) + leave * visibleHeight * 1.3;

      if (leave < 1) {
        quad("terminal", x, y, w, h);
        const sx = x + SCREEN.x * w;
        const sy = y + SCREEN.y * h;
        quad("order", sx, sy, SCREEN.w * w, SCREEN.h * h);
        quad("pagaende", sx, sy, SCREEN.w * w, SCREEN.h * h, smooth(clamp((g - 0.07) / 0.04)));
        // Kvittot matas upp ur springan. Bara den del som kommit ut ritas.
        const out = smooth(clamp((g - 0.1) / 0.38));
        if (out > 0) {
          const rw = SLOT.w * w;
          const rh = rw * RECEIPT_RATIO * out;
          quad("kvitto", x + SLOT.x * w, y + SLOT.y * h - rh, rw, rh, 1, 0, 0, 1, out);
        }
      }
      cover("blad", 1.04 + zoom * 0.5 + leave * 0.8, 1 - leave);

      const a = clamp((g - 0.66) / 0.05) * (1 - clamp((g - 0.82) / 0.04));
      show(compare.current, a, lerp(0.9, 1.04, clamp((g - 0.66) / 0.2)));
      const b = clamp((g - 0.85) / 0.05);
      show(signup.current, b, lerp(0.9, 1, smooth(b)));
    };

    const inForm = (e: Event) => Boolean((e.target as HTMLElement).closest?.(".lead-overlay"));
    const wheel = (e: WheelEvent) => {
      if (inForm(e)) return;
      if (!locked && window.scrollY <= 0 && e.deltaY < 0) lock(true);
      if (!locked) return;
      e.preventDefault();
      push(e.deltaY);
    };
    const touchStart = (e: TouchEvent) => {
      speed = 0;
      lastY = inForm(e) ? null : e.touches[0].clientY;
      lastT = performance.now();
      touching = true;
    };
    const touchMove = (e: TouchEvent) => {
      if (lastY === null) return;
      const y = e.touches[0].clientY;
      const dy = (lastY - y) * TOUCH;
      // Drar man nedåt längst upp på sidan går man tillbaka in i resan.
      if (!locked && window.scrollY <= 0 && dy < 0) lock(true);
      if (!locked) { lastY = y; return; }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      speed = (dy / Math.max(8, now - lastT)) * 16;
      lastY = y;
      lastT = now;
      push(dy);
    };
    const touchEnd = () => {
      // Har fingret stått stilla före släppet ska bilden stå still.
      if (performance.now() - lastT > 90) speed = 0;
      touching = false;
      lastY = null;
    };
    const key = (e: KeyboardEvent) => {
      if (inForm(e) || !locked) return;
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") { e.preventDefault(); push(visibleHeight * 0.5); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); push(visibleHeight * -0.5); }
    };

    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    lock(true);
    layout();
    raf = requestAnimationFrame(frame);
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", layout);
    void Promise.all(["djungel", "terminal", "blad", "order", "pagaende", "kvitto"].map(load)).then(() => {
      // Typsnittet har laddats nu, så textens höjd är slutgiltig.
      measure();
      ready = true;
      box.classList.add("on");
    });

    return () => {
      cancelAnimationFrame(raf);
      lock(false);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", layout);
    };
  }, []);

  return (
    <section className="fs" aria-label="Gratis beställningssystem för din restaurang">
      <div ref={stage} className="fs-stage">
        <canvas ref={canvas} className="fs-gl" aria-hidden="true" />
        <p className="fs-brand">viaeats</p>
        <div ref={intro} className="fs-copy">
          <h1>Få ett gratis beställningssystem.</h1>
          <p>Hemsida, onlinebeställning och terminal. Vi sköter allt.</p>
        </div>
        <div ref={cue} className="fs-cue">Skrolla <ChevronDown size={20} aria-hidden="true" /></div>
        <article ref={compare} className="fc fc-compare">
          <h2>Billigare än Lumit och foodora.</h2>
          <div><span>foodora, med bud</span><b>20–30 %</b><i style={{ width: "100%" }} /></div>
          <div><span>Lumit, upp till</span><b>7 %</b><i style={{ width: "23.3%" }} /></div>
          <div className="us"><span>viaeats</span><b>5 %</b><i style={{ width: "16.7%" }} /></div>
          <small>5 % per order. Lumit: högst 7 % enligt lumit.com. foodora: med bud, varierar per avtal. Priser exklusive moms.</small>
        </article>
        <article ref={signup} className="fc fc-go">
          <h2>Anmäl intresse.</h2>
          <p>Det tar 20 sekunder. Vi ringer upp och fixar resten.</p>
          <a href="#registrera">Anmäl intresse <ArrowRight size={20} aria-hidden="true" /></a>
        </article>
      </div>
    </section>
  );
}
