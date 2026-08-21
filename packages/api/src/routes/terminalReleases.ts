import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { readApkInfo } from '../lib/apkInfo';
import { r2Enabled, uploadToR2, getFromR2, deleteFromR2 } from '../lib/r2';

// ── Uppdateringskanal för partner-terminalerna ──────────────────────────────
//
// Flödet, ett steg i taget:
//   1. Admin laddar upp en ny APK under Enheter  → den blir aktiv release.
//   2. Plattan frågar /terminal/app-update och ser att en nyare finns.
//   3. Personalen trycker Uppdatera → plattan hämtar en ENGÅNGSKOD.
//   4. Koden skrivs in på den dolda sidan på viaeats.se, som byter den mot en
//      kortlivad nedladdningstoken och hämtar APK:n genom API:t.
//
// APK:n ligger medvetet INTE på den publika R2-domänen. Utan kodsteget skulle
// vem som helst med URL:en kunna dra ner vår signerade partner-app.

const router = Router();

// Paketet vi accepterar. En APK med annat paketnamn kan aldrig uppgradera
// terminalerna — den skulle installeras som en separat app.
const PARTNER_PACKAGE = 'com.matgo.restaurant';
const FLAVORS = ['sunmi', 'universal'] as const;
type Flavor = (typeof FLAVORS)[number];

// Utan I/O/B/0/1/2 — koden läses av ur en plattas skärm och skrivs på en
// telefon, så förväxlingsbara tecken kostar supportärenden.
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXY3456789';
const DOWNLOAD_CODE_TTL_MIN = 30;
const DOWNLOAD_TOKEN_TTL_SEC = 15 * 60;

function newDownloadCode(): string {
  const pick = () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return Array.from({ length: 8 }, pick).join('');
}

const normalizeCode = (raw: unknown) =>
  String(raw ?? '').replace(/[\s-]+/g, '').toUpperCase();

const asFlavor = (raw: unknown): Flavor =>
  FLAVORS.includes(String(raw ?? '') as Flavor) ? (String(raw) as Flavor) : 'sunmi';

// ───────────────────────────────────────────────── admin: ladda upp release

const apkUpload = multer({
  storage: multer.memoryStorage(),
  // Partner-APK:n ligger runt 5 MB; 100 MB ger gott om luft utan att bjuda in
  // någon att pumpa minnet fullt.
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * POST /api/admin/terminal-releases
 * Laddar upp en ny partner-APK och gör den till aktiv release.
 */
router.post(
  '/terminal-releases',
  authenticate,
  requireSuperAdmin,
  apkUpload.single('apk'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!r2Enabled()) {
        return res.status(503).json({ error: 'R2 är inte konfigurerat på servern' });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: 'Ingen APK-fil bifogad' });
      }

      // Läs sanningen ur filen i stället för att lita på formuläret.
      let info;
      try {
        info = readApkInfo(file.buffer);
      } catch (e: any) {
        return res.status(400).json({ error: `Kunde inte läsa APK:n: ${e?.message || e}` });
      }

      if (info.packageName !== PARTNER_PACKAGE) {
        return res.status(400).json({
          error:
            `Fel app: APK:n har paketnamn "${info.packageName}" men terminalerna kör ` +
            `"${PARTNER_PACKAGE}". En APK med annat paketnamn kan inte uppdatera dem.`,
        });
      }

      const flavor = asFlavor(req.body?.flavor);
      const notes = String(req.body?.notes ?? '').trim().slice(0, 2000) || null;

      const existing = await (prisma as any).terminalAppRelease.findUnique({
        where: { flavor_versionCode: { flavor, versionCode: info.versionCode } },
      });
      if (existing) {
        return res.status(409).json({
          error:
            `Version ${info.versionCode} (${info.versionName}) är redan uppladdad. ` +
            `Höj versionCode i build.gradle.kts innan du bygger en ny APK — Android ` +
            `installerar aldrig samma versionCode igen.`,
        });
      }

      // Blockera en release som är ÄLDRE än den aktiva: plattorna skulle ändå
      // vägra installera den, och den aktiva releasen hade tystnat på kuppen.
      const active = await (prisma as any).terminalAppRelease.findFirst({
        where: { flavor, isActive: true },
        select: { versionCode: true, versionName: true },
      });
      if (active && info.versionCode < active.versionCode) {
        return res.status(409).json({
          error:
            `Den uppladdade APK:n (${info.versionCode}) är äldre än den aktiva ` +
            `releasen (${active.versionCode}). Terminalerna kan inte nedgraderas.`,
        });
      }

      const key = `terminal-releases/${flavor}/viaeats-partner-${info.versionCode}-${info.sha256.slice(0, 12)}.apk`;
      await uploadToR2(key, file.buffer, 'application/vnd.android.package-archive');

      // Exakt en aktiv release per flavor.
      const release = await prisma.$transaction(async (tx: any) => {
        await tx.terminalAppRelease.updateMany({
          where: { flavor, isActive: true },
          data: { isActive: false },
        });
        return tx.terminalAppRelease.create({
          data: {
            versionCode: info.versionCode,
            versionName: info.versionName,
            flavor,
            r2Key: key,
            sha256: info.sha256,
            sizeBytes: info.sizeBytes,
            notes,
            isActive: true,
            uploadedBy: req.admin?.email || req.admin?.id || null,
          },
        });
      });

      console.info('[terminal-releases] ny aktiv release', {
        flavor,
        versionCode: info.versionCode,
        versionName: info.versionName,
        by: req.admin?.email,
      });
      return res.status(201).json({ release });
    } catch (e: any) {
      console.error('[terminal-releases] upload misslyckades', e);
      return res.status(500).json({ error: e?.message || 'Uppladdningen misslyckades' });
    }
  },
);

/** GET /api/admin/terminal-releases — historik, nyast först. */
router.get('/terminal-releases', authenticate, requireSuperAdmin, async (_req: AuthRequest, res: Response) => {
  const releases = await (prisma as any).terminalAppRelease.findMany({
    orderBy: [{ flavor: 'asc' }, { versionCode: 'desc' }],
    take: 50,
  });
  return res.json({ releases });
});

/**
 * POST /api/admin/terminal-releases/:id/activate
 * Rullar tillbaka till en tidigare release om den nya visar sig trasig.
 */
router.post('/terminal-releases/:id/activate', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const target = await (prisma as any).terminalAppRelease.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Releasen finns inte' });

  await prisma.$transaction(async (tx: any) => {
    await tx.terminalAppRelease.updateMany({
      where: { flavor: target.flavor, isActive: true },
      data: { isActive: false },
    });
    await tx.terminalAppRelease.update({ where: { id: target.id }, data: { isActive: true } });
  });

  // Plattor som redan hunnit installera en HÖGRE versionCode kan inte gå
  // tillbaka utan ominstallation — säg det rakt ut i stället för att låta
  // admin tro att en rollback räcker.
  console.warn('[terminal-releases] rollback till äldre release', {
    flavor: target.flavor,
    versionCode: target.versionCode,
    by: req.admin?.email,
  });
  return res.json({
    release: { ...target, isActive: true },
    warning:
      'Terminaler som redan installerat en nyare version behåller den — Android ' +
      'tillåter ingen nedgradering. De måste avinstalleras och installeras om.',
  });
});

/** DELETE /api/admin/terminal-releases/:id — städa bort en felaktig uppladdning. */
router.delete('/terminal-releases/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const target = await (prisma as any).terminalAppRelease.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Releasen finns inte' });
  if (target.isActive) {
    return res.status(409).json({ error: 'Aktivera en annan release först — den aktiva kan inte tas bort.' });
  }
  await deleteFromR2(target.r2Key).catch(() => {});
  await (prisma as any).terminalAppRelease.delete({ where: { id: target.id } });
  return res.json({ success: true });
});

export default router;

// ─────────────────────────────────────────────── terminal + publik nedladdning
//
// Egen router så den kan monteras på /api/terminal respektive publikt utan att
// ärva admin-routerns middleware.

export const terminalUpdateRouter = Router();

/**
 * GET /api/terminal/app-update
 * Plattan skickar sin egen versionCode och får veta om något nyare finns.
 */
terminalUpdateRouter.get('/app-update', authenticate, async (req: AuthRequest, res: Response) => {
  const flavor = asFlavor(req.query.flavor);
  const installed = Number(req.query.versionCode) || 0;

  const latest = await (prisma as any).terminalAppRelease.findFirst({
    where: { flavor, isActive: true },
    select: { id: true, versionCode: true, versionName: true, notes: true, sizeBytes: true, sha256: true, createdAt: true },
  });
  if (!latest) return res.json({ updateAvailable: false, latest: null });

  return res.json({
    updateAvailable: latest.versionCode > installed,
    latest,
  });
});

/**
 * POST /api/terminal/download-code
 * Ger plattan en engångskod som personalen skriver in på nedladdningssidan.
 */
terminalUpdateRouter.post('/download-code', authenticate, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.admin?.restaurantId || null;
  const deviceId = req.admin?.deviceId || null;
  const flavor = asFlavor(req.body?.flavor);

  const latest = await (prisma as any).terminalAppRelease.findFirst({
    where: { flavor, isActive: true },
    select: { id: true, versionCode: true, versionName: true, sizeBytes: true },
  });
  if (!latest) return res.status(404).json({ error: 'Ingen release är publicerad än' });

  // Återanvänd en kod som fortfarande lever, så att upprepade tryck inte
  // fyller tabellen och personalen inte får en ny kod mitt i inskrivningen.
  const now = new Date();
  let record = deviceId
    ? await (prisma as any).terminalDownloadCode.findFirst({
        where: { deviceId, releaseId: latest.id, usedAt: null, expiresAt: { gt: new Date(now.getTime() + 60_000) } },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  if (!record) {
    record = await (prisma as any).terminalDownloadCode.create({
      data: {
        code: newDownloadCode(),
        deviceId,
        restaurantId,
        releaseId: latest.id,
        expiresAt: new Date(now.getTime() + DOWNLOAD_CODE_TTL_MIN * 60_000),
      },
    });
  }

  return res.json({
    code: record.code,
    expiresAt: record.expiresAt,
    validForSeconds: Math.max(0, Math.floor((record.expiresAt.getTime() - now.getTime()) / 1000)),
    version: { versionCode: latest.versionCode, versionName: latest.versionName, sizeBytes: latest.sizeBytes },
  });
});

export const terminalDownloadRouter = Router();

/**
 * POST /api/terminal-download/verify   { code }
 * Publik men kodskyddad. Byter engångskoden mot en kortlivad nedladdningstoken.
 */
terminalDownloadRouter.post('/verify', async (req: Request, res: Response) => {
  const code = normalizeCode(req.body?.code);
  if (code.length < 6) return res.status(400).json({ error: 'Ange koden från terminalen' });

  const record = await (prisma as any).terminalDownloadCode.findUnique({ where: { code } });
  const now = new Date();
  // Samma svar oavsett om koden är okänd, använd eller utgången — annars går
  // det att kartlägga giltiga koder genom att jämföra felmeddelanden.
  const reject = () => res.status(400).json({ error: 'Koden är ogiltig eller har gått ut.' });
  if (!record || record.usedAt || record.expiresAt <= now) return reject();

  const release = record.releaseId
    ? await (prisma as any).terminalAppRelease.findUnique({ where: { id: record.releaseId } })
    : await (prisma as any).terminalAppRelease.findFirst({ where: { flavor: 'sunmi', isActive: true } });
  if (!release) return reject();

  await (prisma as any).terminalDownloadCode.update({
    where: { id: record.id },
    data: { usedAt: now },
  });

  const token = jwt.sign(
    { kind: 'terminal-apk', releaseId: release.id },
    JWT_SECRET,
    { expiresIn: DOWNLOAD_TOKEN_TTL_SEC },
  );

  return res.json({
    token,
    version: {
      versionCode: release.versionCode,
      versionName: release.versionName,
      sizeBytes: release.sizeBytes,
      sha256: release.sha256,
      notes: release.notes,
    },
  });
});

/**
 * GET /api/terminal-download/file/:token
 * Streamar APK:n mot en giltig token.
 */
terminalDownloadRouter.get('/file/:token', async (req: Request, res: Response) => {
  let payload: any;
  try {
    payload = jwt.verify(String(req.params.token), JWT_SECRET);
  } catch {
    return res.status(401).send('Nedladdningslänken har gått ut. Hämta en ny kod i terminalen.');
  }
  if (payload?.kind !== 'terminal-apk' || !payload?.releaseId) {
    return res.status(401).send('Ogiltig nedladdningslänk.');
  }

  const release = await (prisma as any).terminalAppRelease.findUnique({ where: { id: payload.releaseId } });
  if (!release) return res.status(404).send('Releasen finns inte längre.');

  try {
    const body = await getFromR2(release.r2Key);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="viaeats-partner-${release.versionName}.apk"`,
    );
    res.setHeader('Content-Length', String(body.length));
    // Ingen mellanhand ska cacha en APK som kräver engångskod.
    res.setHeader('Cache-Control', 'no-store');
    return res.end(body);
  } catch (e: any) {
    console.error('[terminal-download] kunde inte hämta APK ur R2', e);
    return res.status(500).send('Kunde inte hämta filen just nu.');
  }
});
