// Skrollresan: sidan står stilla och fingret läses direkt, med tröghet. När resan är slut tar vanlig skroll över,
// och drar man nedåt längst upp går man tillbaka in i resan. Webbläsarens egen skroll är för ojämn på iPhone.
const TOUCH = 1.6;     // hur långt ett fingerdrag tar en
const GLIDE = 3.2;     // hur snabbt rörelsen klingar av när fingret släppts
const FOLLOW = 9;      // hur snabbt bilden hinner ikapp fingret
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const ease = (t) => 1 - Math.pow(1 - t, 3);
export const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));

/**
 * length = resans längd i skärmhöjder. draw(g, now, moving) ritar läget 0–1.
 * live() svarar true när scenen rör sig av sig själv, till exempel glöd, och ska ritas även utan skroll.
 * auto = sekunder: första svepet spelar resan till slutet av sig själv, utan att man behöver skrolla hela vägen.
 * Sidan behöver CSS-klassen html.is-locked, se base i sajtens style.css.
 */
export function startJourney({ length, draw, live = () => false, onLayout = () => {}, auto = 0 }) {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0, visible = 0, travel = 1, stale = true;
  let g = reduce ? 1 : 0, target = 0, speed = 0, touching = false, locked = false;
  let lastY = null, lastT = 0, last = performance.now(), running = false, playing = false;

  const measure = () => {
    // Adressfältet ändrar höjden under skrollen. Då ska bilden inte hoppa.
    if (innerWidth === width && !stale) return;
    width = innerWidth;
    visible = innerHeight;
    travel = visible * length;
    target = g * travel;
    onLayout(visible);
    stale = false;
  };
  const setLock = (on) => { locked = on; root.classList.toggle("is-locked", on); };
  const onStage = () => locked || scrollY < innerHeight;

  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (speed && !touching) {
      push(speed * dt * 60);
      speed *= Math.exp(-dt * GLIDE);
      if (Math.abs(speed) < 0.15) speed = 0;
    }
    if (playing) {
      g = clamp(g + dt / auto);
      target = g * travel;
      if (g >= 1) playing = false;
    }
    const goal = target / travel;
    g = clamp(g + (goal - g) * (1 - Math.exp(-dt * FOLLOW)));
    if (Math.abs(goal - g) < 0.00006) g = goal;
    // Fingret måste vara framme också, annars släpps låset direkt på väg tillbaka.
    if (locked && goal >= 0.999 && g >= 0.999) { g = 1; setLock(false); }
    const moving = Boolean(playing || speed || g !== goal || touching);
    if (onStage()) draw(g, now, moving);
    if (moving || (onStage() && live())) requestAnimationFrame(frame); else running = false;
  }
  function wake() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function push(dy) {
    if (!locked) return;
    if (auto) {
      if (dy > 0) playing = true;
      wake();
      return;
    }
    target = clamp(target + dy, 0, travel);
    wake();
  }
  function finish() {
    g = 1; target = travel; speed = 0; playing = false;
    setLock(false);
    draw(g, performance.now(), false);
  }

  measure();
  if (reduce || location.hash) finish();
  else {
    history.scrollRestoration = "manual";
    scrollTo(0, 0);
    setLock(true);
  }
  draw(g, performance.now(), false);

  if (!reduce) {
    addEventListener("wheel", (event) => {
      if (!auto && !locked && scrollY <= 0 && event.deltaY < 0) setLock(true);
      if (!locked) return;
      event.preventDefault();
      push(event.deltaY);
    }, { passive: false });
    addEventListener("touchstart", (event) => {
      speed = 0;
      lastY = event.touches[0].clientY;
      lastT = performance.now();
      touching = true;
      wake();
    }, { passive: true });
    addEventListener("touchmove", (event) => {
      if (lastY === null) return;
      const y = event.touches[0].clientY;
      const dy = (lastY - y) * TOUCH;
      if (!auto && !locked && scrollY <= 0 && dy < 0) setLock(true);
      if (!locked) { lastY = y; return; }
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      speed = (dy / Math.max(8, now - lastT)) * 16;
      lastY = y;
      lastT = now;
      push(dy);
    }, { passive: false });
    const end = () => {
      // Har fingret stått stilla före släppet ska bilden stå still.
      if (performance.now() - lastT > 90) speed = 0;
      touching = false;
      lastY = null;
      wake();
    };
    addEventListener("touchend", end, { passive: true });
    addEventListener("touchcancel", end, { passive: true });
    addEventListener("keydown", (event) => {
      if (!locked) return;
      if (["ArrowDown", " ", "PageDown"].includes(event.key)) { event.preventDefault(); push(visible * 0.5); }
      if (["ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); push(visible * -0.5); }
    });
  }
  addEventListener("resize", measure);
  addEventListener("scroll", wake, { passive: true });
  document.fonts?.ready.then(() => { stale = true; measure(); wake(); });
  wake();

  document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
    const section = document.querySelector(link.getAttribute("href"));
    if (!section) return;
    event.preventDefault();
    finish();
    scrollTo({ top: section.getBoundingClientRect().top + scrollY - 70, behavior: reduce ? "auto" : "smooth" });
  }));

  return { wake, finish };
}
