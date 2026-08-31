/**
 * Skickar välkomstmejlet till launch-leads som ännu inte fått sin kod.
 *
 * Kör TORRT som standard — utan `--live` skrivs bara vad som skulle hända.
 * Ett massutskick går inte att ångra, så avfyrningen ska kräva ett medvetet
 * extra ord på kommandoraden.
 *
 *   pnpm --filter @viaeats/api exec ts-node --transpile-only \
 *     -r dotenv/config scripts/send-launch-coupons.ts [--live] [--limit=N]
 *
 * Urvalet: leads utan `couponSentAt`, med marknadsföringssamtycke och som
 * inte avregistrerat sig. `couponSentAt` sätts per lead direkt efter att
 * transporten bekräftat — avbryts körningen mitt i får ingen mejlet två
 * gånger vid nästa körning.
 */

import prisma from '../src/lib/prisma';
import { sendLaunchWelcomeEmail } from '../src/lib/launchWelcomeEmail';

// Resends gratisnivå tillåter 100 mejl/dygn och stryper på burst. En paus
// mellan varje utskick håller oss under gränsen utan att behöva backoff.
const PAUSE_MS = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reserverade domäner som aldrig tar emot post (RFC 2606/6761). Listan
 * innehåller minst en rad från automatiserade tester. Att mejla dit ger en
 * garanterad studs, och studsar skadar avsändarryktet för alla andra —
 * Resend varnar över ~2 %, och en enda på 24 mejl är redan det dubbla.
 */
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test', 'invalid', 'localhost'];

const isUndeliverable = (email: string) => {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return UNDELIVERABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
};

async function main() {
  const live = process.argv.includes('--live');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const leads = await (prisma as any).launchLead.findMany({
    where: {
      couponSentAt: null,
      // marketingConsentAt är NOT NULL i schemat — samtycke är ett krav för
      // att raden ska existera, så det behöver inte filtreras på här.
      status: { not: 'UNSUBSCRIBED' },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
    select: { id: true, name: true, email: true, createdAt: true },
  });

  const skipped = leads.filter((lead: any) => isUndeliverable(lead.email));
  const recipients = leads.filter((lead: any) => !isUndeliverable(lead.email));

  if (recipients.length === 0) {
    console.log('Inga leads väntar på sin kod.');
    return;
  }

  console.log(`${recipients.length} leads utan kod${live ? '' : ' (TORRKÖRNING — inget skickas)'}\n`);
  for (const lead of recipients) {
    console.log(`  ${lead.email.padEnd(34)} ${lead.name}`);
  }

  if (skipped.length > 0) {
    console.log(`\nHoppas över ${skipped.length} adress(er) på reserverade domäner:`);
    for (const lead of skipped) {
      console.log(`  ${lead.email.padEnd(34)} ${lead.name}`);
    }
  }

  if (!live) {
    console.log('\nKör om med --live för att skicka på riktigt.');
    return;
  }

  console.log('\nSkickar...\n');
  let sent = 0;
  let failed = 0;

  for (const lead of recipients) {
    const ok = await sendLaunchWelcomeEmail({ to: lead.email, name: lead.name });
    if (ok) {
      // Markeras direkt, inte i en batch på slutet: kraschar processen efter
      // mejl 12 ska mejl 1–12 inte skickas om vid nästa körning.
      await (prisma as any).launchLead.update({
        where: { id: lead.id },
        data: { couponSentAt: new Date(), status: 'COUPON_SENT' },
      });
      sent += 1;
      console.log(`  ok      ${lead.email}`);
    } else {
      failed += 1;
      console.log(`  MISSLYCKADES ${lead.email} — status kvar som INTERESTED`);
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\nKlart: ${sent} skickade, ${failed} misslyckade.`);
}

main()
  .catch((error) => {
    console.error('Utskicket avbröts:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
