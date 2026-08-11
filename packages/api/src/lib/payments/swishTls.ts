import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Agent as HttpsAgent, type AgentOptions as HttpsAgentOptions } from 'node:https';

export type SwishEnvironment = 'MSS' | 'SANDBOX' | 'PRODUCTION';

export type SwishClientCertificateSource =
  | 'canonical_full_chain'
  | 'legacy_full_chain'
  | 'legacy_leaf_with_ca';

export type SwishTlsConfiguration = {
  environment: SwishEnvironment;
  clientCertificateSource: SwishClientCertificateSource;
  cert: Buffer;
  key: Buffer;
  ca?: Buffer;
  passphrase?: string;
  warnings: string[];
  agentOptions: HttpsAgentOptions;
};

export type SwishTlsInspection =
  | { ok: true; configuration: SwishTlsConfiguration; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

const CERTIFICATE_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

export function swishEnvironment(env: NodeJS.ProcessEnv = process.env): SwishEnvironment {
  const value = String(env.SWISH_ENVIRONMENT || 'MSS').trim().toUpperCase();
  if (value === 'MSS' || value === 'SANDBOX' || value === 'PRODUCTION') return value;
  throw new Error(`Ogiltig SWISH_ENVIRONMENT: ${value}`);
}

export function swishApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const environment = swishEnvironment(env);
  const explicit = String(env.SWISH_API_BASE_URL || '').trim();
  const official = environment === 'MSS'
    ? 'https://mss.cpc.getswish.net'
    : environment === 'SANDBOX'
      ? 'https://staging.getswish.pub.tds.tieto.com'
      : 'https://cpc.getswish.net';
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== '' && url.pathname !== '/')
      ) {
        throw new Error('invalid');
      }
      if (environment === 'PRODUCTION' && url.origin !== official) {
        throw new Error('production-origin');
      }
      return url.origin;
    } catch (error) {
      if ((error as Error).message === 'production-origin') {
        throw new Error('SWISH_API_BASE_URL måste vara https://cpc.getswish.net i produktion');
      }
      throw new Error('SWISH_API_BASE_URL måste vara en HTTPS-origin utan path, query eller inloggningsuppgifter');
    }
  }
  switch (environment) {
    case 'MSS': return 'https://mss.cpc.getswish.net';
    case 'SANDBOX': return 'https://staging.getswish.pub.tds.tieto.com';
    case 'PRODUCTION': return 'https://cpc.getswish.net';
  }
}

export function swishCallbackSecretIssue(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = String(env.SWISH_CALLBACK_SECRET || '');
  return secret.length >= 32
    ? null
    : 'SWISH_CALLBACK_SECRET måste vara minst 32 tecken';
}

export function swishPayeeAlias(env: NodeJS.ProcessEnv = process.env): string {
  const fallback = swishEnvironment(env) === 'MSS' ? '1234679304' : '';
  const alias = String(env.SWISH_PAYEE_ALIAS || fallback).replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(alias)) {
    throw new Error('SWISH_PAYEE_ALIAS saknas eller är ogiltigt');
  }
  return alias;
}

function credential(
  env: NodeJS.ProcessEnv,
  pemName: string,
  pathName: string,
  required = true,
): Buffer | undefined {
  const inline = String(env[pemName] || '').trim();
  if (inline) {
    return inline.includes('-----BEGIN')
      ? Buffer.from(inline.replace(/\\n/g, '\n'))
      : Buffer.from(inline, 'base64');
  }
  const path = String(env[pathName] || '').trim();
  if (path) {
    try {
      return readFileSync(path);
    } catch {
      throw new Error(`${pathName} kan inte läsas`);
    }
  }
  if (required) throw new Error(`${pemName} eller ${pathName} saknas`);
  return undefined;
}

export function swishCertificateBlocks(value: Buffer): string[] {
  return value.toString('utf8').match(CERTIFICATE_PATTERN) || [];
}

function parseCertificates(value: Buffer, name: string): X509Certificate[] {
  const blocks = swishCertificateBlocks(value);
  if (!blocks.length) throw new Error(`${name} innehåller inget PEM-certifikat`);
  return blocks.map((block, index) => {
    try {
      return new X509Certificate(block);
    } catch {
      throw new Error(`${name} innehåller ett ogiltigt certifikat på plats ${index + 1}`);
    }
  });
}

/**
 * Legacy-hjälpare för den tidigare uppdelningen leaf + issuer. Ny
 * konfiguration ska i stället lägga hela kedjan i SWISH_CLIENT_CERT_CHAIN_*.
 */
export function mergeSwishClientCertificate(
  certificate: Buffer,
  issuerChain?: Buffer,
): Buffer {
  const certificateCount = swishCertificateBlocks(certificate).length;
  if (certificateCount < 1) {
    throw new Error('Swish klientcertifikat innehåller inget PEM-certifikat');
  }
  if (certificateCount > 1 || !issuerChain) return certificate;
  if (swishCertificateBlocks(issuerChain).length < 1) {
    throw new Error('Swish klientcertifikatkedja innehåller inget PEM-certifikat');
  }
  return Buffer.concat([certificate, Buffer.from('\n'), issuerChain]);
}

function assertCertificateDate(certificate: X509Certificate, label: string, nowMs: number): void {
  const notBefore = Date.parse(certificate.validFrom);
  const notAfter = Date.parse(certificate.validTo);
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter)) {
    throw new Error(`${label} har oläsbara giltighetsdatum`);
  }
  if (nowMs < notBefore || nowMs >= notAfter) {
    throw new Error(`${label} är utgånget eller ännu inte giltigt (${certificate.validFrom} – ${certificate.validTo})`);
  }
}

function assertClientChain(chain: X509Certificate[], nowMs: number): void {
  if (chain.length < 2) {
    throw new Error(
      'Swish klientcertifikatet är leaf-only; en full kedja (leaf + issuer) krävs',
    );
  }
  if (chain[0].ca) {
    throw new Error('Första certifikatet i Swish klientkedjan måste vara merchant leaf-certifikatet');
  }
  chain.forEach((certificate, index) => {
    assertCertificateDate(
      certificate,
      index === 0 ? 'Swish klientcertifikatet' : `Swish klientkedjans certifikat ${index + 1}`,
      nowMs,
    );
  });
  for (let index = 0; index < chain.length - 1; index += 1) {
    const child = chain[index];
    const issuer = chain[index + 1];
    if (!issuer.ca) {
      throw new Error(`Swish klientkedjans issuer på plats ${index + 2} saknar CA-behörighet`);
    }
    if (child.issuer !== issuer.subject || !child.checkIssued(issuer)) {
      throw new Error(`Swish klientkedjan har fel issuer eller ordning vid plats ${index + 1}`);
    }
    if (!child.verify(issuer.publicKey)) {
      throw new Error(`Swish klientkedjans signatur är ogiltig vid plats ${index + 1}`);
    }
  }
}

function parsePrivateKey(key: Buffer, passphrase: string | undefined): KeyObject {
  try {
    return createPrivateKey({ key, format: 'pem', passphrase });
  } catch {
    throw new Error('SWISH_KEY_PEM/SWISH_KEY_PATH innehåller ingen läsbar privatnyckel');
  }
}

function assertLeafMatchesPrivateKey(leaf: X509Certificate, privateKey: KeyObject): void {
  const certificatePublicKey = leaf.publicKey.export({ type: 'spki', format: 'der' });
  const privatePublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!Buffer.from(certificatePublicKey).equals(Buffer.from(privatePublicKey))) {
    throw new Error('Swish klientcertifikat och privatnyckel hör inte ihop');
  }
}

function certificateCommonName(certificate: X509Certificate): string | null {
  const match = certificate.subject.match(/(?:^|\n)CN=([^\n]+)/);
  return match?.[1]?.trim() || null;
}

function assertProductionAlias(
  leaf: X509Certificate,
  env: NodeJS.ProcessEnv,
  environment: SwishEnvironment,
): void {
  if (environment !== 'PRODUCTION') return;
  const commonName = certificateCommonName(leaf)?.replace(/\D/g, '') || '';
  if (!commonName || commonName !== swishPayeeAlias(env)) {
    throw new Error('SWISH_PAYEE_ALIAS matchar inte klientcertifikatets Swish-nummer (CN)');
  }
}

function validateServerTrust(
  serverCa: Buffer | undefined,
  clientChain: X509Certificate[],
  nowMs: number,
): void {
  if (!serverCa) return;
  const serverCertificates = parseCertificates(serverCa, 'SWISH_SERVER_CA_PEM/SWISH_SERVER_CA_PATH');
  const clientFingerprints = new Set(clientChain.map((certificate) => certificate.fingerprint256));
  for (const [index, certificate] of serverCertificates.entries()) {
    assertCertificateDate(certificate, `Swish server-trust certifikat ${index + 1}`, nowMs);
    if (!certificate.ca) {
      throw new Error(`Swish server-trust certifikat ${index + 1} saknar CA-behörighet`);
    }
    if (clientFingerprints.has(certificate.fingerprint256)) {
      throw new Error('Swish klientcertifikatkedja får inte användas som server-trust');
    }
  }
}

function legacyCertificate(
  env: NodeJS.ProcessEnv,
  environment: SwishEnvironment,
  warnings: string[],
): { cert: Buffer; source: SwishClientCertificateSource } {
  const legacy = credential(env, 'SWISH_CERT_PEM', 'SWISH_CERT_PATH')!;
  if (swishCertificateBlocks(legacy).length > 1) {
    warnings.push(
      'SWISH_CERT_PEM/SWISH_CERT_PATH är deprecated; flytta fullkedjan till SWISH_CLIENT_CERT_CHAIN_PEM/PATH',
    );
    return { cert: legacy, source: 'legacy_full_chain' };
  }
  const legacyCa = credential(env, 'SWISH_CA_PEM', 'SWISH_CA_PATH', false);
  if (environment !== 'PRODUCTION' || !legacyCa) {
    throw new Error(
      'SWISH_CERT_PEM/SWISH_CERT_PATH är leaf-only; sätt fullkedjan i SWISH_CLIENT_CERT_CHAIN_PEM/PATH',
    );
  }
  warnings.push(
    'Deprecated Swish-konfiguration: SWISH_CERT_* leaf + SWISH_CA_* klientkedja; flytta fullkedjan till SWISH_CLIENT_CERT_CHAIN_*',
  );
  return {
    cert: mergeSwishClientCertificate(legacy, legacyCa),
    source: 'legacy_leaf_with_ca',
  };
}

export function loadSwishTlsConfiguration(
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date | number } = {},
): SwishTlsConfiguration {
  const environment = swishEnvironment(env);
  // Validate the destination together with the certificate material so
  // readiness and /methods fail before the first customer payment.
  swishApiBaseUrl(env);
  const warnings: string[] = [];
  const canonical = credential(
    env,
    'SWISH_CLIENT_CERT_CHAIN_PEM',
    'SWISH_CLIENT_CERT_CHAIN_PATH',
    false,
  );
  const selected = canonical
    ? { cert: canonical, source: 'canonical_full_chain' as const }
    : legacyCertificate(env, environment, warnings);
  const clientChain = parseCertificates(
    selected.cert,
    canonical
      ? 'SWISH_CLIENT_CERT_CHAIN_PEM/SWISH_CLIENT_CERT_CHAIN_PATH'
      : 'SWISH_CERT_PEM/SWISH_CERT_PATH',
  );
  const nowValue = options.now instanceof Date ? options.now.getTime() : options.now;
  const nowMs = typeof nowValue === 'number' ? nowValue : Date.now();
  assertClientChain(clientChain, nowMs);

  const key = credential(env, 'SWISH_KEY_PEM', 'SWISH_KEY_PATH')!;
  const passphrase = String(env.SWISH_KEY_PASSPHRASE || '').trim() || undefined;
  const privateKey = parsePrivateKey(key, passphrase);
  assertLeafMatchesPrivateKey(clientChain[0], privateKey);
  assertProductionAlias(clientChain[0], env, environment);

  const explicitServerCa = credential(
    env,
    'SWISH_SERVER_CA_PEM',
    'SWISH_SERVER_CA_PATH',
    false,
  );
  // I MSS/Sandbox är SWISH_CA_* den historiska testroten för Swish-servern.
  // I produktion får den aldrig bli server-trust: där används Node:s publika
  // trust store, om inte en separat SWISH_SERVER_CA_* uttryckligen sätts.
  const ca = explicitServerCa || (
    environment === 'PRODUCTION'
      ? undefined
      : credential(env, 'SWISH_CA_PEM', 'SWISH_CA_PATH', false)
  );
  validateServerTrust(ca, clientChain, nowMs);

  const agentOptions: HttpsAgentOptions = {
    cert: selected.cert,
    key,
    ca,
    passphrase,
    minVersion: 'TLSv1.2',
    keepAlive: true,
    rejectUnauthorized: true,
  };
  return {
    environment,
    clientCertificateSource: selected.source,
    cert: selected.cert,
    key,
    ca,
    passphrase,
    warnings,
    agentOptions,
  };
}

export function inspectSwishTlsConfiguration(
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date | number } = {},
): SwishTlsInspection {
  try {
    const configuration = loadSwishTlsConfiguration(env, options);
    return { ok: true, configuration, warnings: configuration.warnings };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ogiltig Swish TLS-konfiguration',
      warnings: [],
    };
  }
}

export function createSwishHttpsAgent(
  configuration: SwishTlsConfiguration = loadSwishTlsConfiguration(),
): HttpsAgent {
  return new HttpsAgent(configuration.agentOptions);
}
