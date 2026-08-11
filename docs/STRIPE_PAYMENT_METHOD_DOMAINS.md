# Stripe payment method domains — varför knappar "försvinner" och hur de registreras

## Varför detta finns

Apple Pay, Google Pay, Klarna, Link, PayPal och Amazon Pay visas **bara** i
Stripes inbäddade ytor (Payment Element / Express Checkout Element) om exakt
den domän som serverar kassan är registrerad som *payment method domain* hos
Stripe. En oregistrerad domän ger **inga fel** — knapparna döljs tyst och
`onReady` rapporterar inga tillgängliga metoder.

Viktigt:

- **Subdomäner räknas separat.** Kassan serveras på `www.viaeats.se`
  (apex `viaeats.se` 308-redirectar dit via Vercel) — det är alltså exakt
  `www.viaeats.se` som ska vara registrerad.
- **Live-registrering propagerar automatiskt till sandboxes**, inte tvärtom.
- Apple Pay kräver dessutom att verifieringsfilen serveras med 200 på
  `https://www.viaeats.se/.well-known/apple-developer-merchantid-domain-association`
  (ligger i `apps/web/public/`, tvingas till `text/plain` i `next.config.ts`).
- Hosted Checkout (`checkout.stripe.com`) påverkas inte — Stripes egen domän
  är alltid registrerad. Det var därför wallets syntes i hosted-eran men
  försvann när kassan blev inbäddad.

## Registrera/verifiera

Skriptet är idempotent (skapar bara om domänen saknas, validerar alltid om)
och skriver ut status per betalmetod. Obs: `scripts/` är gitignorerad i det
här repot (lokala verktyg) — skriptet ligger på maskinen som kör Railway-CLI:t;
Dashboard-vägen nedan är alltid tillgänglig som alternativ:

```bash
railway run -s "ViaEats API" -e production -- node scripts/register-payment-method-domain.mjs www.viaeats.se
```

Alternativ utan Railway:

```bash
STRIPE_SECRET_KEY=sk_live_… node scripts/register-payment-method-domain.mjs www.viaeats.se
```

Manuellt: Stripe Dashboard → Settings → Payments → **Payment method domains**
→ Add domain → `www.viaeats.se`.

Förväntad utskrift: `apple_pay/google_pay/klarna/link … active`. Vid
`inactive` skrivs Stripes `status_details.error_message` ut (för Apple Pay är
det nästan alltid verifieringsfilen som inte nås med 200).

> Det gamla skriptet `scripts/register-apple-pay-domain.mjs` är borttaget:
> det använde det utfasade `applePayDomains`-API:t och hade **fel default-domän**
> (`delivera.se`). `paymentMethodDomains` täcker alla metoder på en gång.

## Registrering räcker inte alltid — knapparnas egna regler

Även med aktiv domän styr Stripe + enheten vad som faktiskt visas:

| Metod | Visas när |
|---|---|
| Apple Pay | Safari (macOS/iOS) med kort i Wallet. Aldrig i Chrome/Firefox på desktop (om inte `always`). |
| Google Pay | Chrome/Android med Google Pay uppsatt. |
| Klarna (expressknapp) | Stripe avgör per session; **kan inte tvingas** (`klarna` stöder bara `auto`/`never`). Stöds inte i in-app-webviews (Instagram m.fl.). |

Därför har kassan en **garanti-fallback**: när Klarna-expressknappen inte får
visas renderar `apps/web/app/cart/page.tsx` ViaEats egen rosa Klarna-rad
(`renderKlarnaFallbackChoice` → `startKlarnaFallbackCheckout`), som kör samma
inbäddade deferred-flöde men bekräftar via `stripe.confirmKlarnaPayment` →
helsidesredirect till Klarna → tillbaka till `/cart?payment_return=…` där
befintlig statuspollning tar över. Klarna kan alltså aldrig saknas i listan.
Wallets har kortfältet som permanent fallback.

## Felsökning i kassan

- Öppna betalsteget med `?paydebug=1` på `/cart` — visar pk-läge (live/test),
  providers, wallet-tillgänglighet, Klarna-ECE-status och embed-läge.
- Konsolen loggar `[stripe] …`-rader när express-knappar döljs eller inte
  kan laddas (onReady utan metoder respektive onLoadError).
- Kom ihåg: i partner-embeds (`embed=1`) är hela Stripe-blocket avsiktligt
  dolt — endast Swish visas där.

## Verifieringschecklista efter ändring

1. `node scripts/register-payment-method-domain.mjs` (live) — allt `active`.
2. Desktop Chrome på `https://www.viaeats.se` → varukorg → betalsteg:
   Klarna-knappen (Stripes eller rosa fallback) syns. Google Pay om inloggad.
3. iPhone Safari (kort i Wallet): Apple Pay-knappen syns.
4. `cd apps/web && npm run test:contracts` — kontraktstesterna pinnar
   ordning (Swish → Klarna → wallets → Kort), fallback-gaten och loggningen.
