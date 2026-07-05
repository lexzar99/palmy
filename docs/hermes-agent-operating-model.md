# Hermes agentupplagg for Delivera

Det har ar den operativa modellen for Hermes-agenterna. Syftet ar farre roller, tydligare ansvar och mindre risk.

## Huvudpaket

| Paket | Hermes bundle | Skills | Farg pa arbetet |
|---|---|---|---|
| Drift | `drift` | `delivera-monitor`, `delivera-data` | Laser, larmar, sammanfattar |
| Meny & Studio | `meny-studio` | `delivera-menu`, `delivera-images` | Bygger utkast och hanterar riktiga bilder |
| Tillvaxt & Marknad | `tillvaxt-marknad` | `delivera-growth`, `delivera-social` | Deals, SEO, budget, social assets |
| Support & Kund | `support-kund` | `delivera-support`, `delivera-customers` | Kundarenden, recensioner, kundmonster |
| Dev | `dev` | `delivera-developer` | Kod, test, deploy efter ja |
| Kompanjon | `kompanjon` | `delivera-planner` | Kalender, fokus, hemma/bil |

## Sakerhetsmodell

- `GLOBAL_VIEWER`: read-only. Falken och Kundvakten kan inte skriva.
- `MENU_AGENT`: far bara jobba mot utkast och menyresurser. Kan inte publicera eller radera.
- `GROWTH_AGENT`: far forbereda deals, kuponger och menyresurser. Allt skapas inaktivt, Jalle aktiverar.
- `SUPER_ADMIN`: bara Jalle.

Agenter ska aldrig forsoka runda `403`. Det ar en korrekt gräns, inte ett fel.

## Telegram-format

Varje meddelande bor borja med en av dessa:

- `Beslut:` nar Jalle maste gora nagot.
- `Fixat:` nar nagot ar klart.
- `Info:` nar det bara ar lage.
- `Blockerad:` nar agenten tappat API, sida, token, gateway eller browser.

Bil-lage: max tre korta rader och en ja/nej-fraga. Hemma-lage: mer resonemang ar okej, men slutsatsen forst.

## Disconnect-regel

Om en agent tappar en sida, adminsession, Telegram gateway, API eller browser ska den skriva:

```text
Tappade sidan: <system>.
Varfor: <401, 403, 429, timeout, browser disconnect, annat>.
Status: <vad som hann goras>.
Nasta: <vantar, forsoker igen, eller behover Jalles ja>.
```

Vid `429`: vanta och ateranvand token-cache. Radera inte tokenfiler i onodan.

## Marknad och SEO

Tillvaxt & Marknad ska alltid kunna fraga:

- Ska vi posta idag?
- Vilken kanal?
- Vilken budget?
- Vad mater vi?

Standardrekommendation for sma tester: Facebook + Instagram i Lund, 100-300 kr, 24 timmar. Mat claims och orders.

## Kodade 4K-assets

Sociala och SEO-bilder ska byggas som kod i forsta hand, inte med AI image generation.

Standardformat:

- Feed: 2160x2160.
- Story: 2160x3840.
- 4K hero: 3840x2160.
- OG: 1200x630.

Rendera med HTML/CSS/SVG och Playwright:

```bash
npx --yes playwright screenshot --viewport-size=3840,2160 file://$PWD/model.html out.png
```

Temat ska matcha SwiftUI-appen:

- Orange `#F04F1A`
- Ink `#0F0F12`
- Muted `#6E6B66`
- Deal blue `#1287F5`
- Deal blue deep `#0A54D9`
- Cream backgrounds `#FCFAF2`, `#F5FAF5`, `#FCF5ED`

Stil: platt, ljus, proffsig, kort svensk copy. Inga konkurrentnamn, inga em-dashes, inga AI-glow-effekter.
