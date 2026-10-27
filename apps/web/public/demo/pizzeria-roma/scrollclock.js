// Skrollklocka för telefoner: ger en jämn skrollposition i varje bildruta, även när sidan glider.
// Samma fil ligger i pkh-site, pattaya-site, kuben-site och Romas demo. Ändra alla fyra.
//
// Uppmätt i skärminspelningar från iPhone 17 Pro (2026-10-27): med fingret på skärmen får sidan en ny scrollY i
// varje bildruta, men under glidningen efter att fingret släppt bara ungefär var 100:e ms. Allt som följde skrollen
// hackade därför tio gånger i sekunden.
//
// iOS bromsar glidningen exponentiellt: farten × 0,998 per ms (UIScrollViewDecelerationRateNormal), alltså en
// tidskonstant på 0,5 s. Det stämmer med inspelningarna. Ett Kalmanfilter följer därför läge och fart längs den
// kurvan: det startar med fingrets fart vid släppet och rättas av varje position Safari skickar. Mellan
// positionerna visas kurvan, och när filtret rättas glider visningen över utan hopp, varken i läge eller i fart.
// Simulerat mot inspelningarnas mönster: ungefär 85 gånger mindre ryck än rå scrollY, även med fel bromskurva
// och på Android (där positionerna kommer varje bildruta).
const TAU = -1 / Math.log(0.998) / 1000;   // ≈ 0,4995 s
const HORIZON = 0.25;                      // längsta förutsägelse efter en verklig position (s)
const STALE = 0.35;                        // så länge utan ny position under glidningen innan sidan räknas som stilla (s)
const SETTLE = 0.06;                       // hur snabbt en rättelse klingar av (s)
const RELEASE = 0.07;                      // fingrets sista rörelse som släppfarten skattas ur (s)
const SIGMA_T = 0.008;                     // tidsosäkerheten i en glidposition (s): den kan vara en bildruta gammal
const DRIFT = 400 * 400;                   // hur mycket farten får avvika från kurvan per sekund (px²/s³)

export function createScrollClock(wake) {
  let y = window.scrollY, ty = -1;   // senaste verkliga scrollY och när den sågs (s), −1 = okänt
  let ya = y, ta = 0, va = 0;        // kurvan som visas: läge, tid och fart (0 = står still)
  let p = 0, q = 0, te = 0;          // mjukningen: fel och felets lutning från tiden te
  let mode = "rest";                 // rest, finger eller glide
  let stale = false;                 // ett finger stoppade glidningen och Safari har inte sagt var sidan står
  let pts = [];                      // fingrets [t, y, t, y, …] för släppfarten
  let max = Infinity, tMin = 0, tRel = 0;
  let quick = 0;                     // glidpositioner i rad som kommit med en bildrutas mellanrum (Android)
  let kOn = false, kt = 0, ky = 0, kv = 0, P00 = 0, P01 = 0, P11 = 0;   // filtret: läge, fart och kovarians

  const curve = (t) => (va ? ya + va * TAU * (1 - Math.exp(-Math.min(Math.max(t - ta, 0), HORIZON) / TAU)) : ya);
  const curveV = (t) => (va && t - ta < HORIZON ? va * Math.exp(-Math.max(t - ta, 0) / TAU) : 0);
  const off = (t) => { const s = Math.max(t - te, 0); return p || q ? (p + q * s) * Math.exp(-s / SETTLE) : 0; };
  const offV = (t) => { const s = Math.max(t - te, 0); return p || q ? (q - (p + q * s) / SETTLE) * Math.exp(-s / SETTLE) : 0; };
  const shown = (t) => curve(t) + off(t);
  const atEdge = (v) => v <= 0 || v >= max - 0.5;

  // Ny kurva genom (t1, y1) med farten v1. Med smooth fortsätter visningen i samma läge och fart, och skillnaden
  // klingar av. Utan smooth fortsätter bara den mjukning som redan pågår.
  function setCurve(now, y1, t1, v1, smooth) {
    const d = shown(now), dv = curveV(now) + offV(now);
    ya = y1; ta = t1; va = v1;
    if (smooth) { p = d - curve(now); q = dv - curveV(now) + p / SETTLE; te = now; }
  }

  function kStart(t, y0, v0, sy, sv) { kOn = true; kt = t; ky = y0; kv = v0; P00 = sy * sy; P01 = 0; P11 = sv * sv; }
  function kPredict(t) {
    const dt = t - kt;
    if (dt <= 0) return;
    const e = Math.exp(-dt / TAU), g = TAU * (1 - e);
    const a00 = P00 + 2 * g * P01 + g * g * P11, a01 = e * P01 + g * e * P11, a11 = e * e * P11;
    P00 = a00 + DRIFT * dt * dt * dt / 3; P01 = a01 + DRIFT * dt * dt / 2; P11 = a11 + DRIFT * dt;
    ky += kv * g; kv *= e; kt = t;
  }
  function kUpdate(z) {
    // Positionerna strax efter släppet är ofta fingrets sista och en bildruta gamla: lita mindre på dem
    const R = ((kv * SIGMA_T) ** 2 + 0.25) * (kt - tRel < 0.035 ? 4 : 1);
    const S = P00 + R, K0 = P00 / S, K1 = P01 / S, r = z - ky;
    ky += K0 * r; kv += K1 * r;
    const n00 = (1 - K0) * P00, n01 = (1 - K0) * P01, n11 = P11 - K1 * P01;
    P00 = n00; P01 = n01; P11 = n11;
  }

  // Släppfarten: rak linje genom fingrets sista positioner. Stilla bildrutor räknas, så ett finger som stannat ger 0.
  function releaseVelocity(t) {
    let n = 0, st = 0, sy = 0, stt = 0, sty = 0;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < t - RELEASE) continue;
      const u = pts[i] - t, v = pts[i + 1];
      n++; st += u; sy += v; stt += u * u; sty += u * v;
    }
    const den = n * stt - st * st;
    return n >= 3 && den > 1e-9 ? (n * sty - st * sy) / den : 0;
  }
  function track(t, yy) { pts.push(t, yy); while (pts.length > 4 && pts[0] < t - 0.35) pts.splice(0, 2); }

  const time = () => performance.now() / 1000;
  function down() {
    const t = (tMin = time());
    measure();
    if (mode === "glide") {
      // Ett finger stoppar glidningen direkt. Visningen stannar där den är tills Safari säger var sidan står.
      setCurve(t, shown(t), t, 0, false);
      p = q = 0;
      stale = true;
    } else if (mode === "rest") stale = false;
    mode = "finger";
    pts = [];
    kOn = false;
    quick = 0;
    wake();
  }
  function up(e) {
    if (e.touches && e.touches.length) return;
    if (mode !== "finger") return;
    const t = (tMin = tRel = time());
    mode = "glide";
    if (!stale) {
      // Glidningen fortsätter fingrets rörelse från den senaste bildrutan, utan någon mjukning
      const v = atEdge(y) ? 0 : releaseVelocity(t);
      const tl = pts.length ? pts[pts.length - 2] : t;
      kStart(tl, y, v, 1 + Math.abs(v) * 0.004, 40 + Math.abs(v) * 0.12);
      setCurve(t, y, tl, v, false);
    }
    pts = [];
    wake();
  }

  function sample(ms) {
    const t = Math.max(ms / 1000, tMin), yNow = window.scrollY;
    if (yNow !== y) {
      if (mode === "finger") {
        // Fingret följs exakt: Safari ger en position i varje bildruta
        setCurve(t, yNow, t, 0, stale);
        stale = false;
        track(t, yNow);
      } else {
        const gap = ty < 0 ? 1 : t - ty;
        quick = gap <= 0.025 ? quick + 1 : 0;
        if (mode === "rest") mode = "glide";
        if (kOn) {
          // Glidning efter ett släpp: filtret rättas och kurvan förutsäger var sidan är till nästa position
          kPredict(t); kUpdate(yNow);
          if (atEdge(yNow)) kv = 0;
          setCurve(t, ky, t, kv, gap > 0.025);
        } else {
          // Skroll utan finger (en länk, eller slutläget efter ett tryck som stoppade glidningen). Den följer inte
          // iOS bromskurva, så visningen glider bara mjukt till varje position utan att gissa vidare.
          setCurve(t, yNow, t, 0, gap > 0.025);
        }
      }
      y = yNow; ty = t;
    } else if (mode === "finger" && !stale) {
      track(t, y);
      ty = t;
    } else if (mode === "glide" && (ty < 0 || t - ty > (quick >= 3 ? 0.034 : STALE))) {
      // Inga nya positioner: sidan står still där Safari senast sa. Kommer positionerna varje bildruta räcker
      // det med två stilla bildrutor.
      mode = "rest";
      kOn = false;
      setCurve(t, y, t, 0, true);
    }
    return Math.min(Math.max(shown(t), 0), max);
  }

  function measure() { max = Math.max(0, document.documentElement.scrollHeight - innerHeight); }
  measure();
  addEventListener("scroll", wake, { passive: true });
  addEventListener("touchstart", down, { passive: true });
  addEventListener("touchend", up, { passive: true });
  addEventListener("touchcancel", up, { passive: true });
  addEventListener("resize", measure);
  addEventListener("load", measure);

  return {
    sample,
    measure,
    // Behöver klockan fler bildrutor? Ja medan fingret är nere, under glidningen och tills mjukningen klingat av.
    get busy() {
      const t = time();
      return mode !== "rest" || Math.abs(off(t)) > 0.05 || Math.abs(offV(t)) > 2;
    },
  };
}
