/**
 * CLI-wrapper runt lib/r2Migrate.ts. Använd när du föredrar att köra
 * migration från terminalen istället för admin-UI:t.
 *
 * Kör FRÅN REPO-ROTEN med `railway run` (lånar Railway-env: R2_*, CLOUDINARY_*,
 * DATABASE_URL). Använd pnpm-scriptet `migrate:r2` (kör via ts-node — tsx finns ej):
 *
 *   railway run pnpm --filter api migrate:r2                       # dry-run
 *   railway run pnpm --filter api migrate:r2 -- --apply           # på riktigt
 *   railway run pnpm --filter api migrate:r2 -- --apply --only=products
 *   railway run pnpm --filter api migrate:r2 -- --apply --restaurant=palmyra-pizzeria
 *
 * OBS: `--` krävs för att flaggorna ska nå scriptet (annars äter pnpm dem).
 */
import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { runR2Migration } from '../src/lib/r2Migrate';

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '') as any;
const RESTAURANT_FILTER = (process.argv.find((a) => a.startsWith('--restaurant=')) || '').replace('--restaurant=', '');

async function main() {
  console.log('================================================================');
  console.log(`R2 migration ${APPLY ? '(LIVE)' : '(DRY-RUN)'}`);
  if (ONLY) console.log(`Endast: ${ONLY}`);
  if (RESTAURANT_FILTER) console.log(`Restaurang-filter: ${RESTAURANT_FILTER}`);
  console.log('================================================================');

  const result = await runR2Migration({
    apply: APPLY,
    only: ONLY || undefined,
    restaurantSlug: RESTAURANT_FILTER || undefined,
  });

  if (!result.configured) {
    console.error('⚠️  R2 är inte konfigurerat. Sätt env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL');
    process.exit(1);
  }

  console.log('');
  console.log('================================================================');
  console.log(`Skannade ${result.scanned}`);
  console.log(`Migrerade ${result.migrated}`);
  console.log(`Redan i R2 ${result.alreadyR2}`);
  console.log(`Misslyckade ${result.failed}`);
  console.log(`Hoppade (tom URL) ${result.skippedNoUrl}`);
  console.log('================================================================');
  if (result.failedExamples.length) {
    console.log('\nExempel på fel:');
    for (const f of result.failedExamples) console.log(`  - ${f.label}: ${f.error}`);
  }
  if (!APPLY) console.log('\nDetta var en DRY-RUN. Inget ändrades. Kör med --apply för riktig migration.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
