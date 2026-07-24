/**
 * Företagsuppslag — backend-proxy mot foretagsapi.se
 *
 * Nyckeln stannar server-side (kvoten är 500 uppslag/månad, så den får
 * aldrig ligga i webbläsaren där vem som helst kan bränna den).
 *
 * POST /api/admin/company-lookup  { orgNumber } → exakt träff
 * POST /api/admin/company-search  { query }     → upp till 5 namnträffar
 *
 * Båda går mot /v1/search. Parametern avgör sökläget:
 *   { org_number: "5567037485" }  → exakt uppslag (snake_case!)
 *   { q: "namn", limit: 5 }       → fuzzy namnsökning
 * Skickar man ett org.nummer som `q` matchas siffrorna mot bolagsnamn och
 * ger fel företag — därför är lägena separerade.
 *
 * Verifierat svarsschema (2026-07-24):
 *   { companies: [{ name, orgNumber, legalForm, registrationDate,
 *                   deregistrationDate, postalAddress: { street, city,
 *                   postalCode }, businessDescription, ... }] }
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireSuperAdmin, type AuthRequest } from '../middleware/auth';
import { trackApiCall } from '../lib/apiHealth';

const router = Router();

const BASE_URL = 'https://data.foretagsapi.se/v1';
const API_KEY = process.env.FORETAGSAPI_KEY || '';

// Kvoten är 500/månad — en snål limiter skyddar mot en slö-klickad knapp
// eller en trasig retry-loop som annars äter hela månadskvoten.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'För många företagsuppslag. Vänta en stund.' },
});

/** 10 siffror → NNNNNN-NNNN. Lämnar okända format orörda. */
function formatOrgNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  if (digits.length === 12) return `${digits.slice(2, 8)}-${digits.slice(8)}`;
  return String(value || '');
}

/** Leverantören skickar ort i VERSALER ("STOCKHOLM") — vi vill "Stockholm". */
function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/(^|[\s\-/])([a-zåäö])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Normaliserar en företagspost. Verksamhetsbeskrivningen (businessDescription)
 * hämtas medvetet INTE — vi vill bara ha juridik och adress.
 */
function normalizeCompany(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name);
  const orgNumber = text(raw.orgNumber);
  if (!name && !orgNumber) return null;

  const address = raw.postalAddress && typeof raw.postalAddress === 'object' ? raw.postalAddress : {};
  const deregisteredAt = text(raw.deregistrationDate);

  return {
    orgNumber: orgNumber ? formatOrgNumber(orgNumber) : null,
    legalName: name,
    street: text(address.street),
    zip: text(address.postalCode),
    city: titleCase(text(address.city)),
    companyForm: text(raw.legalForm),
    registeredAt: text(raw.registrationDate),
    // Avregistrerade bolag ska synas tydligt i admin — inte tyst väljas.
    deregisteredAt,
    active: !deregisteredAt,
  };
}

/** Anropar leverantörens /v1/search. Kastar med .status vid HTTP-fel. */
async function callSearch(body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  trackApiCall('foretagsapi').catch(() => {});

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`foretagsapi ${response.status}: ${text.slice(0, 200)}`);
    (error as any).status = response.status;
    throw error;
  }

  const payload = (await response.json()) as { companies?: unknown[] };
  return Array.isArray(payload?.companies) ? payload.companies.map(normalizeCompany).filter(Boolean) : [];
}

function failureResponse(res: any, error: any, context: string) {
  console.error(`[${context}] failed:`, error?.message || error);
  const quotaHit = error?.status === 429 || error?.status === 402;
  return res.status(quotaHit ? 429 : 502).json({
    error: quotaHit ? 'Månadskvoten för företagsuppslag är slut.' : 'Kunde inte hämta företagsuppgifter just nu.',
  });
}

/** POST /api/admin/company-lookup — exakt uppslag på organisationsnummer. */
router.post('/company-lookup', authenticate, requireSuperAdmin, lookupLimiter, async (req: AuthRequest, res) => {
  const digits = String((req.body as { orgNumber?: string })?.orgNumber || '').replace(/\D/g, '');

  if (!API_KEY) {
    return res.status(503).json({ error: 'Företagsuppslag är inte konfigurerat (FORETAGSAPI_KEY saknas).' });
  }
  if (digits.length !== 10 && digits.length !== 12) {
    return res.status(400).json({ error: 'Ange ett organisationsnummer med 10 siffror.' });
  }

  try {
    // Leverantören vill ha 10 siffror utan bindestreck i org_number.
    const companies = await callSearch({ org_number: digits.slice(-10) });
    const company = companies[0];
    if (!company) {
      return res.status(404).json({ error: 'Hittade inget företag med det organisationsnumret.' });
    }
    res.json(company);
  } catch (error: any) {
    return failureResponse(res, error, 'company-lookup');
  }
});

/** POST /api/admin/company-search — namnsökning, max 5 träffar. */
router.post('/company-search', authenticate, requireSuperAdmin, lookupLimiter, async (req: AuthRequest, res) => {
  const query = String((req.body as { query?: string })?.query || '').trim();

  if (!API_KEY) {
    return res.status(503).json({ error: 'Företagsuppslag är inte konfigurerat (FORETAGSAPI_KEY saknas).' });
  }
  if (query.length < 2) {
    return res.status(400).json({ error: 'Sök på minst två tecken.' });
  }
  try {
    // Ett rent sifferinmatat värde är ett org.nummer — kör exakt uppslag
    // istället för fuzzy namnmatchning (som annars ger fel bolag).
    const digits = query.replace(/\D/g, '');
    const isOrgNumber = /^[\d\s-]+$/.test(query) && (digits.length === 10 || digits.length === 12);
    const companies = isOrgNumber
      ? await callSearch({ org_number: digits.slice(-10) })
      : await callSearch({ q: query, limit: 5 });
    res.json({ companies });
  } catch (error: any) {
    return failureResponse(res, error, 'company-search');
  }
});

export default router;
