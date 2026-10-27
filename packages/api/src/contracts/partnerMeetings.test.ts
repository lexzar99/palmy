import assert from 'node:assert/strict';
import {
  MEETING_START_TIMES,
  PartnerMeetingSchema,
  allowedModesForCity,
  blockedTimesForDate,
  buildMeetingDays,
  findMeetingSlot,
  isSkaneCity,
  meetingAlertText,
  meetingWindow,
  stockholmToUtc,
} from '../lib/partnerMeetings';

// Tisdag 27 okt 2026 kl. 10:00 svensk tid (vintertid, UTC+1).
const tuesday = new Date('2026-10-27T09:00:00Z');
const days = buildMeetingDays(tuesday);

// Fönstret: i morgon t.o.m. söndag nästa vecka → tor 29 okt … sön 8 nov.
const win = meetingWindow(tuesday);
assert.deepEqual(win.first, { year: 2026, month: 10, day: 28 });
assert.deepEqual(win.last, { year: 2026, month: 11, day: 8 });
assert.deepEqual(days.map((d) => d.date), [
  '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
  '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
]);

// Bara tor–mån.
for (const day of days) assert.ok([4, 5, 6, 7, 1].includes(day.weekday), `${day.date} är inte tor–mån`);

// Exakt sju starttider, 30 min långa, 45 min mellan starterna.
assert.deepEqual([...MEETING_START_TIMES], ['13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30']);
for (const day of days) {
  assert.deepEqual(day.slots.map((s) => s.label), [...MEETING_START_TIMES]);
  for (const s of day.slots) assert.equal(new Date(s.end).getTime() - new Date(s.start).getTime(), 30 * 60_000);
}
assert.equal(days[0].slots[0].start, '2026-10-29T12:00:00.000Z');
assert.equal(days[0].slots[0].id, 'meeting_20261029T1300');
assert.equal(days[0].dateLabel, '29 okt');
assert.equal(days[0].weekdayShort, 'tor');

// Sommartid hanteras: 13:00 i juni = 11:00 UTC.
assert.equal(stockholmToUtc({ year: 2026, month: 6, day: 4 }, 13, 0).toISOString(), '2026-06-04T11:00:00.000Z');

// Söndag: fönstret är måndag … söndag veckan efter (i morgon t.o.m. +7).
const sunday = new Date('2026-11-01T10:00:00Z');
assert.deepEqual(meetingWindow(sunday).first, { year: 2026, month: 11, day: 2 });
assert.deepEqual(meetingWindow(sunday).last, { year: 2026, month: 11, day: 8 });
// Sent på måndagkvällen svensk tid men redan tisdag i UTC+1? 23:30 mån = 22:30Z.
assert.deepEqual(meetingWindow(new Date('2026-11-02T22:30:00Z')).first, { year: 2026, month: 11, day: 3 });

// Blockeringen är stabil, aldrig hel dag, och ungefär hälften totalt.
let blocked = 0;
let total = 0;
const perDay: number[] = [];
for (let i = 0; i < 400; i += 1) {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  const key = d.toISOString().slice(0, 10);
  const a = blockedTimesForDate(key);
  const b = blockedTimesForDate(key);
  assert.deepEqual([...a], [...b], `blockeringen för ${key} är inte stabil`);
  assert.ok(a.size < MEETING_START_TIMES.length, `${key} är helt blockerad`);
  blocked += a.size;
  total += MEETING_START_TIMES.length;
  perDay.push(a.size);
}
const share = blocked / total;
assert.ok(share > 0.35 && share < 0.65, `andel blockerade ${share.toFixed(2)} ligger inte runt hälften`);
assert.ok(perDay.some((n) => n >= 5), 'någon dag ska vara nästan full');
assert.ok(perDay.some((n) => n <= 2), 'någon dag ska ha flera lediga');
// Samma pass ger samma svar mellan två anrop (två sidladdningar).
assert.deepEqual(
  buildMeetingDays(tuesday).map((d) => d.slots.map((s) => s.blocked)),
  buildMeetingDays(new Date('2026-10-27T15:00:00Z')).map((d) => d.slots.map((s) => s.blocked)),
);
for (const day of days) assert.ok(day.slots.some((s) => !s.blocked), `${day.date} saknar ledig tid`);

// Pass utanför fönstret eller med fel tid finns inte.
assert.equal(findMeetingSlot('2026-10-28T12:00:00.000Z', tuesday), null); // onsdag
assert.equal(findMeetingSlot('2026-11-09T12:00:00.000Z', tuesday), null); // måndag veckan efter
assert.equal(findMeetingSlot('2026-10-29T12:15:00.000Z', tuesday), null); // 13:15
assert.equal(findMeetingSlot('inte-ett-datum', tuesday), null);
assert.equal(findMeetingSlot('2026-10-29T12:45:00.000Z', tuesday)?.label, '13:45');

// Skåne får välja på plats, resten bara video.
for (const city of ['Lund', 'malmo', 'MALMÖ', 'Ängelholm', 'angelholm', 'Hässleholm', 'Burlöv', 'Arlöv', 'Åstorp', ' lund ', 'Lund, Skåne', 'Ängelholms kommun']) {
  assert.ok(isSkaneCity(city), `${city} ska räknas som Skåne`);
  assert.deepEqual(allowedModesForCity(city), ['onsite', 'video']);
}
for (const city of ['Stockholm', 'Umeå', 'umea', 'Göteborg', 'Växjö', '', 'Halmstad']) {
  assert.equal(isSkaneCity(city), false, `${city} ska inte räknas som Skåne`);
  assert.deepEqual(allowedModesForCity(city), ['video']);
  assert.equal(allowedModesForCity(city).includes('onsite'), false);
}

// Formuläret.
const input = {
  slotStart: '2026-10-29T12:45:00.000Z', mode: 'onsite', name: 'Test Person', email: 'TEST@Example.com',
  phone: '070-123 45 67', restaurant: 'Pattaya Bar & Restaurang', city: 'Stockholm',
};
const parsed = PartnerMeetingSchema.parse(input);
assert.equal(parsed.email, 'test@example.com');
assert.equal(PartnerMeetingSchema.safeParse({ ...input, mode: 'phone' }).success, false);
assert.equal(PartnerMeetingSchema.safeParse({ ...input, phone: '123' }).success, false);
assert.equal(PartnerMeetingSchema.safeParse({ ...input, role: 'SUPER_ADMIN' }).success, false);

// WhatsApp-texten börjar med NY BOKNING och bär det Jalle behöver.
const text = meetingAlertText({ ...input, email: parsed.email, mode: 'onsite' });
assert.equal(text.split('\n')[0], 'NY BOKNING tor 29 okt 13:45 · På plats');
assert.equal(text.split('\n')[1], 'Pattaya Bar & Restaurang, Stockholm');
assert.equal(text.split('\n')[2], 'Test Person · 070-123 45 67 · test@example.com');

console.log('partnerMeetings: ok');
