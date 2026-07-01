// A/B-tester för deals/uppdrag: två deals ställs mot varandra, varje kund ser
// deterministiskt EN av dem (hash av userId + test-id, ingen slump). Gäster ser
// variant A. Lagras i EngineSetting (key 'ab_tests') — samma mönster som
// occasions, ingen schemaändring. Utfall mäts på UserDeal-raderna per deal.

import prisma from './prisma';

export type ABTestItem = {
  id: string;
  name: string;
  dealAId: string;
  dealBId: string;
  active: boolean;
  createdAt?: string;
};

const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export async function readABTests(): Promise<ABTestItem[]> {
  const row = await (prisma as any).engineSetting.findUnique({ where: { key: 'ab_tests' } }).catch(() => null);
  const items = ((row?.params as any)?.items || []) as ABTestItem[];
  return Array.isArray(items) ? items : [];
}

export async function writeABTests(items: ABTestItem[]): Promise<void> {
  await (prisma as any).engineSetting.upsert({
    where: { key: 'ab_tests' },
    create: { key: 'ab_tests', enabled: true, params: { items } },
    update: { params: { items } },
  });
}

export function abVariantForUser(test: ABTestItem, userId: string | null): 'A' | 'B' {
  if (!userId) return 'A'; // gäster får A — stabilt och mätbart
  return fnv1a(`${userId}:${test.id}`) % 2 === 0 ? 'A' : 'B';
}

// Deal-id:n som ska DÖLJAS för den här kunden (den icke-tilldelade varianten).
export async function abHiddenDealIds(userId: string | null): Promise<Set<string>> {
  const tests = await readABTests();
  const hidden = new Set<string>();
  for (const test of tests) {
    if (!test.active || !test.dealAId || !test.dealBId) continue;
    const variant = abVariantForUser(test, userId);
    hidden.add(variant === 'A' ? test.dealBId : test.dealAId);
  }
  return hidden;
}

// Utfall per test: claims (alla UserDeals) + inlösta (USED) per variant.
export async function abTestStats(test: ABTestItem): Promise<{
  a: { claims: number; redeemed: number };
  b: { claims: number; redeemed: number };
}> {
  const [aClaims, aRedeemed, bClaims, bRedeemed] = await Promise.all([
    (prisma as any).userDeal.count({ where: { dealId: test.dealAId } }),
    (prisma as any).userDeal.count({ where: { dealId: test.dealAId, status: 'USED' } }),
    (prisma as any).userDeal.count({ where: { dealId: test.dealBId } }),
    (prisma as any).userDeal.count({ where: { dealId: test.dealBId, status: 'USED' } }),
  ]);
  return { a: { claims: aClaims, redeemed: aRedeemed }, b: { claims: bClaims, redeemed: bRedeemed } };
}
