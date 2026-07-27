// Förbereder råskärmdumparna: byter partnernamn vi inte visar, tar bort
// tillfälliga "stängt"-etiketter och rensar bort allt som inte får synas.
const fs = require("fs");
const path = require("path");
const sharp = require("/Users/jalle/testa/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");

const src = "/private/tmp/claude-501/-Users-jalle-testa/5f6e9da6-fb4b-4e59-b9cd-6ea7600e5f8e/scratchpad/screens";
const out = "/Users/jalle/testa/app_store_screenshots/_raw";
const repoRoot = "/Users/jalle/testa";
const fontDir = "/private/tmp/claude-501/-Users-jalle-testa/5f6e9da6-fb4b-4e59-b9cd-6ea7600e5f8e/scratchpad";
fs.mkdirSync(out, { recursive: true });

const extraBold = fs.readFileSync(path.join(fontDir, "Baloo2-ExtraBold.ttf")).toString("base64");

// Kopierar ett rent block från bilden själv över det som ska bort. Kanterna
// tonas ut så att lappen inte syns som en rektangel i fotot.
async function patchFrom(image, { x, y, w, h, fromY, fromX, feather = 18 }) {
  const piece = await sharp(image)
    .extract({ left: fromX ?? x, top: fromY ?? y, width: w, height: h })
    .png()
    .toBuffer();
  const mask = await sharp(
    Buffer.from(
      `<svg width="${w}" height="${h}"><rect x="${feather}" y="${feather}" width="${w - feather * 2}" height="${h - feather * 2}" rx="${feather}" fill="#fff"/></svg>`,
    ),
  )
    .blur(feather / 2)
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const feathered = await sharp(piece)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(image).composite([{ input: feathered, left: x, top: y }]).png().toBuffer();
}

async function fillRect(image, { x, y, w, h, color }) {
  const rect = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`,
  );
  return sharp(image).composite([{ input: rect, left: x, top: y }]).png().toBuffer();
}

async function drawText(image, { x, baseline, text, size, color }) {
  const svg = Buffer.from(`
    <svg width="1320" height="2868" xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face { font-family: 'BalooX'; src: url(data:font/ttf;base64,${extraBold}) format('truetype'); }
        .t { font-family: 'BalooX'; font-size: ${size}px; fill: ${color}; }
      </style>
      <text x="${x}" y="${baseline}" class="t">${text}</text>
    </svg>
  `);
  return sharp(image).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

async function main() {
  // Namnen i databasen är redan rätt och kedjekontot ligger som utkast, så
  // enda retuschen som behövs är de tillfälliga öppettidsetiketterna.
  const passthrough = { "n01-home.png": "01-home.png", "n05-adress.png": "05-adress.png", "n04-produkt.png": "04-produkt.png", "n07-deals.png": "07-deals.png" };
  for (const [from, to] of Object.entries(passthrough)) {
    fs.copyFileSync(path.join(src, from), path.join(out, to));
  }

  // "Pausad · 11:00" är ett ögonblicksläge, inte något marknadsföringskortet
  // ska bära. Lappen hämtas från samma foto strax till höger.
  let rest = fs.readFileSync(path.join(src, "n03-restaurang.png"));
  rest = await patchFrom(rest, { x: 56, y: 846, w: 480, h: 148, fromX: 600, feather: 22 });
  fs.writeFileSync(path.join(out, "03-restaurang.png"), rest);

  for (const [from, to] of [["n02-sok.png", "02-sok.png"], ["n06-kategori.png", "06-kategori.png"]]) {
    let shot = fs.readFileSync(path.join(src, from));
    shot = await patchFrom(shot, { x: 80, y: 2012, w: 400, h: 132, fromX: 620, feather: 20 });
    fs.writeFileSync(path.join(out, to), shot);
  }

  console.log("råskärmar klara i", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
