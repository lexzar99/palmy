# Restaurangsajter

Alla restaurangers egna hemsidor, byggda och driftsatta som ett enda Vercel-projekt (`viaeats-sites`).
Planen och reglerna står i `docs/RESTAURANGSAJTER-PLATTFORM.md`. Läs den först.

- `_kit/` är den gemensamma tekniken: restaurangdata, beställknappar och menysidan. Buggar lagas här.
- `<sajt>/` innehåller bara design, text, bilder och `site.config.js`.
- `vercel.json` skapas av `build.mjs`, så att domänen avgör vilken sajt som visas.

Ny domän: lägg den i sajtens `site.config.js`, koppla den i Vercel och lägg den i `apps/web/lib/embedPartner.ts`,
`apps/web/public/embed.js` och `packages/api/src/lib/config.ts`. Listorna ersätts av databasen i fas 3.

Öppettider, adress och telefon ändras i admin, aldrig här.

    npm install
    npm run build    # bygger alla sajter till dist/
    npm run check    # stoppar bygget om en sajt bryter reglerna
