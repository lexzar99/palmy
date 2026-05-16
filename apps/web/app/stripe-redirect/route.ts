// Stripe PaymentSheet returnURL-landing — Route Handler istället för Page.
//
// Bakgrund: Klarna+BankID på iOS funkar så här:
//
//   1. App öppnar Klarna i SFSafariViewController.
//   2. Klarna-sidan triggar BankID via bankid://-URL → BankID-appen.
//   3. När BankID är klar redirectar BankID till Klarnas web-sida —
//      OCH iOS öppnar den i Safari (inte SFSafariViewController), eftersom
//      det inte finns någon koppling tillbaka till in-app sessionen.
//   4. Klarna i Safari säger "betalning klar" och navigerar (JS) till
//      vår returnURL = https://matgo-web-pi.vercel.app/stripe-redirect.
//   5. Universal Link triggers INTE för JS-redirects i Safari (Apple
//      blockar det avsiktligt). Så Safari laddar bara vår sida.
//
// För att komma tillbaka till appen från Safari måste vi:
//   A. meta http-equiv="refresh" till foodgo://-schemat — iOS hanterar
//      det som en HTTP-redirect och öppnar appen (funkar oftare än JS
//      window.location, även om Apple ibland blockerar även detta).
//   B. JS window.location.replace som backup.
//   C. En STOR knapp med href="foodgo://..." — användar-initierat tap
//      triggar ALLTID schemat. Detta är den enda säkra fallbacken.
//
// Vi använder Route Handler istället för Page-komponent för att kunna
// kontrollera <head> exakt — Next.js Metadata API stödjer inte
// http-equiv="refresh", och att lägga meta-tag i body fungerar inte
// pålitligt över olika iOS-versioner.

import { NextRequest, NextResponse } from "next/server";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Behåll alla search-params (Stripe lägger payment_intent osv.). Hash
  // är aldrig synlig server-side, men Klarna använder bara search-params
  // — det är säkert.
  const target = `foodgo://stripe-redirect${url.search}`;
  const targetSafe = escapeHtml(target);

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a0908">
  <meta name="robots" content="noindex, nofollow">
  <title>Återgå till FoodGo</title>

  <!-- iOS försöker öppna foodgo:// direkt. Detta är det mest pålitliga
       sättet att triggera ett custom URL-scheme från Safari utan
       användartap. Apple kan blockera det i strikta privatlägen — då
       använder vi knappen nedan. -->
  <meta http-equiv="refresh" content="0;url=${targetSafe}">

  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #0a0908;
      color: #f5e6c8;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 32px 24px;
      text-align: center;
      gap: 28px;
    }
    .icon {
      width: 84px; height: 84px;
      border-radius: 28px;
      background: rgba(231, 178, 75, 0.10);
      border: 1px solid rgba(231, 178, 75, 0.25);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 16px 48px -16px rgba(231, 178, 75, 0.4);
    }
    .icon svg { color: #e7b24b; }
    h1 {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.5px;
      margin: 0;
      text-transform: uppercase;
    }
    h1 .accent { color: #e7b24b; }
    .label {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #998873;
      margin: 0;
    }
    .help {
      font-size: 13px; line-height: 1.5;
      color: #998873;
      max-width: 320px;
      margin: 0;
    }
    .cta {
      display: inline-flex;
      align-items: center; justify-content: center;
      background: #e7b24b;
      color: #000;
      font-size: 14px; font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-decoration: none;
      padding: 18px 28px;
      border-radius: 22px;
      box-shadow: 0 16px 32px -8px rgba(231, 178, 75, 0.45);
      transition: transform 0.15s ease;
      min-width: 240px;
    }
    .cta:active { transform: scale(0.97); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      animation: spin 1s linear infinite;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">
      <svg class="spinner" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    </div>

    <div>
      <h1>Betalning <span class="accent">slutförd</span></h1>
      <p class="label" style="margin-top: 12px;">Återvänder till appen</p>
    </div>

    <p class="help">
      Din betalning är registrerad. Tryck på knappen nedan om appen
      inte öppnas automatiskt — ordern slutförs direkt när du är tillbaka.
    </p>

    <a class="cta" href="${targetSafe}">Öppna FoodGo</a>
  </div>

  <script>
    // Backup-redirect via JS. iOS Safari blockar ibland custom-scheme
    // navigation som inte är användarinitierad — i så fall händer
    // ingenting och knappen ovan är den fungerande vägen tillbaka.
    (function () {
      try {
        var target = ${JSON.stringify(target)};
        // Lägg på fragment om Klarna råkar skicka något i hash (osannolikt,
        // men gratis robusthet).
        if (window.location.hash) {
          target += window.location.hash;
        }
        // Litet timeout så meta-refresh hinner försöka först.
        setTimeout(function () {
          window.location.replace(target);
        }, 250);
      } catch (e) {
        // ignorera — knappen är fallback
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Cacha INTE — varje besök är unikt (olika query-params, olika
      // betalstatus). Pålägg också säkerhetsheaders så att Safari
      // inte cache:ar gammal HTML på en gammal payment-intent-fail.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}
