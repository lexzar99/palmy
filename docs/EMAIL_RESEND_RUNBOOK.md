# Mejl från viaeats — Resend + DNS så mejlen inte hamnar i skräpposten

Skriven 2026-08-31. Gäller `packages/api/src/lib/email.ts` och välkomstmejlet i
`packages/api/src/lib/launchWelcomeEmail.ts`.

## Varför Resend

Railway blockerar utgående SMTP (port 587/465). Gmail-transporten som redan
fanns i `email.ts` fungerar därför lokalt men timeoutar i produktion. Resend
skickar över HTTPS (port 443) och kommer ut. Gratisnivån är 3 000 mejl/månad
och 100 per dygn — långt över vad launch behöver.

Gmail-transporten är kvar som lokal dev-väg och console-loggen som sista
fallback. Prioritetsordningen i `sendEmail()` är Resend → Gmail → console.

## Läget 2026-08-31

- Resend-kontot finns och ägs av `jalleshaher@gmail.com`.
- Nyckeln i `packages/api/.env` är en **send-only**-nyckel: den kan skicka
  mejl men inte lista eller lägga till domäner. Domänen måste därför läggas
  till i Resends webbgränssnitt, inte via API.
- **`viaeats.se` är ännu INTE verifierad hos Resend.** Utskick från
  `lund@viaeats.se` svarar `403 The viaeats.se domain is not verified`.
  Tills domänen är verifierad kan Resend bara skicka till kontoägarens egen
  adress, från `onboarding@resend.dev`.
- DNS för viaeats.se ligger på **Cloudflare** (`ernest`/`elma.ns.cloudflare.com`).
- Vald avsändare: **`lund@viaeats.se`**. MX pekar på Google, så adressen tar
  emot svar — viktigt, eftersom mejlet ber kunden svara om något strular.

## Steg 1: lägg till domänen i Resend

1. Logga in på resend.com som `jalleshaher@gmail.com`.
2. **Domains → Add Domain** → `viaeats.se`, region `eu-west-1`.
3. Resend visar tre DNS-poster. Lägg in dem i **Cloudflare** (DNS → Records).
   Formen ser ut så här; kopiera de exakta värdena från Resend:

   | Typ | Namn | Värde | Proxy |
   |---|---|---|---|
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | DNS only |
   | TXT | `resend._domainkey` | `p=MIGfMA0G…` (DKIM-nyckeln) | DNS only |
   | MX  | `send` | `feedback-smtp.eu-west-1.amazonses.com` (prio 10) | DNS only |

   Posterna ligger på subdomänen `send.viaeats.se` och rör alltså **inte**
   den befintliga SPF-posten (`v=spf1 include:_spf.mx.cloudflare.net ~all`)
   eller Google-MX:en på apex. Ingenting av dagens mejl påverkas.

4. Vänta tills Resend visar domänen som **Verified** (oftast minuter, ibland
   upp till ett dygn).

## Steg 2: DMARC

SPF och DKIM räcker inte längre — Gmail och Yahoo kräver DMARC för avsändare
som skickar till många mottagare. Lägg till:

| Typ | Namn | Värde |
|---|---|---|
| TXT | `_dmarc.viaeats.se` | `v=DMARC1; p=none; rua=mailto:dmarc@viaeats.se; adkim=r; aspf=r` |

Börja med `p=none` (bara rapportering). När rapporterna är rena i ett par
veckor, skärp till `p=quarantine`.

## Steg 3: variabler i Railway

| Variabel | Värde | Vad den gör |
|---|---|---|
| `RESEND_API_KEY` | API-nyckeln från Resend | Slår på Resend-transporten. Saknas den faller `sendEmail()` tillbaka på Gmail/console och inga mejl går ut. |
| `EMAIL_FROM` | `viaeats <lund@viaeats.se>` | Avsändaren. **Måste ligga på den verifierade domänen** — annars avvisar Resend utskicket. Ersätter det gamla `FoodGO <no-reply@foodgo.se>`, som skulle ha hamnat i skräpposten direkt. |
| `EMAIL_REPLY_TO` | `lund@viaeats.se` | Svarsadress. Ett mejl utan svarsväg känns automatiskt och rankas sämre. |
| `WEB_BASE_URL` | `https://viaeats.se` | Länkmål i mejlet. Faller tillbaka på `https://viaeats.se`. |

Sätts ingen `EMAIL_FROM` läser `resolveDefaultFrom()` avsändaren från
`RestaurantSettings.noReplyEmail` i admin (Plattform-inställningar). Se till
att den adressen också ligger på viaeats.se.

## Steg 4: verifiera

```bash
curl -s -X POST https://api.viaeats.se/api/launch/interest \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Testsson","email":"DIN@ADRESS.se","marketingConsent":true}'
```

Svaret ska innehålla `"couponEmailed": true`. Är det `false` gick mejlet inte
fram — kolla Railway-loggen efter `[email] resend send failed`.

Testa sedan leveransbarheten på mail-tester.com eller genom att skicka till en
Gmail-adress och öppna **Visa original** — `SPF: PASS`, `DKIM: PASS` och
`DMARC: PASS` ska stå där.

## Vad som gör att mejlen ändå hamnar i skräpposten

- **Avsändaradress på fel domän.** `EMAIL_FROM` måste matcha den verifierade
  domänen. En gmail.com-adress i From med viaeats-innehåll är den snabbaste
  vägen till skräpposten.
- **Ingen text-del.** Alla utskick här skickar både `html` och `text`. Ta
  aldrig bort textversionen.
- **Ingen avregistreringsväg.** Välkomstmejlet bär `List-Unsubscribe` och
  `List-Unsubscribe-Post`. Marknadsföringsutskick utan dem rankas ner.
- **För hög volym för tidigt.** En ny domän ska värmas upp. Skicka inte tusen
  mejl första dagen.
- **Studsar som inte städas.** Håll koll på bounce-raten i Resends dashboard;
  över ~2 % skadar avsändarryktet.
