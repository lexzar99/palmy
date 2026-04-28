/**
 * APNs push-to-update for iOS Live Activities.
 *
 * Sends `liveactivity` push notifications directly to Apple's HTTP/2 APNs
 * endpoint so the Dynamic Island state changes even when the FoodGo app is in
 * the background or killed.
 *
 * Required env vars (production-grade JWT-based APNs auth):
 *   APNS_KEY_ID        — 10-char Key ID from Apple Developer
 *   APNS_TEAM_ID       — 10-char Team ID
 *   APNS_BUNDLE_ID     — main app bundle, e.g. "com.foodgo.app"
 *   APNS_KEY_P8        — full contents of the .p8 key file (BEGIN/END headers
 *                        included, newlines preserved as `\n` if stored as
 *                        single-line env var)
 *   APNS_PRODUCTION    — "1" for production APNs, anything else for sandbox
 *
 * If credentials are missing the helper logs a single warning and becomes a
 * no-op, so the rest of the app keeps working.
 */

import http2 from 'node:http2';
import crypto from 'node:crypto';

const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const APNS_KEY_P8 = (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n');
const APNS_HOST = process.env.APNS_PRODUCTION === '1'
  ? 'https://api.push.apple.com'
  : 'https://api.sandbox.push.apple.com';

let warnedMissing = false;
function isConfigured(): boolean {
  if (APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && APNS_KEY_P8) return true;
  if (!warnedMissing) {
    console.warn(
      '[liveActivityPush] APNs not configured — set APNS_KEY_ID, APNS_TEAM_ID, ' +
      'APNS_BUNDLE_ID and APNS_KEY_P8 to enable push-to-update Live Activities.'
    );
    warnedMissing = true;
  }
  return false;
}

// APNs JWT — valid for up to 1h. We cache and refresh just before expiry to
// avoid spending CPU on every push.
let cachedJwt: { token: string; iat: number } | null = null;
function getJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token;

  const header = { alg: 'ES256', kid: APNS_KEY_ID, typ: 'JWT' };
  const payload = { iss: APNS_TEAM_ID, iat: now };
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer
    .sign({ key: APNS_KEY_P8, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  const token = `${signingInput}.${sig}`;
  cachedJwt = { token, iat: now };
  return token;
}

export interface LiveActivityState {
  status: string;
  statusText: string;
  progressStep: number;
  etaMinutes?: number | null;
  driverName?: string | null;
}

/**
 * Push a state update into a running Live Activity. `event` is "update" for
 * normal status changes and "end" to dismiss the activity.
 */
export async function pushLiveActivityUpdate(opts: {
  token: string;
  state: LiveActivityState;
  event?: 'update' | 'end';
  alertTitle?: string;
  alertBody?: string;
  staleAfterSeconds?: number;
  dismissalDate?: number; // epoch seconds, only for `event: 'end'`
}): Promise<void> {
  if (!isConfigured()) return;

  const event = opts.event ?? 'update';
  const now = Math.floor(Date.now() / 1000);
  const apsBody: Record<string, unknown> = {
    timestamp: now,
    event,
    'content-state': opts.state,
    'stale-date': now + (opts.staleAfterSeconds ?? 60 * 60),
  };
  if (opts.alertTitle || opts.alertBody) {
    apsBody.alert = {
      title: opts.alertTitle ?? 'FoodGo',
      body: opts.alertBody ?? '',
    };
  }
  if (event === 'end' && opts.dismissalDate) {
    apsBody['dismissal-date'] = opts.dismissalDate;
  }

  const body = JSON.stringify({ aps: apsBody });

  await sendApns({
    token: opts.token,
    topic: `${APNS_BUNDLE_ID}.push-type.liveactivity`,
    pushType: 'liveactivity',
    payload: body,
    priority: '10',
  });
}

function sendApns(opts: {
  token: string;
  topic: string;
  pushType: 'liveactivity' | 'alert';
  payload: string;
  priority: '10' | '5';
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let client: http2.ClientHttp2Session | null = null;
    try {
      client = http2.connect(APNS_HOST);
    } catch (e) {
      return reject(e);
    }

    const cleanup = () => {
      try { client?.close(); } catch {}
    };

    client.on('error', (err) => {
      cleanup();
      reject(err);
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${opts.token}`,
      'authorization': `bearer ${getJwt()}`,
      'apns-topic': opts.topic,
      'apns-push-type': opts.pushType,
      'apns-priority': opts.priority,
      'apns-expiration': '0',
      'content-type': 'application/json',
    });

    let status = 0;
    let bodyChunks: Buffer[] = [];
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => bodyChunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      cleanup();
      if (status >= 200 && status < 300) {
        resolve();
      } else {
        const errBody = Buffer.concat(bodyChunks).toString('utf8');
        console.warn(`[liveActivityPush] APNs ${status}: ${errBody}`);
        reject(new Error(`APNs status ${status}: ${errBody}`));
      }
    });
    req.on('error', (err) => {
      cleanup();
      reject(err);
    });

    req.setEncoding('utf8');
    req.write(opts.payload);
    req.end();
  });
}

// Mirror of mobile_apps/REACT-MATGO/src/lib/liveActivities.ts STATUS_META so
// the Dynamic Island shows the same Swedish strings/progress whether the app
// updates in foreground or APNs pushes the update in background.
const STATUS_META: Record<string, { statusText: string; progressStep: number }> = {
  accepted:        { statusText: 'Restaurangen har accepterat din order', progressStep: 0 },
  preparing:       { statusText: 'Din mat förbereds just nu',             progressStep: 1 },
  ready_delivery:  { statusText: 'Maten är redo — väntar på bud',         progressStep: 1 },
  ready_pickup:    { statusText: 'Din mat är klar att hämtas! 🛍️',        progressStep: 4 },
  on_the_way:      { statusText: 'Din order är på väg!',                  progressStep: 2 },
  arrived:         { statusText: 'Föraren är framme!',                    progressStep: 3 },
  delivered:       { statusText: 'Levererad — smaklig måltid! 🎉',        progressStep: 4 },
  cancelled:       { statusText: 'Ordern avbruten',                       progressStep: 0 },
};

export function mapServerStatusToActivity(
  serverStatus: string,
  orderType: string | null | undefined
): { activityStatus: string; ends: boolean } | null {
  const isPickup = orderType === 'PICKUP';
  switch (serverStatus) {
    case 'PENDING':
    case 'ACCEPTED':       return { activityStatus: 'accepted',       ends: false };
    case 'PREPARING':      return { activityStatus: 'preparing',      ends: false };
    case 'READY':          return { activityStatus: isPickup ? 'ready_pickup' : 'ready_delivery', ends: false };
    case 'DELIVERING':
    case 'OUT_FOR_DELIVERY': return { activityStatus: 'on_the_way',   ends: false };
    case 'DELIVERED':
    case 'COMPLETED':      return { activityStatus: 'delivered',      ends: true };
    case 'REJECTED':
    case 'CANCELLED':
    case 'DELIVERY_FAILED': return { activityStatus: 'cancelled',     ends: true };
    default:               return null;
  }
}

/**
 * Convenience wrapper used by the admin status-change route. Looks up the
 * stored push token for the order and dispatches the right APNs payload.
 */
export async function pushOrderStatusUpdate(opts: {
  token: string;
  serverStatus: string;
  orderType: string | null | undefined;
  etaMinutes?: number | null;
  alertBody?: string;
}): Promise<void> {
  const mapped = mapServerStatusToActivity(opts.serverStatus, opts.orderType);
  if (!mapped) return;
  const meta = STATUS_META[mapped.activityStatus];
  if (!meta) return;

  await pushLiveActivityUpdate({
    token: opts.token,
    event: mapped.ends ? 'end' : 'update',
    state: {
      status: mapped.activityStatus,
      statusText: meta.statusText,
      progressStep: meta.progressStep,
      etaMinutes: opts.etaMinutes ?? null,
      driverName: null,
    },
    alertTitle: 'FoodGo',
    alertBody: opts.alertBody ?? meta.statusText,
    dismissalDate: mapped.ends
      ? Math.floor(Date.now() / 1000) + 8
      : undefined,
  });
}
