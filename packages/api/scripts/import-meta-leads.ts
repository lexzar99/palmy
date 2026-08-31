/**
 * Importerar leads från Metas CSV-export till LaunchLead.
 *
 * Meta-kampanjen samlar in namn och e-post i ett eget formulär; utan import
 * ligger de utanför plattformens spårning och skulle kunna få välkomstmejlet
 * flera gånger. Efter importen gäller samma regler för dem som för alla
 * andra: `couponSentAt` styr utskick, avregistrering syns i `status`.
 *
 * Kör TORRT som standard. `--live` skriver.
 *
 *   pnpm --filter @viaeats/api exec ts-node --transpile-only \
 *     -r dotenv/config scripts/import-meta-leads.ts <unika.json> [--live]
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import prisma from '../src/lib/prisma';

/** Samma form som launch.ts använder: en referens, inte en inlösbar kod. */
const leadRef = () => `LEAD-${randomBytes(6).toString('hex').toUpperCase()}`;

/**
 * Nyckel för dubblettjämförelse. Gmail ignorerar punkter i adressen och allt
 * efter ett plus, så gali.ahmadi96@ och galiahmadi96@ är samma inkorg. Enbart
 * toLowerCase() missar det och skulle skapa en andra rad — personen finge då
 * välkomstmejlet två gånger.
 */
function inboxKey(raw: string): string {
  const email = (raw || '').trim().toLowerCase();
  if (!email.includes('@')) return email;
  let [local, domain] = email.split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/** Metas exportformat: "08/31/2026 6:12am". Ogiltigt datum → null. */
function parseMetaDate(raw: string): Date | null {
  const m = (raw || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, mm, dd, yyyy, h, min, ampm] = m;
  let hour = Number(h) % 12;
  if (ampm.toLowerCase() === 'pm') hour += 12;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min)));
}

async function main() {
  const live = process.argv.includes('--live');
  const path = process.argv.find((a) => a.endsWith('.json'));
  if (!path) throw new Error('ange sökväg till den sammanslagna listan (unika.json)');

  const records: Array<{ name: string; email: string; created: string; source: string }> =
    JSON.parse(fs.readFileSync(path, 'utf8'));

  const existing = await (prisma as any).launchLead.findMany({ select: { email: true } });
  const known = new Set(existing.map((r: any) => inboxKey(r.email)));

  const toCreate = records.filter((r) => !known.has(inboxKey(r.email)));

  console.log(`${records.length} personer i listan, ${known.size} finns redan i LaunchLead.`);
  console.log(`${toCreate.length} ska läggas till${live ? '' : ' (TORRKÖRNING — inget skrivs)'}.`);

  if (!live) {
    console.log('\nKör om med --live för att skriva.');
    return;
  }

  let created = 0;
  let failed = 0;
  for (const r of toCreate) {
    // Samtycket är daterat när personen fyllde i Metas formulär. Saknas ett
    // läsbart datum faller vi tillbaka på nu — raden får aldrig sakna samtycke,
    // eftersom kolumnen är NOT NULL och utskicket bygger på den.
    const consent = parseMetaDate(r.created) || new Date();
    try {
      await (prisma as any).launchLead.create({
        data: {
          name: r.name || '',
          email: r.email.trim().toLowerCase(),
          couponCode: leadRef(),
          status: 'INTERESTED',
          marketingConsentAt: consent,
          createdAt: consent,
        },
      });
      created += 1;
    } catch (error: any) {
      // P2002 = e-posten fanns redan (kapplöpning eller dubblett vi missat).
      // Att hoppa över den är rätt utfall, inte ett fel.
      if (error?.code === 'P2002') continue;
      failed += 1;
      console.log(`  MISSLYCKADES ${r.email}: ${error?.message || error}`);
    }
  }

  console.log(`\nKlart: ${created} skapade, ${failed} misslyckade.`);
}

main()
  .catch((error) => { console.error('Importen avbröts:', error); process.exit(1); })
  .finally(() => prisma.$disconnect());
