/**
 * Delivera brand-assets generator.
 * Renderar riktiga PNG:er via sharp (SVG → PNG). Palett = nuvarande design
 * (guld #F4D086/#E7B24B/#C28E2E + nära-svart + vit). Inga blåa toner.
 *
 * Kör:  node Delivera-Brand-Assets/generate.js
 *
 * Output (i denna mapp):
 *   app-icons/{customer,business,courier,admin}/delivera-<app>-icon-01..10.png  (1024²)
 *   templates/  (upload-mallar med exakta px + safe-area)
 *   logos/      (Delivera-wordmark i olika behandlingar, transparent)
 *   banners/    (förslag på hemside-hero)
 *   README.md   (index över alla storlekar + användning)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('/Users/jalle/testa/packages/api/node_modules/sharp');

const ROOT = __dirname;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mkdir = (p) => fs.mkdirSync(path.join(ROOT, p), { recursive: true });

const tasks = [];
function render(svg, outRel, w, h) {
  tasks.push(
    sharp(Buffer.from(svg))
      .resize(w, h, { fit: 'fill' })
      .png()
      .toFile(path.join(ROOT, outRel))
      .then(() => outRel)
  );
}

// ── Per-app paletter (shades inom varumärket) ───────────────────────────────
const APPS = {
  customer: { label: 'Web + React (kund)', bg: '#0b0c0f', cream: '#FFF8EF', ink: '#0b0c0f', g: ['#F4D086', '#E7B24B', '#C28E2E'], accent: '#E7B24B', deep: '#8A6512', onLight: '#8A6512' },
  business: { label: 'Business (Flutter)', bg: '#09090B', cream: '#F5F5F2', ink: '#09090B', g: ['#E7B24B', '#C28E2E', '#8A6512'], accent: '#C28E2E', deep: '#6E4F18', onLight: '#8A6512' },
  courier:  { label: 'Courier (Flutter)',  bg: '#0b0c0f', cream: '#FFF8EF', ink: '#0b0c0f', g: ['#FBE7B0', '#F4D086', '#E7B24B'], accent: '#F4D086', deep: '#C28E2E', onLight: '#C28E2E' },
  admin:    { label: 'Admin',              bg: '#08090b', cream: '#f6f7f9', ink: '#08090b', g: ['#FFFFFF', '#E4E4E7', '#9C9CA3'], accent: '#fafafa', deep: '#9C9CA3', onLight: '#111113' },
};

const WORD = 'Delivera';
const grad = (id, stops, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
  stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join('') +
  `</linearGradient>`;
const doc = (S, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>${defs}</defs>${body}</svg>`;

// Flertonings-hjälpare: dela ordet i färgade delar (centreras som helhet via
// text-anchor=middle på <text>). Aldrig hela ordet i EN färg.
const two = (a, ca, b, cb) => `<tspan fill="${ca}">${a}</tspan><tspan fill="${cb}">${b}</tspan>`;
const alt = (word, colors) => word.split('').map((ch, i) => `<tspan fill="${colors[i % colors.length]}">${ch}</tspan>`).join('');

// 10 ikon-stilar — ALLTID hela ordet "Delivera", inget stort D, olika typsnitt
// och flertoning inom ordet. Varje returnerar en komplett SVG-sträng.
const STYLES = [
  // 1 — Tvåtonad split (Futura): ljus guld "Deli" + djup guld "vera", mörk
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Futura,Avenir Next" font-weight="800" font-size="${S*0.165}" text-anchor="middle">${two('Deli', P.g[0], 'vera', P.g[2])}</text>`),
  // 2 — Gradientsvep (Avenir) över hela ordet, mörk
  (S, P) => doc(S, grad('g', P.g, 1, 0.6), `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Avenir Next,Helvetica Neue" font-weight="800" font-size="${S*0.165}" fill="url(#g)" text-anchor="middle">Delivera</text>`),
  // 3 — Accent-initial (Gill Sans): "D" accent, "elivera" cream, mörk
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Gill Sans,Optima,Avenir Next" font-weight="700" font-size="${S*0.165}" text-anchor="middle">${two('D', P.accent, 'elivera', P.cream)}</text>`),
  // 4 — Alternerande bokstäver (Futura) i två toner, mörk
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Futura,Avenir Next" font-weight="800" font-size="${S*0.16}" text-anchor="middle">${alt('Delivera', [P.g[0], P.cream])}</text>`),
  // 5 — Elegant serif tvåtonad + linje (Didot)
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.55}" font-family="Didot,Baskerville,Georgia" font-weight="600" font-size="${S*0.15}" letter-spacing="${S*0.004}" text-anchor="middle">${two('Deli', P.g[0], 'vera', P.deep)}</text>
    <rect x="${S*0.2}" y="${S*0.62}" width="${S*0.6}" height="${S*0.012}" rx="${S*0.006}" fill="${P.deep}"/>`),
  // 6 — Tvåtonad på cream (Avenir): onLight + deep
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.cream}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Avenir Next,Futura" font-weight="800" font-size="${S*0.165}" text-anchor="middle">${two('Deli', P.onLight, 'vera', P.deep)}</text>`),
  // 7 — Fyll + outline-mix (Futura): "Deli" fylld, "vera" kontur, mörk
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Futura,Avenir Next" font-weight="800" font-size="${S*0.165}" text-anchor="middle"><tspan fill="${P.accent}">Deli</tspan><tspan fill="none" stroke="${P.accent}" stroke-width="${S*0.006}">vera</tspan></text>`),
  // 8 — Vänlig gemen tvåtonad + prick (Avenir), cream
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.cream}"/>
    <text x="${S/2}" y="${S*0.58}" font-family="Avenir Next,Futura" font-weight="700" font-size="${S*0.165}" text-anchor="middle">${two('deli', P.onLight, 'vera', P.deep)}</text>
    <circle cx="${S*0.5}" cy="${S*0.33}" r="${S*0.028}" fill="${P.accent}"/>`),
  // 9 — Mono tvåtonad (Menlo) + >_
  (S, P) => doc(S, '', `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S*0.2}" y="${S*0.42}" font-family="Menlo,Courier New" font-weight="700" font-size="${S*0.075}" fill="${P.deep}">&gt;_</text>
    <text x="${S/2}" y="${S*0.62}" font-family="Menlo,Courier New" font-weight="700" font-size="${S*0.115}" text-anchor="middle">${two('Deliv', P.accent, 'era', P.deep)}</text>`),
  // 10 — Script gradient (Snell), mörk
  (S, P) => doc(S, grad('g', P.g, 1, 0.4), `<rect width="${S}" height="${S}" rx="${S*0.22}" fill="${P.bg}"/>
    <text x="${S/2}" y="${S*0.6}" font-family="Snell Roundhand,Apple Chancery,Georgia" font-weight="700" font-size="${S*0.2}" text-anchor="middle">${two('Deli', P.g[0], 'vera', P.g[2])}</text>`),
];

// ── App-ikoner: 10 stilar × 4 appar ─────────────────────────────────────────
for (const [appKey, P] of Object.entries(APPS)) {
  mkdir(`app-icons/${appKey}`);
  STYLES.forEach((style, i) => {
    const n = String(i + 1).padStart(2, '0');
    render(style(1024, P), `app-icons/${appKey}/delivera-${appKey}-icon-${n}.png`, 1024, 1024);
  });
}

// ── Upload-mallar (guide med exakta px + safe-area) ─────────────────────────
mkdir('templates');
const P = APPS.customer; // mallar i kund-guld
function template(rel, w, h, title, sub, dark = false) {
  const bg = dark ? P.bg : P.cream;
  const fg = dark ? '#FFF8EF' : '#111113';
  const muted = dark ? '#9C9CA3' : '#5C5C61';
  const pad = Math.round(Math.min(w, h) * 0.06);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad('g', P.g)}</defs>
    <rect width="${w}" height="${h}" fill="${bg}"/>
    <rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="${pad * 0.5}" fill="none" stroke="${muted}" stroke-width="3" stroke-dasharray="14 12"/>
    <text x="${w / 2}" y="${h / 2 - Math.min(w,h)*0.02}" font-family="Futura,Avenir Next" font-weight="800" font-size="${Math.min(w, h) * 0.085}" fill="${fg}" text-anchor="middle">${esc(title)}</text>
    <text x="${w / 2}" y="${h / 2 + Math.min(w,h)*0.07}" font-family="Avenir Next,Helvetica Neue" font-weight="600" font-size="${Math.min(w, h) * 0.045}" fill="${muted}" text-anchor="middle">${esc(sub)}</text>
    <text x="${w / 2}" y="${h / 2 + Math.min(w,h)*0.135}" font-family="Menlo" font-weight="700" font-size="${Math.min(w, h) * 0.04}" fill="url(#g)" text-anchor="middle">${w} × ${h} px</text>
    <text x="${pad + 6}" y="${h - pad - 8}" font-family="Avenir Next" font-weight="800" font-size="${Math.min(w,h)*0.035}" fill="url(#g)">Delivera</text>
  </svg>`;
  render(svg, rel, w, h);
}
template('templates/restaurang-logga-mall-1024x1024.png', 1024, 1024, 'RESTAURANG-LOGGA', 'Kvadrat · centrera · enfärgad/transparent bakgrund', true);
template('templates/restaurang-hero-mall-1600x500.png', 1600, 500, 'RESTAURANG HERO / BANNER', 'Håll motiv & text i mitten — kanter kan beskäras', true);
template('templates/produktbild-mall-1000x1000.png', 1000, 1000, 'PRODUKTBILD', 'Maträtten centrerad · vit/enfärgad bakgrund', false);
template('templates/kategoribild-mall-1000x1000.png', 1000, 1000, 'KATEGORIBILD', 'Representativ bild · samma format som produkt', false);
template('templates/sponsorkort-mall-1200x675.png', 1200, 675, 'SPONSORKORT', 'Logga + kort budskap · visas i signup-rotationen', true);
template('templates/deal-banner-mall-1200x500.png', 1200, 500, 'DEAL / KAMPANJ-BANNER', 'Visas på restaurangsidan när "Visa som banner" är på', true);
template('templates/og-delning-mall-1200x630.png', 1200, 630, 'OG / SOCIAL DELNING', 'Förhandsvisning vid delning (Facebook/iMessage/X)', true);

// ── Logos / wordmarks (transparent bakgrund) ────────────────────────────────
mkdir('logos');
function wordmark(rel, w, h, fill, useGrad, sub) {
  const fillRef = useGrad ? 'url(#g)' : fill;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad('g', P.g)}</defs>
    <text x="${w / 2}" y="${h * 0.6}" font-family="Futura,Avenir Next" font-weight="800" font-size="${h * 0.5}" fill="${fillRef}" text-anchor="middle" textLength="${w * 0.86}" lengthAdjust="spacingAndGlyphs">Delivera</text>
    ${sub ? `<text x="${w / 2}" y="${h * 0.85}" font-family="Avenir Next" font-weight="600" font-size="${h * 0.1}" letter-spacing="${h*0.03}" fill="${fill}" text-anchor="middle">${esc(sub)}</text>` : ''}
  </svg>`;
  render(svg, rel, w, h);
}
wordmark('logos/delivera-wordmark-guld-transparent.png', 1200, 360, '#E7B24B', true, '');
wordmark('logos/delivera-wordmark-svart-transparent.png', 1200, 360, '#111113', false, '');
wordmark('logos/delivera-wordmark-vit-transparent.png', 1200, 360, '#FFFFFF', false, '');
wordmark('logos/delivera-lockup-guld-tagline.png', 1200, 420, '#E7B24B', true, 'MAT · HEM · SNABBT');

// ── Banner-förslag (hemside-hero) ───────────────────────────────────────────
mkdir('banners');
function banner(rel, headline, sub, variant) {
  const w = 1600, h = 500;
  let bgRect, hl, slc, accent;
  if (variant === 'dark') { bgRect = `<rect width="${w}" height="${h}" fill="${P.bg}"/>`; hl = '#FFF8EF'; slc = '#9C9CA3'; accent = 'url(#g)'; }
  else if (variant === 'gradient') { bgRect = `<rect width="${w}" height="${h}" fill="url(#g)"/>`; hl = P.ink; slc = '#3a2f12'; accent = P.ink; }
  else { bgRect = `<rect width="${w}" height="${h}" fill="${P.cream}"/>`; hl = '#111113'; slc = '#5C5C61'; accent = 'url(#g)'; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad('g', P.g)}</defs>
    ${bgRect}
    <text x="90" y="220" font-family="Futura,Avenir Next" font-weight="800" font-size="92" fill="${hl}">${esc(headline)}</text>
    <text x="92" y="225" font-family="Futura,Avenir Next" font-weight="800" font-size="92" fill="${accent}" opacity="0">${esc(headline)}</text>
    <text x="90" y="300" font-family="Avenir Next,Helvetica Neue" font-weight="600" font-size="40" fill="${slc}">${esc(sub)}</text>
    <rect x="90" y="345" width="300" height="78" rx="39" fill="${accent}"/>
    <text x="240" y="395" font-family="Avenir Next" font-weight="800" font-size="34" fill="${variant==='gradient'?'#FFF8EF':P.ink}" text-anchor="middle">Beställ nu</text>
    <text x="${w-90}" y="${h-50}" font-family="Futura" font-weight="800" font-size="44" fill="${accent}" text-anchor="end">Delivera</text>
  </svg>`;
  render(svg, rel, w, h);
}
banner('banners/hero-forslag-1-mork.png', 'Hungrig? Delivera fixar resten.', 'Mat från dina favoriter — hemkört på minuter.', 'dark');
banner('banners/hero-forslag-2-guld.png', 'Snabbare än suget.', 'Beställ. Luta dig tillbaka. Delivera är på väg.', 'gradient');
banner('banners/hero-forslag-3-ljus.png', 'Din stad. Din mat. Delivera.', 'Hundratals restauranger, ett klick bort.', 'light');

// ── Kör allt + README ───────────────────────────────────────────────────────
Promise.all(tasks).then((done) => {
  const readme = `# Delivera — brand-assets

Genererat av \`generate.js\` (kör om: \`node Delivera-Brand-Assets/generate.js\`).
Alla PNG:er bygger på **nuvarande palett**: guld \`#F4D086 / #E7B24B / #C28E2E\`
(ink \`#8A6512\`) + nära-svart \`#08090b\` + vit. Inga blåa toner.

## App-ikoner (1024×1024) — 10 förslag per app
Ord-märke "Delivera" i 10 stilar (olika typsnitt/layout/shade). En shade per app:

| App | Mapp | Shade |
|---|---|---|
| Web + React (kund) | \`app-icons/customer/\` | Signatur-guld på mörk |
| Business (Flutter) | \`app-icons/business/\` | Djup brons-guld |
| Courier (Flutter) | \`app-icons/courier/\` | Ljusare/varmare guld |
| Admin | \`app-icons/admin/\` | Monokrom (silver/vit) |

Filnamn: \`delivera-<app>-icon-01..10.png\`. Stilar: 1 fetstil sans · 2 gradientpanel ·
3 tvårads-stack · 4 elegant serif · 5 graverade versaler · 6 stort D + ord ·
7 outline · 8 vänlig gemen (cream) · 9 mono/tech · 10 script.

## Upload-mallar (\`templates/\`)
Guide-bilder med exakt px + safe-area (streckad ram = håll innehåll innanför).

| Mall | Storlek | Används för (R2 / fält) |
|---|---|---|
| Restaurang-logga | 1024×1024 | \`Restaurant.imageUrl\` → \`{stad}/{rest}/logo.webp\` |
| Restaurang-hero | 1600×500 | \`Restaurant.heroImageUrl\` → \`{stad}/{rest}/hero.webp\` |
| Produktbild | 1000×1000 | \`Product.imageUrl\` → \`.../menu/{kat}/{prod}.webp\` |
| Kategbackbild | 1000×1000 | \`Category.imageUrl\` → \`.../category/{kat}.webp\` |
| Sponsorkort | 1200×675 | \`SponsorCard.imageUrl\` (signup-rotation) |
| Deal-banner | 1200×500 | \`Deal.imageUrl\` (Visa som banner) |
| OG / delning | 1200×630 | Social förhandsvisning |

## Logos / wordmarks (\`logos/\`, transparent bakgrund)
\`delivera-wordmark-guld/svart/vit-transparent.png\` (1200×360) +
\`delivera-lockup-guld-tagline.png\` (1200×420).

## Banner-förslag (\`banners/\`, 1600×500)
3 hemside-hero-förslag: mörk, guld-gradient, ljus.

---
Totalt genererade filer: **${done.length}**.
`;
  fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
  console.log(`✓ Genererade ${done.length} PNG:er + README.md`);
}).catch((e) => { console.error('FEL:', e); process.exit(1); });
