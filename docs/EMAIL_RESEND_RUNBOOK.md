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

## Steg 1: konto och domän

1. Skapa konto på resend.com (gratis, inget kort).
2. **Domains → Add Domain** → `viaeats.se`.
3. Resend visar tre DNS-poster. Lägg in dem hos den som har DNS för
   viaeats.se. Poster ser ut ungefär så här (kopiera de exakta värdena från
   Resend — de nedan är formen, inte värdena):

   | Typ | Namn | Värde |
   |---|---|---|
   | TXT | `send.viaeats.se` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey.viaeats.se` | `p=MIGfMA0G…` (DKIM-nyckeln) |
   | MX  | `send.viaeats.se` | `feedback-smtp.eu-west-1.amazonses.com` (prio 10) |

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
| `EMAIL_FROM` | `viaeats <hej@viaeats.se>` | Avsändaren. **Måste ligga på den verifierade domänen** — annars avvisar Resend utskicket. |
| `EMAIL_REPLY_TO` | t.ex. `support@viaeats.se` | Svarsadress. Valfri, men ett mejl utan svarsväg känns automatiskt och rankas sämre. |
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
