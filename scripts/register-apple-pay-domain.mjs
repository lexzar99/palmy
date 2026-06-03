#!/usr/bin/env node
/**
 * Registrerar en domän för Apple Pay i Stripe via API:t — samma sak som
 * Stripe Dashboard → Settings → Payment methods → Apple Pay → "Add domain".
 * Reversibelt, flyttar inga pengar. Kräver att domänen redan serverar
 * /.well-known/apple-developer-merchantid-domain-association (gör den, 200).
 *
 * Körning med din LIVE-nyckel (finns i Railway, INTE i lokala .env):
 *   cd packages/api && \
 *   STRIPE_SECRET_KEY=sk_live_XXXX node ../../scripts/register-apple-pay-domain.mjs delivera.se
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let Stripe;
try {
  Stripe = require('stripe');
} catch {
  console.error('❌ Hittar inte "stripe". Kör från packages/api:\n   cd packages/api && STRIPE_SECRET_KEY=sk_live_XXXX node ../../scripts/register-apple-pay-domain.mjs delivera.se');
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key || key.includes('local_dev_only')) {
  console.error('❌ Sätt din LIVE STRIPE_SECRET_KEY (sk_live_…). Lokala .env har en dummy.');
  process.exit(1);
}

const domain = process.argv[2] || 'delivera.se';
const stripe = new Stripe(key);

(async () => {
  const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  const existing = await stripe.applePayDomains.list({ limit: 100 });
  console.log(`Stripe ${mode} — befintliga Apple Pay-domäner:`, existing.data.map((d) => d.domain_name));
  if (existing.data.some((d) => d.domain_name === domain)) {
    console.log(`✅ ${domain} är redan registrerad. (Om knappen ändå saknas: testa i Safari på enhet med kort i Wallet.)`);
    return;
  }
  const created = await stripe.applePayDomains.create({ domain_name: domain });
  console.log(`✅ Registrerade ${domain} för Apple Pay (id ${created.id}). Testa i Safari med ett kort i Apple Wallet.`);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
