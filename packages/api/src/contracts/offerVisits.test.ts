import assert from 'node:assert/strict';
import { OFFER_FORM_STEPS, OfferVisitSchema, summarizeOfferVisits, type OfferVisit } from '../lib/offerVisits';

const visit = (over: Partial<OfferVisit>): OfferVisit => ({
  id: '11111111-1111-4111-8111-111111111111', stage: 'start', last: 'start', seconds: 10, form: 0, device: 'mobil', source: 'meta', ...over,
});

const summary = summarizeOfferVisits([
  visit({ seconds: 4 }),
  visit({ stage: 'jamforelse', last: 'kvitto', seconds: 30 }),
  visit({ stage: 'slut', last: 'fragor', seconds: 120, form: OFFER_FORM_STEPS.length, device: 'dator', source: 'direkt' }),
]);
const stage = (id: string) => summary.stages.find((row) => row.id === id)!;

assert.equal(summary.visits, 3);
assert.equal(summary.medianSeconds, 30);
assert.equal(summary.leads, 1);
assert.equal(stage('start').reached, 3);
assert.equal(stage('skroll').reached, 2, 'att nå ett senare steg räknas som att ha passerat de tidigare');
assert.equal(stage('slut').reached, 1);
assert.equal(stage('kvitto').left, 1, 'man lämnar där man är, inte där man som längst kom');
assert.equal(stage('fragor').left, 0, 'den som anmält sig har inte lämnat sidan utan resultat');
assert.equal(summary.form[0].reached, 1);
assert.deepEqual(summary.sources[0], { name: 'meta', visits: 2, leads: 0 });
assert.equal(summarizeOfferVisits([]).medianSeconds, 0);

assert.equal(OfferVisitSchema.safeParse(visit({})).success, true);
assert.equal(OfferVisitSchema.safeParse({ ...visit({}), id: '<script>' }).success, false);
assert.equal(OfferVisitSchema.safeParse({ ...visit({}), stage: 'okänt' }).success, false);
assert.equal(OfferVisitSchema.safeParse({ ...visit({}), source: 'a b@c' }).success, false);

console.log('offerVisits: alla kontrakt gröna');
