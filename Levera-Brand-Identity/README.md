# Levera — Brand Identity Kit

Visuell identitet för omvarumärkningen **FoodGo → Levera** (kund-appen).
Partner-appen heter redan *Levera Business* — detta enar hela plattformen under ett namn.

> **Allt gott — levererat.**
> Namnet kommer från svenskans *leverera*.

Huvudleverans: **[`../Levera-Brand-Identity-Guide.pdf`](../Levera-Brand-Identity-Guide.pdf)** — 22-sidig guide
(samma plats som `FoodGo-Brand-Identity-Guide.pdf` och `MatGo-Brand-Identity-Guide.pdf`).

## Färgtema (oförändrat guld-tema)

| Roll | Hex |
|------|-----|
| Guld / highlight | `#F4D086` |
| **Guld / primär** | `#E7B24B` |
| Guld / djup | `#C28E2E` |
| Bläck (mörk) | `#0b0a0f` |
| Off-white | `#FCFCF9` |
| Soft black | `#1C1C1E` |
| Grå | `#6E6E73` |
| Status | grön `#16A34A` · röd `#DC2626` · orange `#FF7A00` · blå `#2563EB` |

**Typsnitt:** Outfit (display/rubriker) · Inter (brödtext/UI).

## Filer

```
assets/
  logo/
    levera-symbol.svg              Vektor — pin + pil (kärnmärket)
    levera-lockup-light.png        Lockup för ljus bakgrund (2400×700, transparent)
    levera-lockup-dark.png         Lockup för mörk bakgrund (vit text, transparent)
    levera-wordmark.png            Endast ordbild (2000×560, transparent)
  icons/
    levera-appicon.svg             Vektor — app-ikon (guld squircle)
    levera-appicon-1024.png        iOS-ikon, guld
    levera-appicon-dark-1024.png   Mörk variant
    levera-adaptive-foreground-1024.png  Android adaptiv förgrund (transparent)
  banners/
    levera-og-1200x630.png         Open Graph / delningskort
    levera-appstore-1024x500.png   App Store / Google Play feature
    levera-web-hero-1600x500.png   Webb-hero / kampanj
    levera-instagram-1080x1080.png Instagram-inlägg
  fonts/                           Outfit.ttf, Inter.ttf (för PDF-bygget)
build/
  guide.html                       Källan till hela guiden
  gen_assets.py                    Genererar tillgångarna ovan
  manifest.txt
```

## Bygg om

```bash
cd build
# PDF:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --print-to-pdf="../../Levera-Brand-Identity-Guide.pdf" \
  "file://$PWD/guide.html"
# Tillgångar (logga, ikon, banners):
python3 gen_assets.py   # skriver src/*.html + manifest.txt, rendera sedan med Chrome
```

*Ingen app-kod ändrad — detta är endast designunderlag.*
