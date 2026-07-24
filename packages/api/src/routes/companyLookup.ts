/**
 * Företagsuppslag — backend-proxy mot foretagsapi.se
 *
 * Nyckeln stannar server-side (kvoten är 500 uppslag/månad, så den får
 * aldrig ligga i webbläsaren där vem som helst kan bränna den).
 *
 * POST /api/admin/company-lookup  { orgNumber }  → ett företag
 * POST /api/admin/company-search  { query }      → namnförslag
 *
 * Svarsfälten hos leverantören är inte publikt dokumenterade, därför
 * normaliserar pick()/pickAddress() en bred uppsättning tänkbara nycklar
 * (svenska och engelska) till vår egen stabila form.
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

/** Plockar första ifyllda värdet bland tänkbara nyckelnamn. */
function pick(source: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/** Adressen kan ligga platt eller nästlad under address/postadress/besoksadress. */
function pickAddress(raw: Record<string, any>) {
  const nested =
    raw?.address ||
    raw?.postadress ||
    raw?.postAddress ||
    raw?.besoksadress ||
    raw?.visitingAddress ||
    {};
  const source = { ...raw, ...(typeof nested === 'object' && nested ? nested : {}) };

  return {
    street: pick(source, ['street', 'gatuadress', 'adress', 'addressLine1', 'utdelningsadress', 'deliveryAddress']),
    zip: pick(source, ['zip', 'postnummer', 'postalCode', 'postnr', 'zipCode']),
    city: pick(source, ['city', 'postort', 'ort', 'stad', 'town', 'postTown']),
  };
}

/**
 * Normaliserar leverantörens företagspost till vår form. Verksamhets-
 * beskrivningen (bio) hämtas medvetet INTE — vi vill bara ha det juridiska
 * och adressuppgifterna.
 */
function normalizeCompany(raw: Record<string, any>) {
  if (!raw || typeof raw !== 'object') return null;
  const address = pickAddress(raw);
  const orgNumber = pick(raw, ['orgNumber', 'organisationsnummer', 'organisationsNummer', 'orgnr', 'organizationNumber']);
  const name = pick(raw, ['name', 'namn', 'legalName', 'foretagsnamn', 'companyName', 'juridiskNamn']);

  if (!orgNumber && !name) return null;

  return {
    orgNumber: orgNumber ? formatOrgNumber(orgNumber) : null,
    legalName: name,
    street: address.street,
    zip: address.zip,
    city: address.city,
    status: pick(raw, ['status', 'foretagsstatus', 'companyStatus', 'avregistreringsdatum'] ),
    companyForm: pick(raw, ['companyForm', 'bolagsform', 'foretagsform', 'legalForm']),
    registeredAt: pick(raw, ['registrationDate', 'registreringsdatum', 'registeredAt']),
    vatRegistered: raw?.momsregistrerad ?? raw?.vatRegistered ?? null,
    fSkatt: raw?.fSkatt ?? raw?.fskatt ?? raw?.hasFTax ?? null,
  };
}

/** 10 siffror → NNNNNN-NNNN. Lämnar okända format orörda. */
function formatOrgNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  if (digits.length === 12) return `${digits.slice(2, 8)}-${digits.slice(8)}`;
  return value;
}

/** Leverantörens svar kan vara ett objekt, {data}, {company} eller en lista. */
function extractRecords(payload: any): Record<string, any>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of ['results', 'data', 'companies', 'foretag', 'items', 'hits']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return [value];
  }
  if (payload.company && typeof payload.company === 'object') return [payload.company];
  if (typeof payload === 'object') return [payload];
  return [];
}

async function callProvider(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}${path}`, {
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
  return response.json();
}

/** POST /api/admin/company-lookup — exakt uppslag på organisationsnummer. */
router.post('/company-lookup', authenticate, requireSuperAdmin, lookupLimiter, async (req: AuthRequest, res) => {
  const orgNumberRaw = String((req.body as { orgNumber?: string })?.orgNumber || '').trim();
  const digits = orgNumberRaw.replace(/\D/g, '');

  if (!API_KEY) {
    return res.status(503).json({ error: 'Företagsuppslag är inte konfigurerat (FORETAGSAPI_KEY saknas).' });
  }
  if (digits.length !== 10 && digits.length !== 12) {
    return res.status(400).json({ error: 'Ange ett organisationsnummer med 10 siffror.' });
  }

  try {
    const payload = await callProvider('/search-by-org-number', { orgNumber: formatOrgNumber(digits) });
    const company = extractRecords(payload).map(normalizeCompany).find(Boolean);
    if (!company) {
      return res.status(404).json({ error: 'Hittade inget företag med det organisationsnumret.' });
    }
    res.json(company);
  } catch (error: any) {
    console.error('[company-lookup] failed:', error?.message || error);
    const status = error?.status === 429 ? 429 : 502;
    res.status(status).json({
      error: status === 429 ? 'Månadskvoten för företagsuppslag är slut.' : 'Kunde inte hämta företagsuppgifter just nu.',
    });
  }
});

/** POST /api/admin/company-search — namnsökning, max 5 förslag. */
router.post('/company-search', authenticate, requireSuperAdmin, lookupLimiter, async (req: AuthRequest, res) => {
  const query = String((req.body as { query?: string })?.query || '').trim();

  if (!API_KEY) {
    return res.status(503).json({ error: 'Företagsuppslag är inte konfigurerat (FORETAGSAPI_KEY saknas).' });
  }
  if (query.length < 2) {
    return res.status(400).json({ error: 'Sök på minst två tecken.' });
  }

  try {
    const payload = await callProvider('/search', { q: query, limit: 5 });
    const companies = extractRecords(payload).map(normalizeCompany).filter(Boolean);
    res.json({ companies });
  } catch (error: any) {
    console.error('[company-search] failed:', error?.message || error);
    const status = error?.status === 429 ? 429 : 502;
    res.status(status).json({
      error: status === 429 ? 'Månadskvoten för företagsuppslag är slut.' : 'Kunde inte söka företag just nu.',
    });
  }
});

export default router;
