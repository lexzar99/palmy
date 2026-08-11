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

Mollie finns kvar parallellt för kort, Klarna, Apple Pay och Google Pay.
Kunden väljer själv i betalmenyn i kassan.

## 1. Certifikat och privat nyckel

CSR:en skapades i **Nyckelhanteraren på macOS**, vilket betyder att den privata
nyckeln aldrig låg i den nedladdade `.pem`-filen — den filen innehåller bara
certifikatkedjan. Nyckeln ligger i `login.keychain`.

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
I drift sätts de som base64 i `SWISH_CERT_PEM` / `SWISH_KEY_PEM`.

## 2. Miljövariabler

```dotenv
PAYMENT_PROVIDERS=mollie,swish     # kassan visar båda; PAYMENT_PROVIDER=mollie är default
SWISH_ENVIRONMENT=PRODUCTION
SWISH_PAYEE_ALIAS=1235309380
SWISH_CERT_PEM=<base64 av swish-cert.pem>
SWISH_KEY_PEM=<base64 av swish-key.pem>
SWISH_CALLBACK_SECRET=<minst 32 slumpade tecken, stabilt mellan deployer>
```

`SWISH_CALLBACK_URL` och `SWISH_REFUND_CALLBACK_URL` byggs automatiskt från
`API_PUBLIC_URL` och behöver bara sättas för lokala tunnlar.

## 3. Betalflödet

1. Kunden trycker **Betala** → betalknappen fälls ut till en meny.
2. **Betala med Swish** → `POST /api/payments/create` skapar ordern och en
   Payment Request med `PUT /swish-cpcapi/api/v2/paymentrequests/{id}`.
3. Svarets `paymentrequesttoken` blir en M-commerce-länk:
   `swish://paymentrequest?token=…&callbackurl=…`.
   - **Mobil:** appen öppnas direkt med belopp och mottagare ifyllt. Kunden
     anger aldrig något Swish-nummer.
   - **Desktop:** samma token visas som QR-kod.
4. Swish callbackar `/api/payments/webhooks/swish`. Callbacken är **bara en
   väcksignal** — `callbackIdentifier` verifieras och den riktiga statusen
   hämtas server-till-server med certifikatet innan ordern muteras.

## 4. Återbetalningar

Refunds går via samma certifikat och samma refund-ledger som Mollie:

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

## 5. Test

Swish officiella testmiljö (MSS) med testcertifikaten i `packages/api/.swish`:

```bash
pnpm --filter @viaeats/api test:swish-refund-mss
```

Skriptet driver en riktig betalning till `PAID`, återbetalar den via
produktionskoden, kör om samma idempotency-nyckel för att bevisa att ingen
andra utbetalning skapas, och väntar tills Swish rapporterar `refunded`.

## 6. Produktionsstatus

mTLS-handskakningen mot `cpc.getswish.net` går igenom, men API-anrop med
produktionscertifikatet svarar `ECONNRESET` — Swish stänger kopplingen efter
handskakningen. Samma kod mot MSS fungerar felfritt, så orsaken ligger inte i
integrationen utan i att numret/certifikatet ännu inte är aktiverat hos Swish.

Innan `SWISH_ENVIRONMENT=PRODUCTION` slås på:

- [ ] Lunar/Swish bekräftar att `1235309380` är aktivt för Handel-API:t.
- [ ] En liten skarp betalning och en full återbetalning är genomförda.
- [ ] `SWISH_CALLBACK_SECRET` är satt i hemlighetslagret.

## Officiella källor

- [Lunar: Swish Handel](https://intercom.help/lunar-business-sweden/sv/articles/10097846-swish-handel)
- [Lunar: aktuell företagsprislista](https://static-assets.prod.lunarway.com/se/docs/business/prislista-se-business-v1/)
- [Lunar: villkor för Swish Handel](https://cdn.prod.lunarway.com/document/Villkor%20fo%CC%88r%20Swish%20Handel%20fo%CC%88r%20fo%CC%88retagskunder.pdf)
- [Swish: Payment Request API](https://developer.swish.nu/api/payment-request/v2)
- [Swish: Refunds API](https://developer.swish.nu/api/refunds/v2)
