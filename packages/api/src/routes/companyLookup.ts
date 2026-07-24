/**
 * Företagsuppslag — backend-proxy mot foretagsapi.se
 *
 * Nyckeln stannar server-side (kvoten är 500 uppslag/månad, så den får
 * aldrig ligga i webbläsaren där vem som helst kan bränna den).
 *
 * POST /api/admin/company-search  { query } → upp till 5 träffar
 *
 * OBS: leverantören har INGET uppslag på organisationsnummer — både
 * /v1/search och /v1/bulk söker på namn. Skickar man ett org.nummer
 * matchas det mot siffror i bolagsnamn och ger fel företag. Därför
 * exponerar vi bara namnsökning; org.numret kommer med i träffen.
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

/** POST /api/admin/company-search — namnsökning, max 5 träffar. */
router.post('/company-search', authenticate, requireSuperAdmin, lookupLimiter, async (req: AuthRequest, res) => {
  const query = String((req.body as { query?: string })?.query || '').trim();

  if (!API_KEY) {
    return res.status(503).json({ error: 'Företagsuppslag är inte konfigurerat (FORETAGSAPI_KEY saknas).' });
  }
  if (query.length < 2) {
    return res.status(400).json({ error: 'Sök på minst två tecken.' });
  }
  // Ett rent sifferinmatat org.nummer matchas mot siffror i bolagsnamn och
  // ger fel företag — bättre att säga till än att returnera skräp.
  if (/^[\d\s-]+$/.test(query)) {
    return res.status(400).json({ error: 'Sök på företagsnamn — org.numret hämtas automatiskt.' });
  }

  try {
    const response = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, limit: 5 }),
    });
    trackApiCall('foretagsapi').catch(() => {});

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[company-search] provider error:', response.status, body.slice(0, 200));
      const quotaHit = response.status === 429 || response.status === 402;
      return res.status(quotaHit ? 429 : 502).json({
        error: quotaHit
          ? 'Månadskvoten för företagsuppslag är slut.'
          : 'Kunde inte söka företag just nu.',
      });
    }

    const payload = (await response.json()) as { companies?: unknown[] };
    const companies = Array.isArray(payload?.companies)
      ? payload.companies.map(normalizeCompany).filter(Boolean)
      : [];
    res.json({ companies });
  } catch (error: any) {
    console.error('[company-search] failed:', error?.message || error);
    res.status(502).json({ error: 'Kunde inte söka företag just nu.' });
  }
});

export default router;
