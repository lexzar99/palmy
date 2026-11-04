import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTO_FINAL_AFTER_MIN,
  isSelfDeliveryAutoFinalDue,
  selfDeliveryLatestMs,
} from '../lib/deliveryWindow';
import { customerEtaLatestAt } from '../lib/orderEta';
import {
  cleanOutcomeNote,
  customerOutcomeView,
  deliveryOutcomeCopy,
  DeliveryOutcomeError,
  outcomeBlocksReview,
  outcomeIneligibleReason,
  validateOutcome,
  type StoredOutcome,
} from '../lib/deliveryOutcome';
import { renderDeliveryOutcomeEmail } from '../lib/deliveryOutcomeEmail';
import { customerOrderStatusCopy } from '../lib/customerOrderNotifier';
import { PAYOUT_ORDER_STATUSES } from '../lib/payoutPolicy';

const src = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');
const min = 60_000;

// ── Problem 1: vi gissar inte "levererad" ────────────────────────────────────
assert.equal(AUTO_FINAL_AFTER_MIN, 50);
const departed = new Date('2026-11-03T18:00:00Z');
assert.equal(isSelfDeliveryAutoFinalDue(departed, departed.getTime() + 49 * min), false);
assert.equal(isSelfDeliveryAutoFinalDue(departed, departed.getTime() + 50 * min), true);
assert.equal(isSelfDeliveryAutoFinalDue(null), false);

// Intervallet: nedre gräns + 15 min, alltid före den automatiska avslutningen.
assert.equal(selfDeliveryLatestMs(15 * min), 30 * min);
assert.equal(selfDeliveryLatestMs(25 * min), 40 * min);
assert.equal(selfDeliveryLatestMs(40 * min), 45 * min);
assert.equal(selfDeliveryLatestMs(60 * min), 60 * min);

const onTheWay = {
  id: 'o1', status: 'DELIVERING', selfDelivery: true, deliveringAt: departed,
  etaCustomerAt: new Date(departed.getTime() + 20 * min), etaReason: 'Avstånd till kund',
};
assert.equal(customerEtaLatestAt(onTheWay)?.toISOString(), new Date(departed.getTime() + 35 * min).toISOString());
assert.equal(customerEtaLatestAt({ ...onTheWay, selfDelivery: false }), null);
assert.equal(customerEtaLatestAt({ ...onTheWay, status: 'DELIVERED' }), null);

// Timern och kundens gamla PATCH följer samma 50-minutersgräns.
const finalizer = src('../lib/liveActivityFinalize.ts');
assert.match(finalizer, /selfDeliveryCutoff = new Date\(now - AUTO_FINAL_AFTER_MS\)/);
assert.doesNotMatch(finalizer, /computeDeliveryWindowMs\(deliveringAt, order\.id/);
const orders = src('../routes/orders.ts');
assert.match(orders, /if \(!isSelfDeliveryAutoFinalDue\(order\.deliveringAt\)\)/);

// Push säger aldrig "levererad" vid egen hemkörning, men gör det fortfarande för bud.
assert.doesNotMatch(JSON.stringify(customerOrderStatusCopy('DELIVERED', 'DELIVERY', null, null, true)), /levererad/i);
assert.match(customerOrderStatusCopy('DELIVERED', 'DELIVERY', null, null, false)?.title || '', /levererad/);
assert.match(customerOrderStatusCopy('DELIVERING', 'DELIVERY', null, 20, true)?.body || '', /20–35 minuter/);
assert.match(customerOrderStatusCopy('DELIVERED', 'PICKUP', null, null, true)?.title || '', /hämtad/);

// Ekonomin är orörd.
assert.deepEqual([...PAYOUT_ORDER_STATUSES], ['DELIVERED', 'COMPLETED']);

// ── Problem 2: "Kunden gick inte att nå" ─────────────────────────────────────
const code = (input: Parameters<typeof validateOutcome>[0]) => {
  try { validateOutcome(input); return 'ok'; } catch (e) { return (e as DeliveryOutcomeError).code; }
};
assert.equal(code({ outcome: 'AT_RESTAURANT' }), 'ok');
assert.equal(code({ outcome: 'at_restaurant' }), 'ok');
assert.equal(code({ outcome: 'DELIVERED' }), 'INVALID_OUTCOME');
assert.equal(code({}), 'INVALID_OUTCOME');
assert.equal(code({ outcome: 'LEFT_WITH_NEIGHBOUR' }), 'NOTE_REQUIRED');
assert.equal(code({ outcome: 'LEFT_WITH_NEIGHBOUR', note: '   ' }), 'NOTE_REQUIRED');
assert.equal(code({ outcome: 'LEFT_WITH_NEIGHBOUR', note: 'x'.repeat(141) }), 'NOTE_TOO_LONG');
assert.deepEqual(validateOutcome({ outcome: 'LEFT_WITH_NEIGHBOUR', note: '  Grannen\n i 1201 ' }), { code: 'LEFT_WITH_NEIGHBOUR', note: 'Grannen i 1201' });
assert.equal(validateOutcome({ outcome: 'LEFT_AT_DOOR', note: 'ignoreras' }).note, null);
assert.equal(cleanOutcomeNote('a\u0000b\u007fc'), 'a b c');

const now = Date.parse('2026-11-03T19:00:00Z');
const base = { type: 'DELIVERY', status: 'DELIVERING', createdAt: new Date(now - 60 * min), selfDelivery: true };
const marked: StoredOutcome = {
  orderId: 'o1', restaurantId: 'r1', code: 'AT_RESTAURANT', note: null, markedAt: '', deviceId: null, appVersion: null, revision: 1, emails: 1,
};
assert.equal(outcomeIneligibleReason(base, null, 'AT_RESTAURANT', now), null);
assert.equal(outcomeIneligibleReason({ ...base, status: 'DELIVERED' }, null, 'LEFT_AT_DOOR', now), null);
assert.ok(outcomeIneligibleReason({ ...base, type: 'PICKUP' }, null, 'AT_RESTAURANT', now));
assert.ok(outcomeIneligibleReason({ ...base, selfDelivery: false }, null, 'AT_RESTAURANT', now));
assert.ok(outcomeIneligibleReason({ ...base, status: 'CANCELLED' }, null, 'AT_RESTAURANT', now));
assert.ok(outcomeIneligibleReason({ ...base, createdAt: new Date(now - 25 * 60 * min) }, null, 'AT_RESTAURANT', now));
assert.ok(outcomeIneligibleReason(base, null, 'RESOLVED', now));
assert.equal(outcomeIneligibleReason(base, marked, 'RESOLVED', now), null);

assert.equal(outcomeBlocksReview(marked), true);
assert.equal(outcomeBlocksReview({ code: 'REDELIVERING' }), true);
assert.equal(outcomeBlocksReview({ code: 'LEFT_AT_DOOR' }), true);
assert.equal(outcomeBlocksReview({ code: 'LEFT_WITH_NEIGHBOUR' }), true);
assert.equal(outcomeBlocksReview({ code: 'RESOLVED' }), false);
assert.equal(outcomeBlocksReview(null), false);

assert.equal(customerOutcomeView({ ...marked, code: 'RESOLVED' }, { includeNote: true }), null);
assert.equal(customerOutcomeView({ ...marked, note: 'hemligt' }, { includeNote: false })?.note, null);

const copy = deliveryOutcomeCopy('AT_RESTAURANT', { restaurantName: 'Palmyra', restaurantPhone: '046-12 34 56', note: null });
assert.match(copy?.body || '', /Palmyra/);
assert.match(copy?.body || '', /046-12 34 56/);
assert.equal(deliveryOutcomeCopy('RESOLVED', { restaurantName: 'P', restaurantPhone: '', note: null }), null);

const mail = renderDeliveryOutcomeEmail({
  code: 'LEFT_WITH_NEIGHBOUR', note: '<b>Granne</b>', orderNumber: 'PA-1380-ZS4NH', restaurantName: 'Palmyra', restaurantPhone: '046-123',
});
assert.equal(mail?.subject, 'Om din beställning #1380 från Palmyra');
assert.doesNotMatch(mail?.html || '', /<b>Granne<\/b>/);

// Rutten: bara plattan, restaurangen ur token, fritexten aldrig i audit eller mejlet till fel ställe.
const route = src('../routes/terminalOrders.ts');
assert.match(route, /const guard = \[authenticate, requireTerminalDevice\]/);
assert.match(route, /where: \{ id: String\(req\.params\.id\), restaurantId \}/);
assert.match(route, /const restaurantId = treq\.admin\.restaurantId/);
assert.match(route, /'ORDER_NOT_FOUND'/);
assert.match(route, /'TERMINAL_ORDER_DELIVERY_OUTCOME'/);
const auditBlock = route.slice(route.indexOf("'TERMINAL_ORDER_DELIVERY_OUTCOME'"), route.indexOf('if (next.revision'));
assert.doesNotMatch(auditBlock, /\bnote\b/);
assert.doesNotMatch(src('../lib/deliveryOutcomeEmail.ts'), /customerPhone/);
assert.match(src('../routes/terminal.ts'), /router\.use\(terminalOrdersRouter\)/);

// Kunden kan inte betygsätta medan maten väntar, och READY räknas bara för avhämtning.
assert.match(orders, /DELIVERY_OUTCOME_OPEN/);
const profile = src('../routes/profile.ts');
assert.match(profile, /order\.status === 'READY' && order\.type === 'PICKUP'/);
assert.match(profile, /DELIVERY_OUTCOME_OPEN/);

// Avslutad order med öppet besked: ingen "Hoppas maten smakade!" och ingen betygspush.
const notifier = src('../lib/customerOrderNotifier.ts');
assert.match(notifier, /\(status === 'DELIVERED' \|\| status === 'COMPLETED'\) && outcomeBlocksReview\(await readOutcome\(order\.id\)\)/);
assert.ok(notifier.indexOf('outcomeBlocksReview(await readOutcome') < notifier.indexOf('scheduleReviewPrompt(order.id'));
assert.match(deliveryOutcomeCopy('LEFT_AT_DOOR', { restaurantName: 'Palmyra', restaurantPhone: '046-1', note: null })?.body || '', /Kontakta Palmyra på 046-1/);

console.log('orderDelivery ok');
