/**
 * Client-side handoff for the short-lived kiosk proof.
 *
 * The HttpOnly cookie is the preferred credential. The sessionStorage copy is
 * a deliberate iframe fallback: browsers may block third-party cookies when
 * Palmyra embeds ViaEats, but the signed proof is still limited to the
 * configured restaurant and expires automatically.
 */
import { claimedEmbedParentOrigin, storeVerifiedEmbedPartner } from "@/lib/embedPartner";

export const KIOSK_ACCESS_SESSION_KEY = "viaeats_kiosk_access_v1";

type StoredKioskAccess = {
  restaurantSlug: string;
  proof: string;
};

function readStoredKioskAccess(): StoredKioskAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KIOSK_ACCESS_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredKioskAccess>;
    if (!value.restaurantSlug || !value.proof) return null;
    return { restaurantSlug: value.restaurantSlug, proof: value.proof };
  } catch {
    return null;
  }
}

function storeKioskAccess(restaurantSlug: string, proof: string): void {
  try {
    window.sessionStorage.setItem(
      KIOSK_ACCESS_SESSION_KEY,
      JSON.stringify({ restaurantSlug, proof } satisfies StoredKioskAccess),
    );
  } catch {
    // Private browsing may disable sessionStorage. The HttpOnly cookie still
    // remains available in browsers that allow it.
  }
}

/**
 * Refresh the restaurant-scoped kiosk session before checkout starts.
 *
 * Partnerns origin (från embed.js) skickas med. Servern lämnar bara ut ett
 * bevis när domänen hör till restaurangen, och svarar då med partnerns
 * bekräftade origin och menysida, som embedPartner sedan litar på.
 */
export async function ensureKioskAccess(restaurantSlug: string, parentOrigin?: string | null): Promise<boolean> {
  if (typeof window === "undefined" || !restaurantSlug) return false;

  const current = readStoredKioskAccess();
  const claimedOrigin = claimedEmbedParentOrigin(parentOrigin);
  const query = new URLSearchParams({ slug: restaurantSlug });
  if (claimedOrigin) query.set("origin", claimedOrigin);

  try {
    const response = await fetch(`/api/kiosk/session?${query.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { proof?: unknown; restaurantSlug?: unknown; partner?: unknown };
    if (typeof data.proof !== "string" || data.restaurantSlug !== restaurantSlug) return false;
    storeKioskAccess(restaurantSlug, data.proof);
    if (data.partner) storeVerifiedEmbedPartner(data.partner);
    return true;
  } catch {
    // A previously issued proof can still be useful during a short network
    // interruption; the API remains the authority and rejects it if expired.
    return current?.restaurantSlug === restaurantSlug;
  }
}

/** Read the proof for the axios request interceptor. */
export function getKioskAccessProof(): string | null {
  return readStoredKioskAccess()?.proof || null;
}
