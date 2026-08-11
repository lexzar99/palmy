/**
 * Direkt Swish Handel-provider.
 *
 * Nya betalningar skapas med Payment Request API v2 (PUT). Status och
 * cancellation ligger enligt Swish fortfarande på v1 (GET/PATCH). All trafik
 * använder mTLS med företagets Swish-certifikat; callbacken är endast en
 * signal och sanningen hämtas alltid server-till-server från Swish.
 */
import axios, { type AxiosInstance } from 'axios';
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'crypto';
import QRCode from 'qrcode';
import { getPublicApiBaseUrl } from '../launchReadiness';
import {
  createSwishHttpsAgent,
  loadSwishTlsConfiguration,
  swishApiBaseUrl,
  swishPayeeAlias,
} from './swishTls';
import type {
  CreatePaymentArgs,
  CreatePaymentResult,
  PaymentProvider,
  RemotePaymentState,
  RemotePaymentStatus,
  RemoteRefundState,
  RemoteRefundStatus,
} from './types';

type SwishPayment = {
  id?: unknown;
  paymentReference?: unknown;
  payeeAlias?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  errorCode?: unknown;
};

type SwishRefund = {
  id?: unknown;
  paymentReference?: unknown;
  originalPaymentReference?: unknown;
  amount?: unknown;
  status?: unknown;
  dateCreated?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
};

let cachedClient: AxiosInstance | null = null;

function client(): AxiosInstance {
  if (cachedClient) return cachedClient;
  const tls = loadSwishTlsConfiguration();
  const httpsAgent = createSwishHttpsAgent(tls);
  cachedClient = axios.create({
    baseURL: swishApiBaseUrl(),
    httpsAgent,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
    // Certifikatet ska bara användas mot exakt vald Swish-origin.
    maxRedirects: 0,
  });
  return cachedClient;
}

export { mergeSwishClientCertificate } from './swishTls';

/** Swish v2 kräver exakt 32 versala hextecken, utan UUID-bindestreck. */
export function swishInstructionId(idempotencyKey: string): string {
  return createHash('sha256').update(`viaeats-swish-v2\0${idempotencyKey}`).digest('hex').slice(0, 32).toUpperCase();
}

export function swishCallbackIdentifier(paymentRef: string): string {
  const secret = process.env.SWISH_CALLBACK_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('SWISH_CALLBACK_SECRET måste vara minst 32 tecken i produktion');
  }
  return createHmac('sha256', secret || 'viaeats-local-swish-callback')
    .update(paymentRef)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
}

export function validSwishCallbackIdentifier(paymentRef: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const expected = swishCallbackIdentifier(paymentRef);
  const supplied = received.trim().toUpperCase();
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

/**
 * Refund-instruktioner har samma format som betalningar (32 versala hextecken)
 * och härleds deterministiskt ur refund-ledgerns idempotency-nyckel. Därför är
 * refund-referensen känd INNAN anropet: tappas svaret kan samma refund läsas
 * tillbaka i stället för att en andra utbetalning skapas.
 */
export function swishRefundInstructionId(idempotencyKey: string): string {
  return createHash('sha256')
    .update(`viaeats-swish-refund-v2\0${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
}

function mapRefundStatus(value: unknown): RemoteRefundState {
  switch (String(value || '').toUpperCase()) {
    case 'PAID': return 'refunded';
    case 'ERROR': return 'failed';
    case 'CREATED': return 'queued';
    case 'INITIATED': return 'pending';
    case 'VALIDATED':
    case 'DEBITED': return 'processing';
    default: return 'unknown';
  }
}

function refundCallbackUrl(): string {
  const explicit = String(process.env.SWISH_REFUND_CALLBACK_URL || '').trim();
  if (explicit) return validateSwishCallbackUrl(explicit, 'SWISH_REFUND_CALLBACK_URL');
  const base = getPublicApiBaseUrl();
  if (!base || !/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/.test(base)) {
    throw new Error('Publik https-bas-URL krävs för Swish refund-callback');
  }
  return validateSwishCallbackUrl(
    `${base.replace(/\/$/, '')}/api/payments/webhooks/swish-refund`,
    'Swish refund-callback',
  );
}

function mapStatus(value: unknown): RemotePaymentState {
  switch (String(value || '').toUpperCase()) {
    case 'PAID': return 'paid';
    case 'DECLINED': return 'failed';
    case 'CANCELLED': return 'canceled';
    case 'ERROR': return 'failed';
    default: return 'pending';
  }
}

function exactOre(value: unknown): number {
  const text = String(value ?? '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Swish returnerade ett ogiltigt belopp');
  const [whole, fraction = ''] = text.split('.');
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(ore) || ore < 0) throw new Error('Swish returnerade ett icke-exakt belopp');
  return ore;
}

function assertSwishPaymentIdentity(payment: SwishPayment): void {
  if (String(payment.currency || '').toUpperCase() !== 'SEK') {
    throw new Error('Swish-betalningen har oväntad valuta');
  }
  const returnedPayee = String(payment.payeeAlias || '').replace(/\D/g, '');
  if (!returnedPayee || returnedPayee !== swishPayeeAlias()) {
    throw new Error('Swish-betalningen tillhör ett annat betalnummer');
  }
}

function callbackUrl(webhookUrl?: string): string {
  const url = webhookUrl || process.env.SWISH_CALLBACK_URL;
  return validateSwishCallbackUrl(url, 'SWISH_CALLBACK_URL');
}

export function validateSwishCallbackUrl(value: unknown, name = 'Swish callbackUrl'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Publik ${name} med HTTPS på port 443 krävs`);
  }
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password ||
      url.hash ||
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    ) {
      throw new Error('invalid');
    }
    return url.toString();
  } catch {
    throw new Error(`Publik ${name} med HTTPS på port 443 krävs`);
  }
}

/** Swish Commerce-QR är bokstaven D följd av PaymentRequestToken. */
export function swishCommerceQrPayload(token: string): string {
  const normalized = token.trim();
  if (!normalized || normalized.length > 512 || /[\s\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error('Swish returnerade en ogiltig M-commerce-token');
  }
  return `D${normalized}`;
}

/**
 * En browser avkodar URL-parametrar en gång när custom-schemat öppnas. Swish
 * kräver därför att callbackurl är dubbelkodad i browserns app-switch-länk.
 */
export function swishPaymentRequestUrl(token: string, returnUrl: string): string {
  const normalized = swishCommerceQrPayload(token).slice(1);
  const encodedCallbackUrl = encodeURIComponent(encodeURIComponent(returnUrl));
  return `swish://paymentrequest?token=${encodeURIComponent(normalized)}&callbackurl=${encodedCallbackUrl}`;
}

async function fetchRefund(instructionId: string): Promise<SwishRefund | null> {
  const response = await client().get<SwishRefund>(
    `/swish-cpcapi/api/v1/refunds/${instructionId}`,
    { validateStatus: (status) => status === 200 || status === 404 },
  );
  return response.status === 200 ? response.data : null;
}

/**
 * Swish saknar "lista refunds för en betalning". Refund-ledgern är därför
 * källan till VILKA refund-instruktioner som finns och Swish till deras
 * status. Rader vars PSP-svar tappades saknar refundRef, men instruktions-ID:t
 * kan räknas fram ur idempotency-nyckeln — så även de hittas tillbaka.
 */
async function knownRefundInstructionIds(paymentRef: string): Promise<string[]> {
  // MSS-skriptet kör provider:n helt utan databas; i drift finns DATABASE_URL alltid.
  if (!process.env.DATABASE_URL) return [];
  const { default: prisma } = await import('../prisma');
  const rows = await prisma.paymentRefund.findMany({
    where: { provider: 'swish', paymentRef },
    select: { refundRef: true, idempotencyKey: true },
  });
  const ids = rows.map((row: { refundRef: string | null; idempotencyKey: string }) =>
    (row.refundRef || '').trim() || swishRefundInstructionId(row.idempotencyKey));
  return [...new Set(ids.filter(Boolean))];
}

async function collectSwishRefunds(paymentRef: string): Promise<{
  amountRefundedOre: number;
  refunds: RemoteRefundStatus[];
}> {
  const refunds: RemoteRefundStatus[] = [];
  for (const instructionId of await knownRefundInstructionIds(paymentRef)) {
    const remote = await fetchRefund(instructionId);
    // 404 = PUT:en nådde aldrig Swish. Ingen pengarörelse finns att bokföra,
    // och refundWorkflow får då retry:a på samma idempotency-nyckel.
    if (!remote) continue;
    const state = mapRefundStatus(remote.status);
    if (state === 'unknown') {
      throw new Error(`Swish returnerade en okänd refundstatus för ${instructionId}`);
    }
    refunds.push({
      refundRef: instructionId,
      state,
      amountOre: exactOre(remote.amount),
      createdAt: remote.dateCreated ? String(remote.dateCreated) : null,
    });
  }
  const amountRefundedOre = refunds
    .filter((refund) => refund.state === 'refunded')
    .reduce((sum, refund) => sum + refund.amountOre, 0);
  return { amountRefundedOre, refunds };
}

/** Läs en enskild refund — används av refund-callbacken som sanningskälla. */
export async function getSwishRefundStatus(instructionId: string): Promise<RemoteRefundStatus | null> {
  const remote = await fetchRefund(instructionId);
  if (!remote) return null;
  const state = mapRefundStatus(remote.status);
  if (state === 'unknown') {
    throw new Error(`Swish returnerade en okänd refundstatus för ${instructionId}`);
  }
  return {
    refundRef: instructionId,
    state,
    amountOre: exactOre(remote.amount),
    createdAt: remote.dateCreated ? String(remote.dateCreated) : null,
  };
}

export const swishProvider: PaymentProvider = {
  name: 'swish',

  async createPayment({ order, returnUrl, webhookUrl, idempotencyKey, paymentReference }: CreatePaymentArgs): Promise<CreatePaymentResult> {
    const paymentRef = paymentReference || swishInstructionId(idempotencyKey);
    if (!/^[0-9A-F]{32}$/.test(paymentRef)) {
      throw new Error('Swish paymentReference måste vara 32 versala hextecken');
    }
    const response = await client().put(
      `/swish-cpcapi/api/v2/paymentrequests/${paymentRef}`,
      {
        payeePaymentReference: order.orderNumber.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 35),
        callbackUrl: callbackUrl(webhookUrl),
        payeeAlias: swishPayeeAlias(),
        amount: (order.total / 100).toFixed(2),
        currency: 'SEK',
        message: `ViaEats ${order.orderNumber}`.slice(0, 50),
        callbackIdentifier: swishCallbackIdentifier(paymentRef),
      },
      { validateStatus: (status) => status === 201 },
    );
    const token = String(response.headers.paymentrequesttoken || '').trim();
    if (!token) throw new Error('Swish skapade betalningen men returnerade ingen M-commerce-token');
    const swishUrl = swishPaymentRequestUrl(token, returnUrl);
    const swishQrCode = await QRCode.toDataURL(swishCommerceQrPayload(token), {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return { paymentRef, swishToken: token, swishUrl, swishQrCode };
  },

  async getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus> {
    const response = await client().get<SwishPayment>(
      `/swish-cpcapi/api/v1/paymentrequests/${paymentRef}`,
    );
    assertSwishPaymentIdentity(response.data);
    const state = mapStatus(response.data.status);
    // Refunds finns bara på en betald betalning; hoppa över rundturen annars.
    const refundAudit = state === 'paid'
      ? await collectSwishRefunds(paymentRef)
      : { amountRefundedOre: 0, refunds: [] as RemoteRefundStatus[] };
    return {
      state,
      amountReceivedOre: state === 'paid' ? exactOre(response.data.amount) : undefined,
      amountRefundedOre: refundAudit.amountRefundedOre,
      refunds: refundAudit.refunds,
      method: 'swish',
    };
  },

  async cancelPayment(paymentRef: string): Promise<RemotePaymentStatus> {
    const response = await client().patch<SwishPayment>(
      `/swish-cpcapi/api/v1/paymentrequests/${paymentRef}`,
      [{ op: 'replace', path: '/status', value: 'cancelled' }],
      { headers: { 'Content-Type': 'application/json-patch+json' } },
    );
    const state = mapStatus(response.data.status);
    if (state === 'paid') assertSwishPaymentIdentity(response.data);
    return {
      state,
      amountReceivedOre: state === 'paid' ? exactOre(response.data.amount) : undefined,
      method: 'swish',
    };
  },

  async refund(paymentRef: string, amountOre?: number, idempotencyKey?: string) {
    if (!idempotencyKey) throw new Error('Swish-refund kräver en idempotency-nyckel');
    const refundRef = swishRefundInstructionId(idempotencyKey);

    // originalPaymentReference är Swish EGEN referens på den betalda
    // betalningen — inte vårt instruktions-ID. Fel fält här ger RF02/RP03.
    const payment = await client().get<SwishPayment>(
      `/swish-cpcapi/api/v1/paymentrequests/${paymentRef}`,
    );
    assertSwishPaymentIdentity(payment.data);
    if (mapStatus(payment.data.status) !== 'paid') {
      throw new Error('Swish-betalningen är inte betald och kan inte återbetalas');
    }
    const originalPaymentReference = String(payment.data.paymentReference || '').trim();
    if (!originalPaymentReference) {
      throw new Error('Swish saknar paymentReference för betalningen');
    }
    const paidOre = exactOre(payment.data.amount);
    const refundOre = amountOre ?? paidOre;
    // Swish Handel accepterar minst 1,00 SEK per återbetalning.
    if (!Number.isInteger(refundOre) || refundOre < 100 || refundOre > paidOre) {
      throw new Error('Ogiltigt Swish-refundbelopp');
    }

    const response = await client().put(
      `/swish-cpcapi/api/v2/refunds/${refundRef}`,
      {
        originalPaymentReference,
        callbackUrl: refundCallbackUrl(),
        payerAlias: swishPayeeAlias(),
        amount: (refundOre / 100).toFixed(2),
        currency: 'SEK',
        message: 'ViaEats retur',
        callbackIdentifier: swishCallbackIdentifier(refundRef),
      },
      { validateStatus: (status) => status === 201 || status === 409 || status === 422 },
    );
    if (response.status === 201) return { refundRef, status: 'queued' as const };

    // Instruktions-ID:t är redan använt → det är SAMMA refund. Läs tillbaka
    // den i stället för att skapa en andra utbetalning.
    const existing = await fetchRefund(refundRef);
    if (existing) return { refundRef, status: mapRefundStatus(existing.status) };
    throw new Error(
      `Swish avvisade återbetalningen: ${JSON.stringify(response.data).slice(0, 300)}`,
    );
  },
};
