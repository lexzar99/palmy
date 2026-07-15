import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const adminRouteSource = fs.readFileSync(path.join(__dirname, '../routes/admin.ts'), 'utf8');
const launchRoute = adminRouteSource.match(
  /type LaunchLeadCursor[\s\S]*?router\.patch\('\/launch-campaign\/:id\/coupon-status'/,
)?.[0] || '';

assert.ok(launchRoute, 'launch-campaign route contract must exist');
assert.match(launchRoute, /decodeLaunchLeadCursor/);
assert.match(launchRoute, /requestedLimit < 1 \|\| requestedLimit > 100/);
assert.match(launchRoute, /orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\]/);
assert.match(launchRoute, /take: requestedLimit \+ 1/);
assert.match(launchRoute, /\{ createdAt: \{ lt: cursor\.createdAt \} \}/);
assert.match(launchRoute, /\{ createdAt: cursor\.createdAt, id: \{ lt: cursor\.id \} \}/);
assert.match(launchRoute, /const leadPageWhere = cursor[\s\S]*?: \{\};/);
assert.match(launchRoute, /hasNextPage: leadPage\.length > requestedLimit|const hasNextPage = leadPage\.length > requestedLimit/);
assert.match(launchRoute, /nextCursor: hasNextPage && lastLead \? encodeLaunchLeadCursor\(lastLead\) : null/);
assert.doesNotMatch(launchRoute, /take: 100/);

const dashboardApiSource = fs.readFileSync(
  path.join(__dirname, '../../../../apps/admin/src/modules/dashboard/api.ts'),
  'utf8',
);
assert.match(dashboardApiSource, /pageInfo: \{/);
assert.match(dashboardApiSource, /hasNextPage: boolean/);
assert.match(dashboardApiSource, /nextCursor: string \| null/);
assert.match(dashboardApiSource, /\["launch-campaign", days, cursor, limit\]/);
assert.match(dashboardApiSource, /search\.set\("cursor", cursor\)/);

const campaignPageSource = fs.readFileSync(
  path.join(__dirname, '../../../../apps/admin/src/modules/launch-campaign/page.tsx'),
  'utf8',
);
assert.match(campaignPageSource, /useState<Array<string \| null>>\(\[\]\)/);
assert.match(campaignPageSource, /setCursorStack\(\[\]\)/);
assert.match(campaignPageSource, /setCursorStack\(\(stack\) => \[\.\.\.stack, cursor\]\)/);
assert.match(campaignPageSource, /setCursorStack\(\(stack\) => stack\.slice\(0, -1\)\)/);
assert.match(campaignPageSource, />Föregående<\/Button>/);
assert.match(campaignPageSource, />Nästa<\/Button>/);

console.log('Launch campaign: stable cursor pagination exposes every lead without a fixed cap OK');
