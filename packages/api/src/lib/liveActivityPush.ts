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
  orderType?: string | null;     // "DELIVERY" | "PICKUP" — drives 4-step vs 3-step UI
  etaEndsAt?: number | null;     // Unix epoch *seconds* when current step's countdown hits zero
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
  priority?: '5' | '10';   // 10 = immediate (default), 5 = throttle-friendly
}): Promise<void> {
  if (!isConfigured()) return;

  const event = opts.event ?? 'update';
  const now = Math.floor(Date.now() / 1000);
  const apsBody: Record<string, unknown> = {
    timestamp: now,
    event,
    'content-state': opts.state,
    // Default 8h stale window — covers the entire delivery flow in real
    // life and avoids iOS dimming the activity after one hour. Earlier
    // value (1h) caused the LA to look "stale" / stop refreshing visually
    // for users who left the app open during a slow restaurant night.
    'stale-date': now + (opts.staleAfterSeconds ?? 8 * 60 * 60),
  };
  // NOTE: do NOT include the `alert` field on routine LA updates — APNs
  // would deliver a banner + ding alongside the silent state update, which
  // is exactly the duplicate-notification bug the user reported. The
  // separate `sendApnsAlert` path (with apns-collapse-id) handles user-
  // visible notifications. We still allow it on `event: 'end'` so the
  // final state can deliver as a regular alert if a body was set.
  if (event === 'end' && (opts.alertTitle || opts.alertBody)) {
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
    priority: opts.priority ?? '10',
  });
}

/**
 * Raised by `sendApns` when APNs explicitly rejects the device/activity
 * token (token rotated, app uninstalled, wrong environment, etc). Callers
 * catch this to clear the stale token from the DB so future pushes don't
 * keep silently failing.
 */
export class ApnsError extends Error {
  public readonly status: number;
  public readonly reason: string;
  public readonly invalidToken: boolean;
  constructor(status: number, reason: string) {
    super(`APNs ${status}: ${reason}`);
    this.status = status;
    this.reason = reason;
    this.invalidToken =
      reason === 'BadDeviceToken' ||
      reason === 'Unregistered' ||
      reason === 'DeviceTokenNotForTopic' ||
      reason === 'ExpiredToken';
  }
}

function sendApns(opts: {
  token: string;
  topic: string;
  pushType: 'liveactivity' | 'alert';
  payload: string;
  priority: '10' | '5';
  collapseId?: string;
  // Seconds from now until the push expires. 0 = immediate-or-discard;
  // any positive value tells APNs to retry delivery up to that time.
  expirationSecondsFromNow?: number;
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

    // Default: retry for 1 hour. Earlier we used 0 (deliver-now-or-drop),
    // which silently dropped LA pushes whenever the device was briefly
    // off-network — exactly the "stuck on Mottagen" symptom users hit when
    // the order moved to På väg while the app was in the background.
    const expSeconds = opts.expirationSecondsFromNow ?? 60 * 60;
    const expiration = expSeconds > 0
      ? String(Math.floor(Date.now() / 1000) + expSeconds)
      : '0';

    const headers: Record<string, string> = {
      ':method': 'POST',
      ':path': `/3/device/${opts.token}`,
      'authorization': `bearer ${getJwt()}`,
      'apns-topic': opts.topic,
      'apns-push-type': opts.pushType,
      'apns-priority': opts.priority,
      'apns-expiration': expiration,
      'content-type': 'application/json',
    };
    if (opts.collapseId) {
      // iOS replaces any existing on-device notification with the same
      // collapse-id with this one, so the order status reads as a single
      // updating notification instead of stacking a new banner per step.
      headers['apns-collapse-id'] = opts.collapseId.slice(0, 64);
    }
    const req = client.request(headers);

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
        let reason = 'Unknown';
        try {
          const parsed = JSON.parse(errBody);
          if (parsed?.reason) reason = String(parsed.reason);
        } catch {}
        reject(new ApnsError(status, reason));
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

// Mirror of mobile_apps/REACT-MATGO/src/lib/liveActivities.ts STATUS_META.
//
// Both DELIVERY and PICKUP render as 3-step progress bars in the widget.
// `delivered` is no longer a visible step — the LA is dismissed on
// transition — but we still send progressStep=2 so any in-flight render
// before iOS yanks the activity stays on "På väg" / "Redo".
const STATUS_META: Record<string, { statusText: string; progressStep: number }> = {
  accepted:        { statusText: 'Restaurangen har accepterat din order', progressStep: 0 },
  preparing:       { statusText: 'Din mat tillagas just nu',              progressStep: 1 },
  ready_delivery:  { statusText: 'Maten är redo — väntar på bud',         progressStep: 1 },
  ready_pickup:    { statusText: 'Din mat är klar att hämtas! 🛍️',        progressStep: 2 },
  on_the_way:      { statusText: 'Din order är på väg!',                  progressStep: 2 },
  arrived:         { statusText: 'Föraren är framme!',                    progressStep: 2 },
  delivered:       { statusText: 'Levererad',                             progressStep: 2 },
  rejected:        { statusText: 'Beställningen avvisades av restaurangen', progressStep: 0 },
  cancelled:       { statusText: 'Ordern avbruten',                       progressStep: 0 },
  failed:          { statusText: 'Leveransen kunde inte slutföras',       progressStep: 0 },
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
    case 'REJECTED':       return { activityStatus: 'rejected',       ends: true };
    case 'CANCELLED':      return { activityStatus: 'cancelled',      ends: true };
    case 'DELIVERY_FAILED': return { activityStatus: 'failed',        ends: true };
    default:               return null;
  }
}

/**
 * Send a regular alert notification via APNs HTTP/2 directly.
 *
 * Unlike Expo Push (which doesn't expose `apns-collapse-id`), this uses the
 * device's raw APNs push token (hex) and tells iOS to *replace* any existing
 * notification with the same `collapseId` rather than append a new one.
 *
 * Use this for order status updates so the user sees one rolling banner
 * ("Mottagen" → "Tillagas" → "På väg"…) instead of a fresh notification
 * per step.
 */
export async function sendApnsAlert(opts: {
  token: string;            // raw hex APNs device token (NOT ExponentPushToken)
  title: string;
  body: string;
  collapseId?: string;      // e.g. `order-${orderId}` to replace prior pushes
  data?: Record<string, unknown>;
  threadId?: string;        // groups alerts in Notification Center
  sound?: string;
}): Promise<void> {
  if (!isConfigured()) return;

  // Alert push WITH `content-available: 1` so iOS briefly wakes the app to
  // run the JS background handler. That handler triggers `useOrderActivitySync`
  // which calls `Activity.update()` directly — a belt-and-braces fallback for
  // the dedicated LA push, in case iOS throttled it (e.g. user hasn't enabled
  // "Frequent Updates" in Settings → FoodGo → Live Activities).
  const aps: Record<string, unknown> = {
    alert: { title: opts.title, body: opts.body },
    sound: opts.sound ?? 'default',
    badge: 1,
    'content-available': 1,
    'mutable-content': 1,
    // Time-sensitive notifications bypass DND / Focus and get higher
    // priority background-wake scheduling on iOS 15+. That makes the
    // LA-sync background task fire reliably even when the device has been
    // idle for a while — without this iOS often parks silent wakes for
    // hours, leaving the Dynamic Island stuck on the previous step.
    'interruption-level': 'time-sensitive',
  };
  if (opts.threadId) aps['thread-id'] = opts.threadId;

  const payload = JSON.stringify({ aps, ...(opts.data ?? {}) });

  await sendApns({
    token: opts.token,
    topic: APNS_BUNDLE_ID!, // alert pushes use the bare bundle id
    pushType: 'alert',
    payload,
    priority: '10',
    collapseId: opts.collapseId,
  });
}

/**
 * Silent background wake push.
 *
 * No alert, no sound — just `content-available: 1` to let iOS briefly run
 * the app's JS in the background. We use this from the LA finaliser so the
 * mobile-side `Notifications.addNotificationReceivedListener` callback fires
 * and calls `Activity.update()` directly. That makes the LA auto-flip to
 * "Levererad" even when the user hasn't enabled "Frequent Updates" and iOS
 * is throttling the dedicated `liveactivity` push topic.
 */
export async function sendApnsSilentWake(opts: {
  token: string;
  data?: Record<string, unknown>;
  collapseId?: string;
}): Promise<void> {
  if (!isConfigured()) return;
  const aps = { 'content-available': 1 };
  const payload = JSON.stringify({ aps, ...(opts.data ?? {}) });
  await sendApns({
    token: opts.token,
    topic: APNS_BUNDLE_ID!,
    pushType: 'alert',
    // Silent pushes must use priority 5 — Apple penalises priority-10
    // content-available pushes (will discard them or block the device token).
    priority: '5',
    payload,
    collapseId: opts.collapseId,
    expirationSecondsFromNow: 30 * 60,
  });
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
  etaEndsAt?: Date | null;
  alertBody?: string;
}): Promise<void> {
  const mapped = mapServerStatusToActivity(opts.serverStatus, opts.orderType);
  if (!mapped) return;
  const meta = STATUS_META[mapped.activityStatus];
  if (!meta) return;

  // Same dismissal lifetime for delivered and cancelled — short window so
  // iOS removes the LA right away. Don't try to render a "Levererad" final
  // step inside the dismissal window: iOS' frequent-updates throttle drops
  // the late state change so the LA freezes on "På väg" instead.
  let dismissalDate: number | undefined;
  if (mapped.ends) {
    dismissalDate = Math.floor(Date.now() / 1000) + 8;
  }

  await pushLiveActivityUpdate({
    token: opts.token,
    event: mapped.ends ? 'end' : 'update',
    state: {
      status: mapped.activityStatus,
      statusText: meta.statusText,
      progressStep: meta.progressStep,
      etaMinutes: opts.etaMinutes ?? null,
      driverName: null,
      orderType: opts.orderType ?? null,
      etaEndsAt: opts.etaEndsAt ? Math.floor(opts.etaEndsAt.getTime() / 1000) : null,
    },
    alertTitle: 'FoodGo',
    alertBody: opts.alertBody ?? meta.statusText,
    dismissalDate,
  });
}
