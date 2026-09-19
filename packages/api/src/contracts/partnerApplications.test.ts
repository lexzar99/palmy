import assert from 'node:assert/strict';
import { PartnerApplicationSchema, partnerApplicationId, partnerApplicationBody, partnerRetentionCutoff, PARTNER_INBOX } from '../lib/partnerApplications';
import express from 'express';
const input = { kind: 'partner', name: 'Test Person', email: 'TEST@example.com', consent: true, website: '', source: 'meta', campaign: 'partner_sep26', creative: 'kontakt' };
const parsed = PartnerApplicationSchema.parse(input);
assert.equal(parsed.email, 'test@example.com');
assert.equal(partnerApplicationId(parsed), partnerApplicationId({ kind: 'partner', email: ' TEST@EXAMPLE.COM ' }));
assert.notEqual(partnerApplicationId(parsed), partnerApplicationId({ ...parsed, kind: 'installation' }));
assert.equal(PartnerApplicationSchema.safeParse({ ...input, consent: false }).success, false);
assert.equal(PartnerApplicationSchema.safeParse({ ...input, kind: 'installation' }).success, false);
assert.equal(PartnerApplicationSchema.safeParse({ ...input, role: 'SUPER_ADMIN' }).success, false);
assert.equal(PartnerApplicationSchema.safeParse({ ...input, creative: '<script>' }).success, false);
assert.equal('website' in JSON.parse(partnerApplicationBody(parsed)), false);
assert.equal(partnerRetentionCutoff(new Date('2026-09-19T00:00:00Z')).toISOString(), '2026-03-23T00:00:00.000Z');
const rows = new Map<string, any>();
let fail = false;
const prismaPath = require.resolve('../lib/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { __esModule: true, default: { note: {
  deleteMany: async () => ({ count: 0 }),
  upsert: async (arg: any) => { if (fail) throw new Error('offline'); assert.deepEqual(arg.update, {}); if (!rows.has(arg.where.id)) rows.set(arg.where.id, { ...arg.create, createdAt: new Date() }); },
  findMany: async ({ where }: any) => { assert.equal(where.authorName, PARTNER_INBOX); return [...rows.values()]; },
  count: async () => rows.size,
} } } } as any;
const authPath = require.resolve('../middleware/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  authenticate: (req: any, res: any, next: any) => req.headers['x-test-role'] ? next() : res.sendStatus(401),
  requireSuperAdmin: (req: any, res: any, next: any) => req.headers['x-test-role'] === 'SUPER_ADMIN' ? next() : res.sendStatus(403),
} } as any;
async function main() {
  const router = require('../routes/partnerApplications').default;
  const app = express(); app.use(express.json()); app.use('/api/partner-applications', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/partner-applications`;
  const post = (body: unknown) => fetch(`${base}/interest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(input)).status, 200);
    assert.equal((await post({ ...input, name: 'Attacker' })).status, 200);
    assert.equal(rows.size, 1);
    assert.equal(JSON.parse([...rows.values()][0].body).name, 'Test Person', 'Återförsök får inte ändra sparad identitet');
    assert.equal((await post({ ...input, email: 'bot@example.com', website: 'spam' })).status, 200);
    assert.equal(rows.size, 1, 'Honeypot sparar ingenting');
    assert.equal((await post({ ...input, consent: false })).status, 400);
    assert.equal((await fetch(`${base}/admin`)).status, 401);
    assert.equal((await fetch(`${base}/admin`, { headers: { 'x-test-role': 'MERCHANT' } })).status, 403);
    const admin = await fetch(`${base}/admin`, { headers: { 'x-test-role': 'SUPER_ADMIN' } });
    assert.equal(admin.headers.get('cache-control'), 'no-store');
    assert.equal((await admin.json() as any).total, 1);
    fail = true;
    assert.equal((await post({ ...input, email: 'failure@example.com' })).status, 503, 'Databasfel får inte ge falsk bekräftelse');
    console.log('Partneranmälningar: validering, deduplicering, sekretess, åtkomst och felhantering OK');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
