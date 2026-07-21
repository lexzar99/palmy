# viaeats varumärkesguide

Det här är den samlade master-mappen för viaeats logotyp, appikoner och marknadsföringsformat.
Öppna [viaeats-brand.html](./viaeats-brand.html) i webbläsaren för att se alla varianter och
ladda ner PNG-filerna.

## Masterfiler

- `sym-orange.png` · orange symbol på transparent bakgrund
- `sym-navy.png` · navy symbol på transparent bakgrund
- `sym-cream.png` · cream symbol på transparent bakgrund
- `sym-white.png` · vit symbol på transparent bakgrund
- `Baloo2-VariableFont_wght.ttf` · ordmärket är satt med Baloo 2
- `exports/` · exportklara ikoner, lockups, sociala poster och covers
- `../tools/build-viaeats-brand-assets.py` · reproducerar hela asset-paketet

Mastersymbolen innehåller den exakta bilen, påsen och smileyn från den nya källbilden.
Den rekommenderade appserien är däremot förenklad: endast smileyn ligger längre ner och
`viaeats` är optiskt centrerat i den orange cirkeln. All text i exporter är satt lokalt med
Baloo 2 ExtraBold, aldrig genererad text.

## Rekommenderade exporter

- App-store, två rader: `exports/app-icon-cover-smiley-2line.png`
- App-store, tätare marginal: `exports/app-icon-cover-smiley-2line-tight.png`
- Transparent logga med namn i märket: `exports/logo-orange-inmark-smiley-2line.png`
- Transparent `viaeats` ensamt: `exports/wordmark-viaeats-cream.png`
- Transparent `via`/`eats` på två rader: `exports/wordmark-viaeats-2line-cream.png`
- Transparent smiley utan bil/påse: `exports/smiley-orange-transparent.png`
- Feed med logo-only: `exports/cover-logo-2line-pattern-original-square.png`
- Bred cover med logo-only: `exports/cover-logo-2line-pattern-navy-wide.png`
- Ren cover för eget material: `exports/cover-clean-pattern-navy-wide.png`
- Text-safe wide med lugn panel: `exports/text-safe-pattern-original-wide.png`
- Text-safe story/reels: `exports/text-safe-pattern-navy-story.png`
- Kampanj med slogan: `exports/quote-navy-mat-fran-stan.png`
- Webb/partner-header: `exports/lockup-horizontal-beige.png`

## Färgpalett

| Roll | Hex |
|---|---|
| Navy | `#0A2340` |
| Orange | `#F04F1A` |
| Cream | `#FEF7F0` |
| Orange light | `#FFA24D` |
| Slate | `#5A6472` |

## Regler

1. Skriv varumärket som `viaeats` med gemener.
2. All varumärkestext ska sättas med `Baloo 2 ExtraBold` från `Baloo2-VariableFont_wght.ttf`. Systemfont, Arial och Inter får inte användas i exporter.
3. Rotera, stretcha eller lägg inte glow/skugga på symbolen.
4. På orange `#F04F1A` får navy `#0A2340` endast användas för stor displaytext eller etiketter. Vanlig brödtext ska ligga på en cream `text-safe`-panel. Vit, cream och orange light är inte tillåtna som brödtext direkt på orange.
5. På cream `#FEF7F0` används navy för rubrik och brödtext. Orange är endast accent eller stor displaytext.
6. På navy `#0A2340` används cream eller vit text. Navy och slate får aldrig läggas på navy.
7. Vanlig text ska ha minst 4.5:1 kontrast och stor rubrik minst 3:1.
8. Ge alltid logotypen generös luft.
9. Socialt material använder cream, navy, orange, orange light och slate.
10. Appikoner används för app-store/telefon. Sociala inlägg använder poster- och cover-exporterna.

## Text-safe-format

`text-safe-pattern-*` är tomma bakgrunder med en diskret panel för egen copy. Följ färgen i HTML-kortet:

- `original`, `swap` och `orange`: navy text i panelen.
- `navy` och `navy-alt`: cream eller vit text i panelen.
- Orange text används bara som liten accent, etikett eller stor displaytext.
- Lägg inte brödtext över mönstrets mörka/orange hörnformer.

## Communitykampanjer

- Fråga om upplevelser och förbättringar; skriv inte att ett annat företag är dåligt eller att ViaEats är “snabbast” om det inte finns dokumentation.
- Nämn inte konkurrenter i copy och be kommenterare undvika personnamn, telefonnummer och andra personuppgifter.
- Behåll viaeats-loggan som tydlig avsändare. En varm community-ton får inte användas för att dölja att inlägget kommer från ett företag.
- Moderera bort doxxning, personangrepp och obestyrkta anklagelser. Sammanfatta återkommande problem sakligt innan ni kontaktar en restaurang.
