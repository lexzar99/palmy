/**
 * Schemalagd kapacitets-bevakning → notifierar admin PROAKTIVT (utan att man
 * behöver öppna dashboarden). Kör var 30:e min:
 *  - emit:ar 'capacity:alert' till admin-room (toast om dashboarden är öppen)
 *  - mejlar admin när en NY varning/kritisk dyker upp (throttlat: max 1/6h)
 *
 * De-dup i minne: vi mejlar bara när en ny metric-nyckel korsar tröskeln, inte
 * om och om för samma sak. (Nollställs vid omstart — acceptabelt.)
 */
import { getCapacityMetrics } from './capacity';
import { sendEmail } from './email';
import prisma from './prisma';
import { getIO } from './socket';

let lastAlertKeys = new Set<string>();
let lastEmailAt = 0;
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function alertRecipient(): Promise<string | null> {
  try {
    const s: any = await prisma.restaurantSettings.findUnique({
      where: { id: 'settings' },
      select: { supportEmail: true, contactEmail: true },
    });
    if (s?.supportEmail) return s.supportEmail;
    if (s?.contactEmail) return s.contactEmail;
  } catch {
    /* ignore */
  }
  try {
    const admin = await prisma.adminUser.findFirst({ select: { email: true }, orderBy: { createdAt: 'asc' } });
    if (admin?.email) return admin.email;
  } catch {
    /* ignore */
  }
  return process.env.ALERT_EMAIL || null;
}

export async function runCapacityCheck(): Promise<void> {
  try {
    const cap = await getCapacityMetrics();
    const alerts = cap.alerts;
    const keys = new Set(alerts.map((a) => a.key));

    if (alerts.length > 0) {
      try {
        getIO()?.to('admin-room').emit('capacity:alert', { worst: cap.worst, alerts });
      } catch {
        /* socket kan saknas */
      }
    }

    const newKeys = [...keys].filter((k) => !lastAlertKeys.has(k));
    if (newKeys.length > 0 && Date.now() - lastEmailAt > SIX_HOURS) {
      const to = await alertRecipient();
      if (to) {
        const lines = alerts
          .map((a) => `• ${a.label}: ${a.value}${a.hint ? ' — ' + a.hint : ''}`)
          .join('\n');
        await sendEmail({
          to,
          subject: `⚠ Delívera kapacitet: ${cap.worst === 'critical' ? 'KRITISKT' : 'varning'}`,
          text: `Kapacitets-bevakningen flaggade något:\n\n${lines}\n\nÖppna admin → API-status för detaljer och historik.`,
        }).catch((e: any) => console.error('[capacityMonitor] mail error:', e?.message));
        lastEmailAt = Date.now();
        console.log(`[capacityMonitor] alert-mejl skickat till ${to} (${newKeys.join(', ')})`);
      }
    }

    lastAlertKeys = keys;
  } catch (e: any) {
    console.error('[capacityMonitor] error:', e?.message);
  }
}

export function startCapacityMonitor(): void {
  // Första kollen efter 2 min (låt servern stabilisera), sen var 30:e min.
  setTimeout(() => void runCapacityCheck(), 2 * 60 * 1000);
  setInterval(() => void runCapacityCheck(), 30 * 60 * 1000);
}
