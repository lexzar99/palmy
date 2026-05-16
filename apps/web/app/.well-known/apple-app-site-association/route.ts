// Apple App Site Association — krävs för iOS Universal Links.
//
// När en användare klickar på en https://matgo-web-pi.vercel.app/-länk på
// iPhone och appen är installerad med matching Associated Domains-
// entitlement, öppnar iOS appen DIREKT istället för Safari. Det är den
// "rätta" Apple-pattern för deep links (bättre än foodgo://-tricks).
//
// SETUP:
// 1. Denna route serverar JSON med rätt Content-Type (Apple kräver
//    application/json, inte text/plain).
// 2. iOS-appen behöver entitlement `com.apple.developer.associated-domains`
//    med värdet `applinks:matgo-web-pi.vercel.app`.
// 3. Filen MÅSTE serveras över HTTPS utan redirect — Vercel ordnar.
//
// PATH-LISTA: vilka URL:er på domänen som iOS ska intercepta.
// Wildcards: `*` matchar enstaka path-segment, `**` matchar flera.
//
// appID-format: "TEAM_ID.BUNDLE_ID" — hämtat från app.json:
//   appleTeamId: "3KDGPYZXHH"
//   bundleIdentifier: "com.foodgoJalle.app"

import { NextResponse } from 'next/server';

const AASA = {
  applinks: {
    apps: [] as string[],
    details: [
      {
        appID: '3KDGPYZXHH.com.foodgoJalle.app',
        paths: [
          '/verify-email*',
          '/reset-password*',
          '/r/*',
          '/order/*',
        ],
      },
    ],
  },
};

export async function GET() {
  return NextResponse.json(AASA, {
    headers: {
      'Content-Type': 'application/json',
      // Apple cachar AASA — låt CDN cacha 1h så uppdateringar slår igenom
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
