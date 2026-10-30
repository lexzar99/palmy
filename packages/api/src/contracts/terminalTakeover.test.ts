import assert from 'node:assert/strict';
import { clientVersionCode, isLegacyAppOnTakenOverDevice, isTakeoverByV2 } from '../lib/terminalTakeover';

const v1 = { version: '26.08.21.2+90' };
const v2 = { version: '2.0.0+200' };

assert.equal(clientVersionCode('26.08.21.2+90'), 90);
assert.equal(clientVersionCode('2.0.0-v2preview+200'), 200);
assert.equal(clientVersionCode('native'), null);
assert.equal(clientVersionCode(null), null);

// v2 loggar in på en platta där v1 satt: övertagande, v1 spärras därefter.
assert.equal(isTakeoverByV2({ appVersion: '26.08.21.2+90' }, v2), true);
assert.equal(isTakeoverByV2({ appVersion: null }, v2), true);
assert.equal(isTakeoverByV2({ appVersion: '2.0.0+200' }, v2), false, 'v2 som förnyar sin egen session är inget nytt övertagande');
assert.equal(isTakeoverByV2({ appVersion: '26.08.21.2+90' }, v1), false);

assert.equal(isLegacyAppOnTakenOverDevice({ appVersion: '2.0.0+200' }, v1), true, 'v1 får aldrig tillbaka en platta som v2 tagit');
assert.equal(isLegacyAppOnTakenOverDevice({ appVersion: '26.08.21.2+90' }, v1), false, 'v1 fungerar som förut där v2 inte finns');
assert.equal(isLegacyAppOnTakenOverDevice({ appVersion: '2.0.0+200' }, v2), false);
assert.equal(isLegacyAppOnTakenOverDevice({ appVersion: '2.0.0+200' }, {}), false, 'klient utan version spärras inte');
assert.equal(isLegacyAppOnTakenOverDevice(null, v1), false);

console.log('terminal takeover contracts: ok');
