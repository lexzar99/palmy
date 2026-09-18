import assert from 'node:assert/strict';
import { recordJourneyRegistration } from '../lib/journeyRegistration';
import { isJourneyStep } from '../lib/journey';

async function main() {
  const writes: any[] = [];
  const store = { journeyEvent: { create: async (input: unknown) => { writes.push(input); } } };
  await recordJourneyRegistration(undefined, 'verified-user', store);
  await recordJourneyRegistration({ sessionId: 'session-123', consent: false }, 'verified-user', store);
  await recordJourneyRegistration({ sessionId: '<script>', consent: true }, 'verified-user', store);
  assert.equal(writes.length, 0);
  await recordJourneyRegistration({ sessionId: 'session-123', consent: true, utmSource: 'email', utmCampaign: 'palmyra_test', userId: 'forged' }, 'verified-user', store);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.userId, 'verified-user');
  assert.equal(writes[0].data.step, 'REGISTERED');
  assert.equal(writes[0].data.utmCampaign, 'palmyra_test');
  assert.equal(isJourneyStep('REGISTERED'), false, 'publik spårningsendpoint får inte skapa registreringar');
  const log = console.error;
  try {
    console.error = () => {};
    await assert.doesNotReject(recordJourneyRegistration({ sessionId: 'session-123', consent: true }, 'verified-user', { journeyEvent: { create: async () => { throw new Error('offline'); } } }));
  } finally { console.error = log; }
  console.log('Registreringsmätning: samtycke, identitetskälla och fail-open ok');
}
void main();
