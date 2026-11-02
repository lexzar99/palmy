# Restaurangsajter

Alla restaurangers egna hemsidor. Varje restaurang är ett eget Vercel-projekt med eget namn, men koden ligger gemensamt här.
Planen och reglerna står i `docs/RESTAURANGSAJTER-PLATTFORM.md`. Läs den först.

- `_kit/` är den gemensamma tekniken: restaurangdata, beställknappar och menysidan. Buggar lagas här.
- `<sajt>/` innehåller bara design, text, bilder och `site.config.js`.
- Vercel-projektet har Root Directory `sites` och miljövariabeln `SITE` med mappens namn, till exempel `SITE=freds`.
- En push till `main` bygger bara om de projekt som berörs. Ändras `_kit/` byggs alla om.

Ny domän: lägg den i sajtens `site.config.js`, koppla den i Vercel och lägg den i `apps/web/lib/embedPartner.ts`,
`apps/web/public/embed.js` och `packages/api/src/lib/config.ts`. Listorna ersätts av databasen i fas 3.

Öppettider, adress och telefon ändras i admin, aldrig här.

    npm install
    SITE=freds npm run build    # bygger en sajt till dist/
    npm run check    # stoppar bygget om en sajt bryter reglerna
