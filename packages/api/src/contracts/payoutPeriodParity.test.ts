import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isFinanceCalendarMonthPeriod, resolveFinancePeriod } from '../lib/financePeriod';

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log('payoutPeriodParity');

run('en hel månad från klienten godkänns som kalendermånad', () => {
  // Klienten skickar datum utan tid. Tolkas de som UTC-midnatt hamnar de två
  // timmar fel mot Europe/Stockholm på sommaren, och varje sparförsök avvisas
  // med "Avräkningen måste omfatta en hel kalendermånad".
  for (const [from, to] of [
    ['2026-01-01', '2026-01-31'],
    ['2026-02-01', '2026-02-28'],
    ['2026-08-01', '2026-08-31'], // sommartid, UTC+2
    ['2026-11-01', '2026-11-30'], // normaltid, UTC+1
    ['2026-12-01', '2026-12-31'],
  ]) {
    const { start, end } = resolveFinancePeriod(from, to);
    assert.equal(
      isFinanceCalendarMonthPeriod(start, end),
      true,
      `${from}–${to} måste räknas som en hel kalendermånad`,
    );
  }
});

run('råa Date-objekt från datumsträngar är INTE en kalendermånad', () => {
  // Det här är felet som fanns: `new Date("2026-08-01")` blir UTC-midnatt.
  const naiveStart = new Date('2026-08-01');
  const naiveEnd = new Date('2026-08-31');
  assert.equal(
    isFinanceCalendarMonthPeriod(naiveStart, naiveEnd),
    false,
    'om det här börjar bli sant har tidszonsregeln ändrats — läs om kontrollen',
  );
});

run('en delperiod avvisas fortfarande', () => {
  const { start, end } = resolveFinancePeriod('2026-08-05', '2026-08-20');
  assert.equal(isFinanceCalendarMonthPeriod(start, end), false);
});

run('månadsskiftet över årsskiftet räknas rätt', () => {
  const { start, end } = resolveFinancePeriod('2026-12-01', '2026-12-31');
  assert.equal(isFinanceCalendarMonthPeriod(start, end), true);
  // Slutet är sista millisekunden före nästa månads Stockholm-midnatt.
  assert.equal(end.getTime() + 1, resolveFinancePeriod('2027-01-01', '2027-01-31').start.getTime());
});

/* ── Rutterna måste tolka perioden på samma sätt ────────────────────────── */

const payoutsSource = readFileSync(join(__dirname, '..', 'routes', 'payouts.ts'), 'utf8');
const financeSource = readFileSync(join(__dirname, '..', 'routes', 'finance.ts'), 'utf8');

run('både summary och payouts använder resolveFinancePeriod', () => {
  assert.match(financeSource, /resolveFinancePeriod\(/, 'summary-routen måste använda den delade tolkningen');
  assert.match(payoutsSource, /resolveFinancePeriod\(/, 'payouts-routen måste använda samma tolkning');
});

run('payouts-routen bygger aldrig perioden med rå new Date', () => {
  // parseDate finns kvar för andra fält, men får inte användas för perioden:
  // en sparad rad måste gå att hitta igen med samma gränser.
  assert.doesNotMatch(
    payoutsSource,
    /const start = parseDate\(periodStart\)/,
    'perioden får inte tolkas som UTC-midnatt',
  );
  assert.doesNotMatch(
    payoutsSource,
    /periodStart: from, periodEnd: to/,
    'listfiltret måste använda den upplösta perioden',
  );
});

console.log('\npayoutPeriodParity: alla testfall gröna');
