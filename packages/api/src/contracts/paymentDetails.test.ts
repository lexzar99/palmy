import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertPaymentDetailsCoherent,
  hasPayableDestination,
  luhnValid,
  normalizeBankgiro,
  normalizeBic,
  normalizeIban,
  normalizePaymentDetails,
  normalizePlusgiro,
  PaymentDetailError,
  touchesPaymentDetails,
} from '../lib/paymentDetails';

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log('paymentDetails');

run('bankgiro normaliseras till NNNN-NNNN oavsett hur det skrivs in', () => {
  assert.equal(normalizeBankgiro('54021183'), '5402-1183');
  assert.equal(normalizeBankgiro('5402-1183'), '5402-1183');
  assert.equal(normalizeBankgiro(' 5402 1183 '), '5402-1183');
  // Sjusiffrigt bankgiro grupperas NNN-NNNN.
  assert.equal(normalizeBankgiro('9912346'), '991-2346');
});

run('bankgiro med fel kontrollsiffra avvisas', () => {
  // En felskriven sista siffra ska aldrig gå igenom — den skickar pengarna
  // till fel mottagare och banken fångar det inte åt oss.
  assert.throws(() => normalizeBankgiro('54021187'), PaymentDetailError);
  assert.throws(() => normalizeBankgiro('54021184'), /kontrollsiffra/);
});

run('bankgiro med fel längd avvisas', () => {
  assert.throws(() => normalizeBankgiro('123456'), /7 eller 8 siffror/);
  assert.throws(() => normalizeBankgiro('123456789'), /7 eller 8 siffror/);
});

run('plusgiro normaliseras till NNNNNN-N', () => {
  assert.equal(normalizePlusgiro('1234566'), '123456-6');
  assert.equal(normalizePlusgiro('123456-6'), '123456-6');
  assert.equal(normalizePlusgiro('18'), '1-8');
});

run('plusgiro med fel kontrollsiffra avvisas', () => {
  assert.throws(() => normalizePlusgiro('1234561'), /kontrollsiffra/);
});

run('luhn räknar rätt', () => {
  assert.equal(luhnValid('54021183'), true);
  assert.equal(luhnValid('54021187'), false);
  assert.equal(luhnValid('abc'), false);
});

run('IBAN mod-97 kontrolleras och normaliseras till versaler utan mellanslag', () => {
  assert.equal(normalizeIban('SE35 5000 0000 0549 1000 0003'), 'SE3550000000054910000003');
  assert.equal(normalizeIban('de89370400440532013000'), 'DE89370400440532013000');
});

run('IBAN med en ändrad siffra avvisas', () => {
  assert.throws(() => normalizeIban('SE3550000000054910000004'), /kontrollen stämmer inte/);
  assert.throws(() => normalizeIban('SE35'), /fel format/);
});

run('BIC accepteras i 8 och 11 tecken', () => {
  assert.equal(normalizeBic('handsess'), 'HANDSESS');
  assert.equal(normalizeBic('NDEASESSXXX'), 'NDEASESSXXX');
  assert.throws(() => normalizeBic('HANDSE'), /8 eller 11/);
  assert.throws(() => normalizeBic('HANDSESSXX'), /8 eller 11/);
});

run('tomt värde rensar fältet i stället för att avvisas', () => {
  // Så här tar man bort en felaktig uppgift.
  assert.deepEqual(normalizePaymentDetails({ bankgiro: '' }), { bankgiro: null });
  assert.deepEqual(normalizePaymentDetails({ bankgiro: '   ' }), { bankgiro: null });
  assert.deepEqual(normalizePaymentDetails({ iban: null }), { iban: null });
});

run('bara skickade fält rörs — utelämnade lämnas ifred', () => {
  const result = normalizePaymentDetails({ bankgiro: '54021183' });
  assert.deepEqual(result, { bankgiro: '5402-1183' });
  assert.equal('plusgiro' in result, false, 'ett fält som inte skickades får inte nollas');
  assert.equal('iban' in result, false);
});

run('fakturamejl normaliseras och valideras', () => {
  assert.deepEqual(
    normalizePaymentDetails({ invoiceEmail: '  Faktura@Palmyra.SE ' }),
    { invoiceEmail: 'faktura@palmyra.se' },
  );
  assert.throws(() => normalizePaymentDetails({ invoiceEmail: 'inte-en-adress' }), /fel format/);
});

run('fakturaadress trimmas men får vara fritext', () => {
  assert.deepEqual(
    normalizePaymentDetails({ invoiceAddress: '  Box 12, 221 00 Lund  ' }),
    { invoiceAddress: 'Box 12, 221 00 Lund' },
  );
});

run('BIC utan IBAN avvisas mot det sammanslagna resultatet', () => {
  assert.throws(() => assertPaymentDetailsCoherent({ bic: 'HANDSESS' }), /kräver ett IBAN/);
  assert.doesNotThrow(() =>
    assertPaymentDetailsCoherent({ bic: 'HANDSESS', iban: 'SE3550000000054910000003' }),
  );
  // Ett BIC som redan ligger sparat tillsammans med sitt IBAN ska inte
  // plötsligt bli ogiltigt när man ändrar något annat fält.
  assert.doesNotThrow(() => assertPaymentDetailsCoherent({ iban: 'SE3550000000054910000003' }));
});

run('touchesPaymentDetails känner igen en nyttolast som rör uppgifterna', () => {
  assert.equal(touchesPaymentDetails({ bankgiro: '5402-1183' }), true);
  assert.equal(touchesPaymentDetails({ bankgiro: null }), true, 'att rensa är också en ändring');
  assert.equal(touchesPaymentDetails({ name: 'Palmyra' }), false);
  assert.equal(touchesPaymentDetails(null), false);
  assert.equal(touchesPaymentDetails(undefined), false);
});

run('hasPayableDestination kräver minst ett konto att betala till', () => {
  assert.equal(hasPayableDestination({ bankgiro: '5402-1183' }), true);
  assert.equal(hasPayableDestination({ plusgiro: '123456-6' }), true);
  assert.equal(hasPayableDestination({ iban: 'SE3550000000054910000003' }), true);
  assert.equal(hasPayableDestination({ invoiceEmail: 'faktura@palmyra.se' }), false);
  assert.equal(hasPayableDestination({}), false);
});

/* ── Uppgifterna får aldrig nå kundappen ────────────────────────────────── */

const restaurantRouteSource = readFileSync(
  join(__dirname, '..', 'routes', 'restaurants.ts'),
  'utf8',
);

run('formatRestaurant returnerar aldrig betalningsuppgifter', () => {
  // formatRestaurant driver de publika rutterna GET /restaurants och
  // GET /restaurants/:slug. Hamnar ett kontonummer där ligger det öppet på
  // internet. Uppgifterna får bara nå svaret via den auth-grindade grenen.
  const start = restaurantRouteSource.indexOf('const formatRestaurant = (');
  assert.ok(start > 0, 'formatRestaurant måste finnas');
  const end = restaurantRouteSource.indexOf('\n};', start);
  const body = restaurantRouteSource.slice(start, end);
  for (const field of ['bankgiro', 'plusgiro', 'iban', 'bic', 'invoiceAddress', 'invoiceEmail']) {
    assert.ok(
      !body.includes(field),
      `${field} får inte returneras av formatRestaurant — den serialiserar publika svar`,
    );
  }
});

run('betalningsuppgifter exponeras bara bakom canViewSensitiveAdminFields', () => {
  assert.match(
    restaurantRouteSource,
    /canViewSensitiveAdminFields[\s\S]{0,400}\.\.\.data\.paymentDetails/,
    'uppgifterna måste ligga i den auth-grindade grenen',
  );
});

run('bara superadmin får ändra betalningsuppgifter', () => {
  assert.match(
    restaurantRouteSource,
    /touchesPaymentDetails\(req\.body\)[\s\S]{0,400}role !== 'SUPER_ADMIN'[\s\S]{0,200}Endast super-admin kan ändra betalningsuppgifter/,
    'en restaurangadmin får inte peka om sina egna utbetalningar',
  );
});

console.log('\npaymentDetails: alla testfall gröna');
