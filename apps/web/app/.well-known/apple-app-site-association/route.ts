// Apple App Site Association — krävs för iOS Universal Links.
//
// När en användare klickar på en https://delivera.se/-länk på
// iPhone och appen är installerad med matching Associated Domains-
// entitlement, öppnar iOS appen DIREKT istället för Safari. Det är den
// "rätta" Apple-pattern för deep links (bättre än custom scheme-tricks).
//
// SETUP:
// 1. Denna route serverar JSON med rätt Content-Type (Apple kräver
//    application/json, inte text/plain).
// 2. iOS-appen behöver entitlement `com.apple.developer.associated-domains`
//    med värdet `applinks:delivera.se`.
// 3. Filen MÅSTE serveras över HTTPS utan redirect — Vercel ordnar.
//
// PATH-LISTA: vilka URL:er på domänen som iOS ska intercepta.
// Wildcards: `*` matchar enstaka path-segment, `**` matchar flera.
//
// appID-format: "TEAM_ID.BUNDLE_ID":
//   appleTeamId: "3KDGPYZXHH"
//   bundleIdentifier: "se.delivera.app"

import { NextResponse } from 'next/server';

const AASA = {
  applinks: {
    apps: [] as string[],
    details: [
      // Den nuvarande Swift-appen. Saknades här tidigare, så iOS kunde aldrig
      // matcha en viaeats.se-länk mot den installerade appen och varje länk
      // landade i Safari först.
      {
        appID: '3KDGPYZXHH.se.viaeats.swift',
        paths: [
          '/r/*',
          '/i/*',
          '/order/*',
          '/cart*',
          '/stripe-redirect*',
        ],
      },
      {
        appID: '3KDGPYZXHH.se.delivera.app',
        paths: [
          '/r/*',
          // Referral/invite-länk: delivera.se/i/<kod>. Med appen installerad
          // öppnar iOS appen direkt → App.tsx fångar koden, attribuerar efter
          // login. Utan app faller den tillbaka till web-landningen (/i/[token]).
          '/i/*',
          '/order/*',
          // Betalningsreturn-URL för Klarna/BankID m.fl. redirect-
          // baserade flöden. Universal Link istället för custom scheme så
          // iOS öppnar appen direkt utan "Öppna i appen?"-prompt. Det här
          // är specifikt viktigt för Klarna eftersom BankID-flowet redan
          // har gjort en tab-switch (BankID-app), och att lägga till en
          // ytterligare "Open in app?"-prompt riskerar att användaren får
          // upp Safari istället för att hamna direkt i appen.
          '/stripe-redirect*',
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
