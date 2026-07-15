import assert from 'node:assert/strict';
import {
  expectedPrelaunchProof,
  prelaunchModeEnabled,
  validPrelaunchProof,
} from '../lib/prelaunchAccess';

const env = { PRELAUNCH_MODE: '1', LAUNCH_ACCESS_COOKIE_SECRET: 'secret' } as NodeJS.ProcessEnv;
const proof = expectedPrelaunchProof(env);
assert.equal(prelaunchModeEnabled(env), true);
assert.equal(prelaunchModeEnabled({ PRELAUNCH_MODE: '0' }), false);
assert.equal(prelaunchModeEnabled({ NODE_ENV: 'production' }), true);
assert.equal(prelaunchModeEnabled({ NODE_ENV: 'production', PRELAUNCH_MODE: 'invalid' }), true);
assert.equal(prelaunchModeEnabled({ NODE_ENV: 'development' }), false);
assert.equal(prelaunchModeEnabled({ NODE_ENV: 'development', PRELAUNCH_MODE: 'invalid' }), true);
assert.equal(typeof proof, 'string');
assert.equal(validPrelaunchProof(proof, env), true);
assert.equal(validPrelaunchProof(`${proof}x`, env), false);
assert.equal(validPrelaunchProof(proof, { PRELAUNCH_MODE: '1' }), false);

console.log('Prelaunch access: direct checkout locked behind shared signed proof OK');
