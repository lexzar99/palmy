import assert from 'node:assert/strict';
import { createSwishTlsFixtures } from './fixtures/swishTlsFixtures';
import {
  createSwishHttpsAgent,
  inspectSwishTlsConfiguration,
  loadSwishTlsConfiguration,
  swishApiBaseUrl,
  swishCertificateBlocks,
} from '../lib/payments/swishTls';

const fixtures = createSwishTlsFixtures();
process.once('exit', fixtures.cleanup);
const { leaf, intermediate, root, serverRoot, key, wrongKey, fullChain, issuerChain } = fixtures;

const validProduction: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  SWISH_ENVIRONMENT: 'PRODUCTION',
  SWISH_PAYEE_ALIAS: '1231234567',
  SWISH_CLIENT_CERT_CHAIN_PEM: fullChain,
  SWISH_KEY_PEM: key,
  SWISH_SERVER_CA_PEM: serverRoot,
};

const configured = loadSwishTlsConfiguration(validProduction);
assert.equal(configured.clientCertificateSource, 'canonical_full_chain');
assert.equal(swishCertificateBlocks(configured.cert).length, 3);
assert.deepEqual(configured.warnings, []);
assert.equal(configured.agentOptions.minVersion, 'TLSv1.2');
assert.equal(configured.agentOptions.rejectUnauthorized, true);
assert.equal(configured.agentOptions.keepAlive, true);
assert.equal(configured.agentOptions.cert, configured.cert);
assert.equal(configured.agentOptions.key, configured.key);
assert.equal(configured.agentOptions.ca, configured.ca);

const agent = createSwishHttpsAgent(configured);
assert.equal(agent.options.minVersion, 'TLSv1.2');
assert.equal(agent.options.rejectUnauthorized, true);
assert.equal(agent.options.keepAlive, true);
assert.equal(agent.options.cert, configured.cert);
assert.equal(agent.options.key, configured.key);
assert.equal(agent.options.ca, configured.ca);
agent.destroy();

assert.equal(swishApiBaseUrl(validProduction), 'https://cpc.getswish.net');
assert.equal(swishApiBaseUrl({
  ...validProduction,
  SWISH_API_BASE_URL: 'https://cpc.getswish.net/',
}), 'https://cpc.getswish.net');
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_API_BASE_URL: 'http://cpc.getswish.net',
  }),
  /HTTPS-origin/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_API_BASE_URL: 'https://mss.cpc.getswish.net',
  }),
  /måste vara https:\/\/cpc\.getswish\.net i produktion/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_API_BASE_URL: 'https://cpc.getswish.net/redirect',
  }),
  /utan path/,
);

assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_CLIENT_CERT_CHAIN_PEM: leaf,
  }),
  /leaf-only|full kedja/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_KEY_PEM: wrongKey,
  }),
  /hör inte ihop/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_CLIENT_CERT_CHAIN_PEM: [root, intermediate, leaf].join('\n'),
  }),
  /merchant leaf|issuer|ordning/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_PAYEE_ALIAS: '1230000000',
  }),
  /matchar inte.*CN/,
);
assert.throws(
  () => loadSwishTlsConfiguration(validProduction, {
    now: new Date('2100-01-01T00:00:00.000Z'),
  }),
  /utgånget eller ännu inte giltigt/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_SERVER_CA_PEM: root,
  }),
  /får inte användas som server-trust/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_SERVER_CA_PEM: leaf,
  }),
  /saknar CA-behörighet/,
);
assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_CLIENT_CERT_CHAIN_PEM: 'not-a-certificate',
  }),
  /inget PEM-certifikat/,
);

const legacyFullChain = loadSwishTlsConfiguration({
  ...validProduction,
  SWISH_CLIENT_CERT_CHAIN_PEM: '',
  SWISH_CERT_PEM: fullChain,
});
assert.equal(legacyFullChain.clientCertificateSource, 'legacy_full_chain');
assert.match(legacyFullChain.warnings.join(' '), /deprecated/i);

const verifiedLegacyLeafAndCa = loadSwishTlsConfiguration({
  ...validProduction,
  SWISH_CLIENT_CERT_CHAIN_PEM: '',
  SWISH_CERT_PEM: leaf,
  SWISH_CA_PEM: issuerChain,
  SWISH_SERVER_CA_PEM: '',
});
assert.equal(verifiedLegacyLeafAndCa.clientCertificateSource, 'legacy_leaf_with_ca');
assert.equal(swishCertificateBlocks(verifiedLegacyLeafAndCa.cert).length, 3);
assert.match(verifiedLegacyLeafAndCa.warnings.join(' '), /deprecated/i);
assert.equal(verifiedLegacyLeafAndCa.ca, undefined, 'legacy production CA must never become server trust');

assert.throws(
  () => loadSwishTlsConfiguration({
    ...validProduction,
    SWISH_CLIENT_CERT_CHAIN_PEM: '',
    SWISH_CERT_PEM: leaf,
    SWISH_CA_PEM: serverRoot,
  }),
  /issuer|ordning/,
  'legacy SWISH_CA may be appended only when it cryptographically issues the leaf',
);

const inspection = inspectSwishTlsConfiguration({
  ...validProduction,
  SWISH_CLIENT_CERT_CHAIN_PEM: leaf,
});
assert.equal(inspection.ok, false);
if (inspection.ok === false) assert.match(inspection.error, /leaf-only|full kedja/);

console.log('Swish TLS contracts: full chain, identity, trust separation and agent options are guarded');
