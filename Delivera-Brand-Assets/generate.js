/**
 * Delivera brand-assets — HTML → headless Chrome (INGEN sharp).
 * SIMPLA, professionella ikoner: platta färger, hög kontrast, inga glow/gradient,
 * rena fonts (ingen skrivstil). Ordet skrivs "Del í vera" (accent på i).
 *
 * Färgregel (inga nya färger): guld #F4D086/#E7B24B/#C28E2E + brons #8A6512
 * + svart/vit + cream. Ingen orange/blå.
 *
 * Per app — så man lätt ser skillnad:
 *   customer (web+react) = LJUS  (svart text på cream)
 *   business (flutter)   = MÖRK, brons
 *   courier  (flutter)   = MÖRK, ljusguld
 *   admin                = MÖRK, vit + guld-accent
 *
 * Kör:  node Delivera-Brand-Assets/generate.js   (kräver Google Chrome)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = path.join(ROOT, '.build');
fs.mkdirSync(TMP, { recursive: true });
const mkdir = (p) => fs.mkdirSync(path.join(ROOT, p), { recursive: true });

let count = 0;
function shot(html, outRel, w, h, transparent = false) {
  const htmlFile = path.join(TMP, 'cur.html');
  fs.writeFileSync(htmlFile, html);
  const out = path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${out}`, htmlFile,
  ], { stdio: 'ignore' });
  count++;
}

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
.canvas{width:${w}px;height:${h}px;position:relative;display:flex;align-items:center;justify-content:center}
${css}
</style></head><body><div class="canvas">${body}</div></body></html>`;

// ── Per-app paletter (kund ljus, övriga mörka med olika nyans) ──────────────
const APPS = {
  customer: { name: 'Web + React (kund)', tone: 'Ljus · svart text på cream',  bg: '#FBF6EC', word: '#17120a', iAcc: '#C28E2E' },
  business: { name: 'Business (Flutter)', tone: 'Mörk · brons',                bg: '#100d08', word: '#C9962F', iAcc: '#F4D086' },
  courier:  { name: 'Courier (Flutter)',  tone: 'Mörk · ljusguld',             bg: '#0a0a0b', word: '#F4D086', iAcc: '#FFFFFF' },
  admin:    { name: 'Admin',              tone: 'Mörk · vit + guld',           bg: '#0a0a0a', word: '#F5F4F1', iAcc: '#C9A24A' },
};

// "Delívera" med accent-í. cap: 'title' | 'upper' | 'lower'
const W = (cls = '', cap = 'title') => {
  const map = { title: ['Del', 'í', 'vera'], upper: ['DEL', 'Í', 'VERA'], lower: ['del', 'í', 'vera'] };
  const [a, i, b] = map[cap];
  return `<span class="${cls}">${a}<span class="ii">${i}</span>${b}</span>`;
};

// ── 10 SIMPLA designer (font/vikt/case/layout) — platt, hög kontrast ────────
const S = 1024;
const base = (P, fontCss, cap, extraCss = '', extraBody = '', col = false) => page(S, S,
  `.canvas{background:${P.bg}${col ? ';flex-direction:column;gap:30px' : ''}}
   .w{${fontCss};color:${P.word};white-space:nowrap}
   .ii{color:${P.iAcc}}
   ${extraCss}`,
  `${W('w', cap)}${extraBody}`);

const DESIGNS = [
  { key: 'futura',        render: (P) => base(P, 'font:700 156px/1 "Futura","Avenir Next",sans-serif;letter-spacing:-3px', 'title') },
  { key: 'avenir',        render: (P) => base(P, 'font:600 152px/1 "Avenir Next","Helvetica Neue",sans-serif;letter-spacing:-2px', 'title') },
  { key: 'helvetica',     render: (P) => base(P, 'font:700 150px/1 "Helvetica Neue","Arial",sans-serif;letter-spacing:-4px', 'title') },
  { key: 'versaler',      render: (P) => base(P, 'font:700 120px/1 "Futura","Avenir Next",sans-serif;letter-spacing:14px;padding-left:14px', 'upper') },
  { key: 'gemena',        render: (P) => base(P, 'font:500 156px/1 "Avenir Next","Helvetica Neue",sans-serif;letter-spacing:-3px', 'lower') },
  { key: 'optima',        render: (P) => base(P, 'font:700 150px/1 "Optima","Gill Sans",sans-serif;letter-spacing:0px', 'title') },
  { key: 'underline',     render: (P) => base(P, 'font:700 150px/1 "Futura","Avenir Next",sans-serif;letter-spacing:-3px', 'title',
      `.ul{width:560px;height:6px;border-radius:3px;background:${P.iAcc}}`, `<div class="ul"></div>`, true) },
  { key: 'gillsans',      render: (P) => base(P, 'font:600 150px/1 "Gill Sans","Optima",sans-serif;letter-spacing:-1px', 'title') },
  { key: 'serif',         render: (P) => base(P, 'font:600 150px/1 "Didot","Bodoni 72","Georgia",serif;letter-spacing:0px', 'title') },
  { key: 'viktkontrast',  render: (P) => page(S, S,
      `.canvas{background:${P.bg}}
       .w{font-family:"Futura","Avenir Next",sans-serif;font-size:154px;letter-spacing:-3px;color:${P.word};white-space:nowrap}
       .w .lt{font-weight:300}.w .hv{font-weight:800}.ii{color:${P.iAcc};font-weight:800}`,
      `<span class="w"><span class="lt">Del</span><span class="ii">í</span><span class="hv">vera</span></span>`) },
];

console.log('Genererar app-ikoner (10 × 4)…');
for (const [appKey, P] of Object.entries(APPS)) {
  mkdir(`app-icons/${appKey}`);
  DESIGNS.forEach((d, i) => {
    const n = String(i + 1).padStart(2, '0');
    shot(d.render(P), `app-icons/${appKey}/delivera-${appKey}-${n}-${d.key}.png`, S, S);
  });
  console.log(`  ✓ ${appKey} (${P.tone})`);
}

// ── Upload-mallar (guide med px + safe-area) — platt, inga effekter ──────────
console.log('Genererar mallar…');
mkdir('templates');
function template(rel, w, h, title, sub) {
  const m = Math.min(w, h);
  const html = page(w, h,
    `.canvas{background:#0d0c0a}
     .frame{position:absolute;inset:${Math.round(m * 0.05)}px;border:3px dashed rgba(231,178,75,.5);border-radius:${Math.round(m * 0.04)}px}
     .box{text-align:center;color:#F5F4F1;font-family:"Avenir Next",sans-serif}
     .t{font:700 ${Math.round(m * 0.08)}px/1.15 "Futura","Avenir Next";letter-spacing:1px}
     .s{margin-top:18px;font-size:${Math.round(m * 0.04)}px;color:#bdb097}
     .px{margin-top:14px;font:700 ${Math.round(m * 0.04)}px "Menlo",monospace;color:#E7B24B}
     .tag{position:absolute;left:${Math.round(m * 0.06)}px;bottom:${Math.round(m * 0.05)}px;font:700 ${Math.round(m * 0.038)}px "Futura";color:#E7B24B}
     .tag .i{color:#C28E2E}`,
    `<div class="frame"></div><div class="box"><div class="t">${title}</div><div class="s">${sub}</div><div class="px">${w} × ${h} px</div></div>
     <div class="tag">Del<span class="i">í</span>vera</div>`);
  shot(html, rel, w, h);
}
template('templates/restaurang-logga-mall-1024x1024.png', 1024, 1024, 'RESTAURANG-LOGGA', 'Kvadrat · centrera · enfärgad/transparent bakgrund');
template('templates/restaurang-hero-mall-1600x500.png', 1600, 500, 'RESTAURANG HERO / BANNER', 'Håll motiv & text i mitten — kanter kan beskäras');
template('templates/produktbild-mall-1000x1000.png', 1000, 1000, 'PRODUKTBILD', 'Maträtten centrerad · vit/enfärgad bakgrund');
template('templates/kategoribild-mall-1000x1000.png', 1000, 1000, 'KATEGORIBILD', 'Representativ bild · samma format som produkt');
template('templates/sponsorkort-mall-1200x675.png', 1200, 675, 'SPONSORKORT', 'Logga + kort budskap · signup-rotationen');
template('templates/deal-banner-mall-1200x500.png', 1200, 500, 'DEAL / KAMPANJ-BANNER', 'Visas på restaurangsidan när "Visa som banner" är på');
template('templates/og-delning-mall-1200x630.png', 1200, 630, 'OG / SOCIAL DELNING', 'Förhandsvisning vid delning (FB / iMessage / X)');

// ── Logos / wordmarks (transparent, platta) ─────────────────────────────────
console.log('Genererar logos…');
mkdir('logos');
function wordmark(rel, wordColor, iColor, sub) {
  const w = 1200, h = 360;
  const html = page(w, h,
    `.canvas{background:transparent;flex-direction:column;gap:14px}
     .w{font:700 180px/1 "Futura","Avenir Next",sans-serif;letter-spacing:-5px;color:${wordColor};white-space:nowrap}
     .ii{color:${iColor}}
     .s{font:600 32px "Avenir Next";letter-spacing:13px;color:#8A6512}`,
    `${W('w')}${sub ? `<div class="s">${sub}</div>` : ''}`);
  shot(html, rel, w, h, true);
}
wordmark('logos/delivera-wordmark-guld-transparent.png', '#E7B24B', '#C28E2E', '');
wordmark('logos/delivera-wordmark-svart-transparent.png', '#17120a', '#C28E2E', '');
wordmark('logos/delivera-wordmark-vit-transparent.png', '#FFFFFF', '#E7B24B', '');
wordmark('logos/delivera-lockup-guld-tagline.png', '#E7B24B', '#C28E2E', 'MAT · HEM · SNABBT');

// ── Banner-förslag (hemside-hero 1600×500) — platta, inga effekter ──────────
console.log('Genererar banners…');
mkdir('banners');
function banner(rel, headline, sub, variant) {
  const w = 1600, h = 500;
  let bg, hl, slc, btnbg, btnfg, mk;
  if (variant === 'dark')      { bg = '#0c0b09'; hl = '#F5F4F1'; slc = '#b6a98f'; btnbg = '#E7B24B'; btnfg = '#15110a'; mk = '#E7B24B'; }
  else if (variant === 'gold') { bg = '#E7B24B'; hl = '#15110a'; slc = '#4a3814'; btnbg = '#15110a'; btnfg = '#F4D086'; mk = '#15110a'; }
  else                         { bg = '#FBF6EC'; hl = '#17120a'; slc = '#6b5c40'; btnbg = '#C28E2E'; btnfg = '#fff';   mk = '#C28E2E'; }
  const html = page(w, h,
    `.canvas{background:${bg};justify-content:flex-start}
     .pad{padding:0 90px;width:100%}
     .h{font:700 84px/1.06 "Futura","Avenir Next",sans-serif;letter-spacing:-2px;color:${hl};max-width:1060px}
     .h .hi{color:${variant === 'gold' ? '#5a3e0a' : '#E7B24B'}}
     .s{margin-top:22px;font:600 38px "Avenir Next";color:${slc}}
     .btn{margin-top:34px;display:inline-block;padding:22px 46px;border-radius:14px;background:${btnbg};color:${btnfg};font:700 32px "Avenir Next"}
     .mk{position:absolute;right:80px;bottom:60px;font:700 48px "Futura";color:${mk}}
     .mk .i{color:${variant === 'gold' ? '#5a3e0a' : '#C28E2E'}}`,
    `<div class="pad"><div class="h">${headline}</div><div class="s">${sub}</div><div class="btn">Beställ nu</div></div>
     <div class="mk">Del<span class="i">í</span>vera</div>`);
  shot(html, rel, w, h);
}
banner('banners/hero-forslag-1-mork.png', 'Hungrig? <span class="hi">Delívera</span> fixar resten.', 'Mat från dina favoriter — hemkört på minuter.', 'dark');
banner('banners/hero-forslag-2-guld.png', 'Snabbare än suget.', 'Beställ. Luta dig tillbaka. Delívera är på väg.', 'gold');
banner('banners/hero-forslag-3-ljus.png', 'Din stad. Din mat. <span class="hi">Delívera.</span>', 'Hundratals restauranger, ett klick bort.', 'light');

// ── Galleri-sida + README ───────────────────────────────────────────────────
const grid = (title, files) => `<h2>${title}</h2><div class="grid">` +
  files.map((f) => `<figure><img src="${f}"><figcaption>${path.basename(f)}</figcaption></figure>`).join('') + `</div>`;
const iconFiles = (app) => DESIGNS.map((d, i) => `app-icons/${app}/delivera-${app}-${String(i + 1).padStart(2, '0')}-${d.key}.png`);
const tpl = fs.readdirSync(path.join(ROOT, 'templates')).map((f) => `templates/${f}`).sort();
const lg = fs.readdirSync(path.join(ROOT, 'logos')).map((f) => `logos/${f}`).sort();
const bn = fs.readdirSync(path.join(ROOT, 'banners')).map((f) => `banners/${f}`).sort();
const gallery = `<!doctype html><html><head><meta charset="utf-8"><title>Delívera — brand assets</title><style>
body{margin:0;background:#0c0c0c;color:#eee;font-family:"Avenir Next",system-ui,sans-serif;padding:48px}
h1{font:700 42px "Futura";color:#E7B24B}h1 .i{color:#C28E2E}
h2{margin:46px 0 16px;font-size:20px;color:#F4D086;border-bottom:1px solid #2a2418;padding-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px}
figure{margin:0;background:#151515;border:1px solid #222;border-radius:14px;padding:12px;text-align:center}
figure img{width:100%;border-radius:10px}
figcaption{margin-top:8px;font-size:11px;color:#999;word-break:break-all}
.lead{color:#b6a98f;max-width:760px;line-height:1.6}
</style></head><body>
<h1>Del<span class="i">í</span>vera — brand assets</h1>
<p class="lead">Simpla, platta ikoner — hög kontrast, inga glow/gradient, rena fonts. Palett: guld/brons + svart/vit/cream (inga nya färger). Kund = ljus, övriga mörka med olika nyans.</p>
${Object.entries(APPS).map(([k, p]) => grid(`App-ikoner — ${p.name} (${p.tone})`, iconFiles(k))).join('')}
${grid('Upload-mallar', tpl)}
${grid('Logos / wordmarks', lg)}
${grid('Banner-förslag', bn)}
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'index.html'), gallery);

fs.writeFileSync(path.join(ROOT, 'README.md'), `# Delívera — brand assets

HTML→headless-Chrome (\`node Delivera-Brand-Assets/generate.js\`). Öppna **index.html**
för att se allt. Simpla, platta ikoner — hög kontrast, inga glow/gradient, rena fonts
(ingen skrivstil). Ord-märke: **Delívera** (accent på i). Palett: guld
\`#F4D086/#E7B24B/#C28E2E\` + brons \`#8A6512\` + svart/vit/cream. Inga nya färger.

## App-ikoner (1024×1024) — 10 designer × 4 appar, lätt att skilja åt
| App | Mapp | Nyans |
|---|---|---|
| Web + React (kund) | \`app-icons/customer/\` | **Ljus** — svart text på cream |
| Business (Flutter) | \`app-icons/business/\` | Mörk — brons |
| Courier (Flutter) | \`app-icons/courier/\` | Mörk — ljusguld |
| Admin | \`app-icons/admin/\` | Mörk — vit + guld-accent |

Designer (samma 10 per app): futura · avenir · helvetica · versaler · gemena ·
optima · underline · gillsans · serif · viktkontrast. í i guldton som enda accent.

## Mallar \`templates/\` · Logos \`logos/\` (transparent) · Banners \`banners/\`
logga 1024² · hero 1600×500 · produkt/kategori 1000² · sponsorkort 1200×675 ·
deal-banner 1200×500 · OG 1200×630. Wordmark guld/svart/vit + lockup. 3 hero-förslag.
`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n✓ Klart: ${count} PNG:er + index.html + README.md`);
