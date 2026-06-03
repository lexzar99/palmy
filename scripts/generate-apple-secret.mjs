#!/usr/bin/env node
/**
 * Genererar Apple "Sign in with Apple" client secret (JWT) för Supabase.
 *
 * Detta är vad du klistrar in i Supabase → Authentication → Providers → Apple →
 * "Secret Key (for OAuth)". Den GÅR UT efter ~6 månader → kör om scriptet och
 * uppdatera Supabase när Apple-login slutar funka med "appleNotConfigured".
 *
 * Du behöver (från Apple Developer):
 *   - APPLE_TEAM_ID   : 10-teckens Team ID (Membership-sidan, t.ex. "ABCDE12345")
 *   - APPLE_KEY_ID    : Key ID för din Sign-in-with-Apple-nyckel (10 tecken)
 *   - APPLE_SERVICE_ID: din Services ID (t.ex. "se.delivera.signin") — INTE App ID
 *   - APPLE_P8_PATH   : sökväg till .p8-nyckeln du laddade ner (AuthKey_XXXX.p8)
 *
 * Körning (jsonwebtoken finns redan i repo via packages/api):
 *   cd packages/api && \
 *   APPLE_TEAM_ID=XXXXXXXXXX APPLE_KEY_ID=YYYYYYYYYY \
 *   APPLE_SERVICE_ID=se.delivera.signin APPLE_P8_PATH=~/Downloads/AuthKey_YYYY.p8 \
 *   node ../../scripts/generate-apple-secret.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  console.error('❌ Hittar inte "jsonwebtoken". Kör scriptet från packages/api:\n   cd packages/api && node ../../scripts/generate-apple-secret.mjs');
  process.exit(1);
}

const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICE_ID, APPLE_P8_PATH } = process.env;
const missing = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_SERVICE_ID', 'APPLE_P8_PATH'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error('❌ Saknar env-variabler: ' + missing.join(', ') + '\n   Se kommentaren högst upp i scriptet för exempel.');
  process.exit(1);
}

let privateKey;
try {
  privateKey = readFileSync(APPLE_P8_PATH.replace(/^~/, process.env.HOME || ''), 'utf8');
} catch (e) {
  console.error(`❌ Kunde inte läsa .p8-nyckeln på ${APPLE_P8_PATH}: ${e.message}`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const SIX_MONTHS = 60 * 60 * 24 * 180; // Apple tillåter max ~6 mån

const token = jwt.sign(
  {
    iss: APPLE_TEAM_ID,
    iat: now,
    exp: now + SIX_MONTHS,
    aud: 'https://appleid.apple.com',
    sub: APPLE_SERVICE_ID,
  },
  privateKey,
  { algorithm: 'ES256', keyid: APPLE_KEY_ID },
);

console.log('\n✅ Apple client secret (giltig ~6 mån). Klistra in i Supabase → Auth → Apple → "Secret Key":\n');
console.log(token);
console.log('\nKom också ihåg i Supabase → Auth → Apple: "Service ID" = ' + APPLE_SERVICE_ID + '\n');
