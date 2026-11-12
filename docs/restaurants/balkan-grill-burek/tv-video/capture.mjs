// Fångar TV-menyn i dubbel upplösning med Chrome headless (CDP, inga beroenden):
// base.png = tavlan utan tallrikar (de läggs på och snurras i ffmpeg), ref.png = med tallrikar,
// break-<namn>-grad.png och break-<namn>-text.png = annonsernas toning och text på genomskinlig botten,
// layout.json = var tallrikarna sitter. Användning: node capture.mjs <url> <utmapp>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const port = 9333;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(out, ".chrome")}`,
  "--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync", "--mute-audio", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  const info = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  if (info) ws = new WebSocket(info.webSocketDebuggerUrl);
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const page = (m, p) => send(m, p, sessionId);
const run = async (expression) => {
  const r = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval");
  return r.result.value;
};
const shot = async (file) => {
  const { data } = await page("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(join(out, file), Buffer.from(data, "base64"));
  console.log("sparade", file);
};

await page("Page.enable");
await page("Runtime.enable");
await page("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 2, mobile: false });
await page("Page.navigate", { url });
for (let i = 0; i < 100 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
await run(`(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
  return true;
})()`);
await sleep(800);

// Inga animationer, alla tallrikar i grundläget
await run(`(() => {
  const s = document.createElement("style");
  s.id = "capture";
  s.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; } html { cursor: none !important; } [aria-label='Förhandsvisa pauserna'] { display: none !important; }";
  document.head.appendChild(s);
  return true;
})()`);
await sleep(300);
await shot("ref.png");

const layout = await run(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  return {
    plates: [...document.querySelectorAll(".hit .plate img")].map((img) => ({ src: img.getAttribute("src"), ...r(img.parentElement) })),
    cats: [...document.querySelectorAll(".cat img")].map((img) => ({ src: img.getAttribute("src"), ...r(img) })),
  };
})()`);
writeFileSync(join(out, "layout.json"), JSON.stringify(layout, null, 2));

await run(`(() => { document.getElementById("capture").textContent += " .plate img, .cat img { visibility: hidden !important; }"; return true; })()`);
await sleep(200);
await shot("base.png");

// Annonserna: toningen och texten var för sig, på genomskinlig botten
await page("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await run(`(() => {
  document.getElementById("capture").textContent += " html, body, .board { background: transparent !important; } .board > :not(.break) { visibility: hidden !important; } .break { background: transparent !important; } .break video, .break__bg { display: none !important; }";
  return true;
})()`);
for (const name of await run(`[...document.querySelectorAll("[data-break]")].map((s) => s.dataset.break)`)) {
  for (const part of ["grad", "text"]) {
    await run(`(() => {
      document.querySelectorAll("[data-break]").forEach((s) => s.classList.toggle("is-on", s.dataset.break === ${JSON.stringify(name)}));
      let t = document.getElementById("part"); if (!t) { t = document.createElement("style"); t.id = "part"; document.head.appendChild(t); }
      t.textContent = ${JSON.stringify(part)} === "grad" ? ".break__body { visibility: hidden !important; }" : ".break::after { display: none !important; }";
      return true;
    })()`);
    await sleep(250);
    await shot(`break-${name}-${part}.png`);
  }
}

ws.close();
chrome.kill();
console.log(JSON.stringify(layout));
process.exit(0);
