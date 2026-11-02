// Film som styrs av skrollen: en bildserie ritas på en canvas. En vanlig video hackar när man spolar den på iPhone,
// medan bilder går att visa exakt i varje bildruta och åt båda hållen.
export function createFrames(canvas, { path, count, fit = "cover" }) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const images = new Array(count);
  let wanted = 0, drawn = -1, width = 0, height = 0;

  const name = (i) => `${path}/${String(i + 1).padStart(3, "0")}.webp`;
  const load = (i) => new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { images[i] = image; resolve(); };
    image.onerror = resolve;
    image.src = name(i);
  });

  function paint() {
    // Saknas bilden visas närmaste laddade, så att bilden aldrig blir tom.
    let i = wanted;
    while (i > 0 && !images[i]) i -= 1;
    const image = images[i];
    if (!image || (i === drawn && width === canvas.width)) return;
    const scale = (fit === "cover" ? Math.max : Math.min)(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    drawn = i;
    width = canvas.width;
  }

  // Var fjärde bild först, så att skrollen fungerar direkt även på långsamt nät
  async function preload() {
    await load(0);
    paint();
    for (const step of [8, 4, 2, 1]) {
      const queue = [];
      for (let i = 0; i < count; i += step) if (!images[i]) queue.push(i);
      for (let at = 0; at < queue.length; at += 6) await Promise.all(queue.slice(at, at + 6).map(load));
      paint();
    }
  }
  preload();

  return {
    layout() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawn = -1;
      paint();
    },
    show(progress) {
      wanted = Math.round(Math.min(1, Math.max(0, progress)) * (count - 1));
      paint();
    },
    /** Spelar slutet fram och tillbaka av sig själv, så att bilden lever vidare utan en andra film. */
    idle(now, last, fps = 14) {
      const span = last - 1;
      const step = Math.floor((now / 1000) * fps) % (span * 2);
      wanted = count - 1 - (step < span ? step : span * 2 - step);
      paint();
    },
  };
}
