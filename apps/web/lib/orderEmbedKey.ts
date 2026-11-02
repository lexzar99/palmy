/**
 * Orderns egen nyckel i partner-iframen.
 *
 * Safari skickar inga cookies från en cross-site iframe, så kunden behöver ett
 * annat bevis för sin order. Nyckeln ligger i iframens localStorage på viaeats-
 * origin: den överlever omladdning, stängd flik och betalreturer, och
 * partnersidans JavaScript kan inte läsa den. Därför används inte partnerns
 * adressfält eller partnerns lagring. Sparas inget går sidan över till
 * begränsad spårning, som aldrig visar kunduppgifter.
 */
const ORDER_EMBED_KEY_PREFIX = "viaeats_order_key_v1:";
const ORDER_EMBED_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Privat läge kan blockera lagring; då räcker minneskopian så länge sidan lever.
const volatileKeys = new Map<string, string>();

function removeExpiredKeys(now: number) {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const name = window.localStorage.key(index);
    if (!name?.startsWith(ORDER_EMBED_KEY_PREFIX)) continue;
    let expiresAt = 0;
    try {
      expiresAt = Number(JSON.parse(window.localStorage.getItem(name) || "{}").expiresAt) || 0;
    } catch {
      expiresAt = 0;
    }
    if (expiresAt <= now) window.localStorage.removeItem(name);
  }
}

export function rememberOrderEmbedKey(orderId: string, key: string): void {
  if (typeof window === "undefined" || !ORDER_ID_PATTERN.test(orderId) || !key) return;
  volatileKeys.set(orderId, key);
  try {
    const now = Date.now();
    removeExpiredKeys(now);
    window.localStorage.setItem(
      ORDER_EMBED_KEY_PREFIX + orderId,
      JSON.stringify({ key, expiresAt: now + ORDER_EMBED_KEY_MAX_AGE_MS }),
    );
  } catch {
    // Minneskopian ovan gäller.
  }
}

export function readOrderEmbedKey(orderId: string): string | null {
  if (typeof window === "undefined" || !ORDER_ID_PATTERN.test(orderId)) return null;
  try {
    const raw = window.localStorage.getItem(ORDER_EMBED_KEY_PREFIX + orderId);
    if (raw) {
      const stored = JSON.parse(raw) as { key?: unknown; expiresAt?: unknown };
      if (typeof stored.key === "string" && Number(stored.expiresAt) > Date.now()) return stored.key;
      window.localStorage.removeItem(ORDER_EMBED_KEY_PREFIX + orderId);
    }
  } catch {
    // Blockerad eller skadad lagring får inte stoppa spårningen.
  }
  return volatileKeys.get(orderId) || null;
}

/** Samma orderkoppling som proxyn använder när den väljer ordercookie. */
export function orderIdFromPlatformRequest(url: string, data: unknown): string | null {
  const fromPath = url.match(/^\/api\/platform\/(?:orders|payments\/status)\/([A-Za-z0-9_-]{1,64})(?:[/?]|$)/);
  if (fromPath) return fromPath[1];
  const fromBody = (data as { orderId?: unknown } | null | undefined)?.orderId;
  return typeof fromBody === "string" && ORDER_ID_PATTERN.test(fromBody) ? fromBody : null;
}
