import { z } from 'zod';

/** Anonyma besök på /erbjudande. En rad per sidvisning, utan cookie, IP-adress eller kontaktuppgifter. */
export const OFFER_VISIT_ENGINE = 'offer_visit';

/** Stegen i den ordning sidan visar dem. */
export const OFFER_STAGES = [
  { id: 'start', label: 'Öppnade sidan' },
  { id: 'skroll', label: 'Började skrolla' },
  { id: 'kvitto', label: 'Kvittot börjar komma ut' },
  { id: 'formaner', label: 'Hela kvittot med förmånerna' },
  { id: 'jamforelse', label: 'Jämförelsen mot Lumit och foodora' },
  { id: 'anmal', label: 'Kortet Anmäl intresse' },
  { id: 'vidare', label: 'Gick vidare ner på sidan' },
  { id: 'astronaut', label: 'Astronauten' },
  { id: 'tillval', label: 'Tillvalen' },
  { id: 'hemsidor', label: 'Hemsidorna' },
  { id: 'pris', label: 'Prisjämförelsen' },
  { id: 'ingar', label: 'Det här får du' },
  { id: 'palmyra', label: 'Palmyras siffror' },
  { id: 'steg', label: 'Tre steg' },
  { id: 'fragor', label: 'Vanliga frågor' },
  { id: 'slut', label: 'Sidans slut' },
] as const;

export const OFFER_FORM_STEPS = ['Restaurang', 'Namn', 'Telefon', 'Stad', 'Skickad'] as const;

type StageId = (typeof OFFER_STAGES)[number]['id'];
const STAGE_IDS = OFFER_STAGES.map((stage) => stage.id) as [StageId, ...StageId[]];
const stageIndex = (id: unknown) => OFFER_STAGES.findIndex((stage) => stage.id === id);

export const OfferVisitSchema = z.object({
  id: z.string().regex(/^[a-f0-9-]{36}$/),
  stage: z.enum(STAGE_IDS),
  last: z.enum(STAGE_IDS),
  seconds: z.number().int().min(0).max(3600),
  form: z.number().int().min(0).max(OFFER_FORM_STEPS.length),
  device: z.enum(['mobil', 'dator']),
  source: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
  campaign: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/).optional(),
  /** Var i Meta annonsen visades (utm_medium), till exempel fb eller ig. */
  platform: z.string().regex(/^[a-zA-Z0-9_.-]{1,40}$/).optional(),
  /** Annonsens namn (utm_content). */
  ad: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/).optional(),
});

export type OfferVisit = z.infer<typeof OfferVisitSchema>;

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const PLATFORM_LABEL: Record<string, string> = { fb: 'Facebook', facebook: 'Facebook', ig: 'Instagram', instagram: 'Instagram', an: 'Audience Network', msg: 'Messenger', th: 'Threads' };
/** Metas kortnamn blir läsbara. Besök utan uppgift hamnar under ett eget namn i stället för att försvinna. */
export const offerPlatformLabel = (platform?: string) => (platform ? PLATFORM_LABEL[platform.toLowerCase()] ?? platform : 'Okänd');

/** Per grupp: hur många som kom, skrollade, öppnade formuläret och anmälde sig. */
function countBy(visits: OfferVisit[], key: (visit: OfferVisit) => string) {
  const groups = new Map<string, { name: string; visits: number; scrolled: number; opened: number; leads: number }>();
  for (const visit of visits) {
    const name = key(visit);
    const row = groups.get(name) ?? { name, visits: 0, scrolled: 0, opened: 0, leads: 0 };
    row.visits += 1;
    if (stageIndex(visit.stage) >= 1) row.scrolled += 1;
    if (visit.form >= 1) row.opened += 1;
    if (visit.form >= OFFER_FORM_STEPS.length) row.leads += 1;
    groups.set(name, row);
  }
  return [...groups.values()].sort((a, b) => b.visits - a.visits);
}

/** Räknar hur många som nådde varje steg och var de som inte anmälde sig befann sig när de lämnade. */
export function summarizeOfferVisits(visits: OfferVisit[]) {
  const total = visits.length;
  const seconds = visits.map((visit) => visit.seconds);
  const leads = visits.filter((visit) => visit.form >= OFFER_FORM_STEPS.length).length;
  const opened = visits.filter((visit) => visit.form >= 1).length;
  const scrolled = visits.filter((visit) => stageIndex(visit.stage) >= 1).length;
  const paid = visits.filter((visit) => visit.platform || visit.ad);
  return {
    visits: total,
    medianSeconds: median(seconds),
    averageSeconds: total ? Math.round(seconds.reduce((sum, value) => sum + value, 0) / total) : 0,
    leads,
    leadPercent: percent(leads, total),
    /** Det enkla svaret: gick direkt, skrollade bara, öppnade formuläret utan att skicka, anmälde sig. */
    outcome: [
      { label: 'Lämnade utan att skrolla', count: total - Math.max(scrolled, opened) },
      { label: 'Skrollade men öppnade aldrig formuläret', count: Math.max(scrolled, opened) - opened },
      { label: 'Öppnade formuläret men skickade inte', count: opened - leads },
      { label: 'Anmälde intresse', count: leads },
    ].map((row) => ({ ...row, percent: percent(row.count, total) })),
    stages: OFFER_STAGES.map((stage, index) => {
      const reached = visits.filter((visit) => stageIndex(visit.stage) >= index).length;
      const left = visits.filter((visit) => visit.last === stage.id && visit.form < OFFER_FORM_STEPS.length).length;
      return { ...stage, reached, reachedPercent: percent(reached, total), left, leftPercent: percent(left, total) };
    }),
    form: OFFER_FORM_STEPS.map((label, index) => {
      const reached = visits.filter((visit) => visit.form > index).length;
      return { label, reached, reachedPercent: percent(reached, total) };
    }),
    sources: countBy(visits, (visit) => visit.source),
    devices: countBy(visits, (visit) => visit.device),
    platforms: countBy(paid, (visit) => offerPlatformLabel(visit.platform)),
    ads: countBy(paid, (visit) => visit.ad ?? 'Okänd annons'),
    campaigns: countBy(visits.filter((visit) => visit.campaign), (visit) => visit.campaign as string),
  };
}
