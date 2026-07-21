// Ladda upp preprocessat OSRM-data till R2 (samma bucket som API:t använder).
// Läser R2-credentials från packages/api/.env. Kör:
//   node tools/osrm/upload-data.mjs /path/till/skane-osrm.tar.gz
import { statSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/api/package.json'));
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const file = process.argv[2];
if (!file) {
  console.error('Användning: node tools/osrm/upload-data.mjs <skane-osrm.tar.gz>');
  process.exit(1);
}

// Minimal .env-parser (ingen dependency): KEY=VALUE, ignorerar kommentarer.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/api/.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL, R2_JURISDICTION } = env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('R2-credentials saknas i packages/api/.env');
  process.exit(1);
}

const endpointHost = R2_JURISDICTION && R2_JURISDICTION !== 'default'
  ? `${R2_ACCOUNT_ID}.${R2_JURISDICTION}.r2.cloudflarestorage.com`
  : `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${endpointHost}`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const key = 'osrm/skane-osrm.tar.gz';
const size = statSync(file).size;
console.log(`Laddar upp ${file} (${(size / 1e6).toFixed(0)} MB) → r2://${R2_BUCKET}/${key} ...`);
// Buffrad body (inte stream): streaming + vissa TLS-stackar ger flaky
// "bad record mac" mot R2; 80 MB i minnet är oproblematiskt.
await client.send(new PutObjectCommand({
  Bucket: R2_BUCKET,
  Key: key,
  Body: readFileSync(file),
  ContentLength: size,
  ContentType: 'application/gzip',
}));
console.log('Klart!');
console.log(`Publik URL: ${(R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/${key}`);
