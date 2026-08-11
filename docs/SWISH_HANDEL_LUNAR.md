# Egen Swish Handel (direkt mTLS via Lunar)

## Beslut

ViaEats kör **sin egen Swish-integration** — inte Swish genom Mollie och inte
via en teknisk leverantör. Lunar har utfärdat ett Swish Handel-certifikat
direkt för vårt eget nummer, vilket gör mellanhanden onödig.

> Tidigare version av det här dokumentet utgick från att Lunar krävde en
> teknisk leverantör (Quickpay/Mondido). Det stämmer inte längre: certifikatet
> nedan är utfärdat av `Lunar Customer CA1 v2 for Swish` direkt till ViaEats.
> Quickpay-spåret är därmed avfört.

| | |
| --- | --- |
| Swish-nummer (`payeeAlias`) | `1235309380` |
| Organisationsnummer | `5595935247` |
| Utfärdare | `Lunar Customer CA1 v2 for Swish` |
| Giltigt | 2026-08-11 → 2031-08-11 |

Stripe kör parallellt för kort, Klarna, Apple Pay och Google Pay. Direkt Swish
går fortsatt med ViaEats eget Lunar-certifikat. Kunden väljer varje metod som
ett separat val i kassans fasta betalsteg.

## 1. Certifikat och privat nyckel

CSR:en skapades i **Nyckelhanteraren på macOS**, vilket betyder att den privata
nyckeln aldrig låg i den nedladdade `.pem`-filen. Den nedladdade filen
innehåller däremot hela den publika klientkedjan: merchant-certifikatet, Lunar
Customer CA och Lunar Root CA. Nyckeln ligger i `login.keychain`.

Så här togs paret ut (nyckeln lämnar aldrig maskinen):

```bash
security import swish_certificate.pem -k ~/Library/Keychains/login.keychain-db
security find-identity            # identiteten "1235309380" ska finnas
security export -k ~/Library/Keychains/login.keychain-db -t identities \
  -f pkcs12 -P "<engångslösen>" -o swish.p12
openssl pkcs12 -legacy -in swish.p12 -passin pass:"<engångslösen>" -nocerts -nodes
```

`CSSMERR_TP_NOT_TRUSTED` på identiteten är förväntat — macOS känner inte till
Lunars Swish-CA. Det påverkar inte mTLS.

Kontrollera alltid att nyckel och certifikat hör ihop innan de används:

```bash
openssl x509 -in swish-cert.pem -noout -modulus | openssl md5
openssl rsa  -in swish-key.pem  -noout -modulus | openssl md5
```

Filerna ligger lokalt i `~/.viaeats/swish/` (`chmod 600`), **aldrig i repot**.
I drift sätts den kompletta publika klientkedjan som base64 i
`SWISH_CLIENT_CERT_CHAIN_PEM` och nyckeln i `SWISH_KEY_PEM`.

Viktigt: `https.Agent.ca` är trust store för **Swish servercertifikat** och
skickas inte till Swish. Merchant-certifikatets Lunar-kedja måste ligga i
`https.Agent.cert`. Den kanoniska variabeln
`SWISH_CLIENT_CERT_CHAIN_PEM` ska därför innehålla **hela** originalkedjan i
ordningen leaf → Lunar Customer CA → Lunar Root CA. `SWISH_CERT_PEM` med en
full kedja stöds tillfälligt som legacy. Äldre production-konfiguration med
leaf i `SWISH_CERT_PEM` och issuer-kedjan i `SWISH_CA_PEM` accepteras bara om
issuer, signatur och CA-behörighet verifieras kryptografiskt och ger en
deprecated-varning.
`cpc.getswish.net` har en publik DigiCert-kedja och verifieras normalt med
Node:s vanliga trust store; `SWISH_SERVER_CA_PEM` behövs bara som explicit
server-trust override.

## 2. Miljövariabler

```dotenv
PAYMENT_PROVIDER=stripe
PAYMENT_PROVIDERS=stripe,swish     # Stripe Elements + direkt Swish
SWISH_ENVIRONMENT=PRODUCTION
SWISH_PAYEE_ALIAS=1235309380
SWISH_CLIENT_CERT_CHAIN_PEM=<base64 av hela kedjan: leaf + Lunar Customer CA + Lunar Root CA>
SWISH_KEY_PEM=<base64 av swish-key.pem>
SWISH_CALLBACK_SECRET=<minst 32 slumpade tecken, stabilt mellan deployer>
SWISH_PAYOUT_FEE_POLICY=fixed_per_payment
SWISH_PAYOUT_FEE_ORE=149
SWISH_PAYOUTS_DISABLED=<true för kundcheckout med hårdblockerade restaurangutbetalningar>
```

`SWISH_CALLBACK_URL` och `SWISH_REFUND_CALLBACK_URL` byggs automatiskt från
`API_PUBLIC_URL` och behöver bara sättas för lokala tunnlar.

## 3. Betalflödet

1. Kunden trycker **Betala** → samma `/cart`-route visar ett fast betalsteg med
   separata val för Swish, Klarna, Apple Pay, Google Pay och kort.
2. **Betala med Swish** → `POST /api/payments/create` skapar ordern och en
   Payment Request med `PUT /swish-cpcapi/api/v2/paymentrequests/{id}`.
3. Svarets `paymentrequesttoken` blir en M-commerce-länk:
   `swish://paymentrequest?token=…&callbackurl=…`.
   - **Mobil:** appen öppnas direkt med belopp och mottagare ifyllt. Kunden
     anger aldrig något Swish-nummer.
   - **Desktop:** QR-koden innehåller Swish Commerce-formatet `D` + token.
     App-deeplinken ska inte kodas direkt som QR-innehåll.
4. Swish callbackar `/api/payments/webhooks/swish`. Callbacken är **bara en
   väcksignal** — `callbackIdentifier` verifieras och den riktiga statusen
   hämtas server-till-server med certifikatet innan ordern muteras.

## 4. Återbetalningar

Refunds går via samma certifikat och samma provider-neutrala refund-ledger som
Stripe och övriga PSP-flöden:

- `PUT /swish-cpcapi/api/v2/refunds/{instructionId}` där `instructionId` är
  **härlett ur refund-ledgerns idempotency-nyckel**. Referensen är alltså känd
  redan innan anropet — tappas svaret kan samma refund läsas tillbaka i stället
  för att en andra utbetalning skapas.
- `originalPaymentReference` är Swish **egen** referens på den betalda
  betalningen, inte vårt instruktions-ID. Fel fält här ger `RF02`/`RP03`.
- Swish saknar "lista refunds för en betalning". Ledgern är därför källan till
  *vilka* refunds som finns, och Swish till deras *status*.
- Callback: `/api/payments/webhooks/swish-refund`.

Statusmappning: `CREATED→queued`, `INITIATED→pending`,
`VALIDATED`/`DEBITED→processing`, `PAID→refunded`, `ERROR→failed`.

Swish har inget avgifts-/settlement-API. Restaurangutbetalning failar därför
säkert tills ekonomiägaren uttryckligen väljer `external` (ViaEats bokför
bankkostnaden utanför restaurangens orderspecifika payout) eller
`fixed_per_payment` med den exakta öresavgiften från det undertecknade
Lunar-avtalet. Koden gissar aldrig en bankavgift.

## 5. Test

Swish officiella testmiljö (MSS) med testcertifikaten i `packages/api/.swish`:

```bash
pnpm --filter @viaeats/api test:swish-refund-mss
```

Skriptet driver en riktig betalning till `PAID`, återbetalar den via
produktionskoden, kör om samma idempotency-nyckel för att bevisa att ingen
andra utbetalning skapas, och väntar tills Swish rapporterar `refunded`.

## 6. Produktionsstatus

Rotorsaken till `ECONNRESET` var identifierad och reproducerad 2026-08-11:
API-klienten skickade bara merchant-leaf-certifikatet. Lunar-kedjan låg felaktigt
i `https.Agent.ca`, som inte skickas som klientkedja. Ett leaf-only-anrop
resetades av Swish; exakt samma läsande GET med leaf + Lunar-kedja gav ett
normalt autentiserat `404/RP04` för ett avsiktligt okänt request-id. Det bevisar
att produktionsänden accepterar certifikat/nummer och att felet låg i klientens
certifikatpaketering.

Koden skickar nu full klientkedja, använder rätt server-trust och validerar att
certifikat, privatnyckel och `SWISH_PAYEE_ALIAS` hör ihop innan första anropet.

Innan `SWISH_ENVIRONMENT=PRODUCTION` slås på:

- [x] Swish produktions-API accepterar mTLS-identiteten för `1235309380`.
- [ ] En liten skarp betalning och en full återbetalning är genomförda.
- [x] `SWISH_CALLBACK_SECRET` är satt i hemlighetslagret.
- [x] Ekonomiägaren har godkänt `fixed_per_payment` med `149` öre enligt Lunar-avtalet.

## Officiella källor

- [Lunar: Swish Handel](https://intercom.help/lunar-business-sweden/sv/articles/10097846-swish-handel)
- [Lunar: aktuell företagsprislista](https://static-assets.prod.lunarway.com/se/docs/business/prislista-se-business-v1/)
- [Lunar: villkor för Swish Handel](https://cdn.prod.lunarway.com/document/Villkor%20fo%CC%88r%20Swish%20Handel%20fo%CC%88r%20fo%CC%88retagskunder.pdf)
- [Swish: Payment Request API](https://developer.swish.nu/api/payment-request/v2)
- [Swish: Refunds API](https://developer.swish.nu/api/refunds/v2)
