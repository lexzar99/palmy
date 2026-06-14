# Delivera — brand-assets

Genererat av `generate.js` (kör om: `node Delivera-Brand-Assets/generate.js`).
Alla PNG:er bygger på **nuvarande palett**: guld `#F4D086 / #E7B24B / #C28E2E`
(ink `#8A6512`) + nära-svart `#08090b` + vit. Inga blåa toner.

## App-ikoner (1024×1024) — 10 förslag per app
Ord-märke "Delivera" i 10 stilar (olika typsnitt/layout/shade). En shade per app:

| App | Mapp | Shade |
|---|---|---|
| Web + React (kund) | `app-icons/customer/` | Signatur-guld på mörk |
| Business (Flutter) | `app-icons/business/` | Djup brons-guld |
| Courier (Flutter) | `app-icons/courier/` | Ljusare/varmare guld |
| Admin | `app-icons/admin/` | Monokrom (silver/vit) |

Filnamn: `delivera-<app>-icon-01..10.png`. Stilar: 1 fetstil sans · 2 gradientpanel ·
3 tvårads-stack · 4 elegant serif · 5 graverade versaler · 6 stort D + ord ·
7 outline · 8 vänlig gemen (cream) · 9 mono/tech · 10 script.

## Upload-mallar (`templates/`)
Guide-bilder med exakt px + safe-area (streckad ram = håll innehåll innanför).

| Mall | Storlek | Används för (R2 / fält) |
|---|---|---|
| Restaurang-logga | 1024×1024 | `Restaurant.imageUrl` → `{stad}/{rest}/logo.webp` |
| Restaurang-hero | 1600×500 | `Restaurant.heroImageUrl` → `{stad}/{rest}/hero.webp` |
| Produktbild | 1000×1000 | `Product.imageUrl` → `.../menu/{kat}/{prod}.webp` |
| Kategbackbild | 1000×1000 | `Category.imageUrl` → `.../category/{kat}.webp` |
| Sponsorkort | 1200×675 | `SponsorCard.imageUrl` (signup-rotation) |
| Deal-banner | 1200×500 | `Deal.imageUrl` (Visa som banner) |
| OG / delning | 1200×630 | Social förhandsvisning |

## Logos / wordmarks (`logos/`, transparent bakgrund)
`delivera-wordmark-guld/svart/vit-transparent.png` (1200×360) +
`delivera-lockup-guld-tagline.png` (1200×420).

## Banner-förslag (`banners/`, 1600×500)
3 hemside-hero-förslag: mörk, guld-gradient, ljus.

---
Totalt genererade filer: **54**.
