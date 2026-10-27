import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { sendHermesAlert } from '../lib/hermesAlerts';
import { sendPartnerMeetingEmail } from '../lib/partnerMeetingEmail';
import {
  PARTNER_MEETING_ENGINE,
  PartnerMeetingSchema,
  allowedModesForCity,
  buildMeetingDays,
  findMeetingSlot,
  meetingAlertText,
  modeLabel,
  type MeetingMode,
} from '../lib/partnerMeetings';

/**
 * Publik mötesbokning för restaurangpartners. Monteras på /api/partner-meetings.
 * Adminlistan ligger i `partnerMeetingsAdminRouter` på /api/admin/partner-meetings.
 */
const router = Router();

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många bokningsförsök. Försök igen om en stund.' },
});

const TAKEN_MESSAGE = 'Tiden hann bokas av någon annan, välj en annan';

type MeetingMeta = {
  status: 'booked';
  mode: MeetingMode;
  slotStart: string;
  slotEnd: string;
  name: string;
  email: string;
  phone: string;
  restaurant: string;
  city: string;
};

async function bookedSlotIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await prisma.engineEvent.findMany({
    where: { engine: PARTNER_MEETING_ENGINE, id: { in: ids } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** GET /api/partner-meetings/slots — dagar och pass. Blockerade och bokade pass är bara "inte lediga". */
router.get('/slots', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const days = buildMeetingDays(new Date());
    const booked = await bookedSlotIds(days.flatMap((d) => d.slots.map((s) => s.id)));
    return res.json({
      timeZone: 'Europe/Stockholm',
      durationMinutes: 30,
      days: days.map((day) => ({
        date: day.date,
        weekday: day.weekday,
        weekdayShort: day.weekdayShort,
        dateLabel: day.dateLabel,
        // Varken id eller orsak skickas ut — klienten ska inte kunna skilja
        // en fejkad "Bokad" från en riktig.
        slots: day.slots.map((s) => ({
          start: s.start,
          end: s.end,
          label: s.label,
          available: !s.blocked && !booked.has(s.id),
        })),
      })),
    });
  } catch (error) {
    console.error('[partner-meetings/slots] error:', (error as Error)?.message ?? error);
    return res.status(503).json({ error: 'Kunde inte hämta lediga tider' });
  }
});

/** POST /api/partner-meetings — boka ett pass. */
router.post('/', bookingLimiter, async (req, res) => {
  const parsed = PartnerMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Kontrollera uppgifterna' });
  }
  const input = parsed.data;
  // Honungsfälla: svara som om allt gick bra, spara ingenting.
  if (input.website) return res.status(201).json({ ok: true });

  if (!allowedModesForCity(input.city).includes(input.mode)) {
    return res.status(400).json({ error: 'På plats går bara att boka för restauranger i Skåne. Välj videomöte.' });
  }

  const slot = findMeetingSlot(input.slotStart);
  if (!slot) return res.status(400).json({ error: 'Välj en tid i kalendern' });
  if (slot.blocked) return res.status(409).json({ error: TAKEN_MESSAGE });

  const meta: MeetingMeta = {
    status: 'booked',
    mode: input.mode,
    slotStart: slot.start,
    slotEnd: slot.end,
    name: input.name,
    email: input.email,
    phone: input.phone,
    restaurant: input.restaurant,
    city: input.city,
  };

  let createdAt: Date;
  try {
    // Id = passet. En samtidig bokning av samma pass krockar atomärt på PK.
    const row = await prisma.engineEvent.create({
      data: {
        id: slot.id,
        engine: PARTNER_MEETING_ENGINE,
        message: `${input.restaurant} (${input.city}) · ${modeLabel(input.mode)}`,
        meta,
      },
      select: { createdAt: true },
    });
    createdAt = row.createdAt;
  } catch (error) {
    if ((error as any)?.code === 'P2002') return res.status(409).json({ error: TAKEN_MESSAGE });
    console.error('[partner-meetings] kunde inte spara bokning:', (error as Error)?.message ?? error);
    return res.status(503).json({ error: 'Bokningen kunde inte sparas. Försök igen om en stund.' });
  }

  // Sidoeffekter efter sparad bokning. Ingen av dem får fälla bokningen.
  const [alert, emailed] = await Promise.all([
    sendHermesAlert({
      source: 'viaeats-partner-meetings',
      type: 'meeting:booked',
      severity: 'info',
      // Tidsstämpeln gör att en avbokad och ombokad tid ger en ny notis.
      dedupeKey: `viaeats:meeting:booked:${slot.id}:${createdAt.getTime()}`,
      text: meetingAlertText(meta),
      restaurantName: input.restaurant,
    }).catch((error) => {
      console.error('[partner-meetings] Hermes-notis misslyckades:', (error as Error)?.message ?? error);
      return null;
    }),
    sendPartnerMeetingEmail({ ...meta, to: input.email }),
  ]);

  return res.status(201).json({
    ok: true,
    booking: { start: slot.start, end: slot.end, mode: input.mode },
    emailed,
    notified: Boolean(alert),
  });
});

export default router;

// ── Admin ────────────────────────────────────────────────────────────────────

export const partnerMeetingsAdminRouter = Router();
partnerMeetingsAdminRouter.use(authenticate, requireSuperAdmin);

const PAST_DAYS = 7;

/** GET /api/admin/partner-meetings — kommande först (stigande), sedan senaste 7 dagarna (fallande). */
partnerMeetingsAdminRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const now = Date.now();
    const cutoff = now - PAST_DAYS * 24 * 60 * 60 * 1000;
    // Bokningar görs högst ~2 veckor i förväg; 60 dagars createdAt-fönster
    // täcker alla pass som kan ligga inom listans intervall.
    const rows = await prisma.engineEvent.findMany({
      where: { engine: PARTNER_MEETING_ENGINE, createdAt: { gte: new Date(now - 60 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const bookings = rows
      .map((row) => {
        const meta = (row.meta || {}) as Partial<MeetingMeta>;
        const start = meta.slotStart ? new Date(meta.slotStart).getTime() : NaN;
        return {
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          status: meta.status || 'booked',
          mode: meta.mode === 'onsite' ? 'onsite' : 'video',
          slotStart: meta.slotStart || null,
          slotEnd: meta.slotEnd || null,
          name: meta.name || '',
          email: meta.email || '',
          phone: meta.phone || '',
          restaurant: meta.restaurant || '',
          city: meta.city || '',
          isPast: Number.isFinite(start) ? start + 30 * 60_000 < now : false,
          _start: start,
        };
      })
      .filter((b) => Number.isFinite(b._start) && b._start >= cutoff);
    const upcoming = bookings.filter((b) => !b.isPast).sort((a, b) => a._start - b._start);
    const past = bookings.filter((b) => b.isPast).sort((a, b) => b._start - a._start);
    return res.json({
      bookings: [...upcoming, ...past].map(({ _start, ...b }) => b),
      upcomingCount: upcoming.length,
    });
  } catch (error) {
    console.error('[admin/partner-meetings] error:', (error as Error)?.message ?? error);
    return res.status(500).json({ error: 'Kunde inte hämta bokade möten' });
  }
});

/** DELETE /api/admin/partner-meetings/:id — avboka (raden tas bort, passet blir ledigt). */
partnerMeetingsAdminRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^meeting_\d{8}T\d{4}$/.test(id)) return res.status(400).json({ error: 'Ogiltigt boknings-id' });
  try {
    const result = await prisma.engineEvent.deleteMany({ where: { id, engine: PARTNER_MEETING_ENGINE } });
    if (!result.count) return res.status(404).json({ error: 'Bokningen finns inte' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[admin/partner-meetings] delete error:', (error as Error)?.message ?? error);
    return res.status(500).json({ error: 'Kunde inte avboka mötet' });
  }
});
