export const EMBED_PARENT_ORIGIN_PARAM = "parent_origin";
const EMBED_PARENT_ORIGIN_SESSION_KEY = "viaeats_embed_parent_origin_v1";
// Origin som embed.js uppgav men som servern ännu inte bekräftat.
const EMBED_PARENT_CLAIM_SESSION_KEY = "viaeats_embed_parent_claim_v1";
// Partnern som servern bekräftat via /api/kiosk/session (fas 3).
const EMBED_VERIFIED_PARTNER_SESSION_KEY = "viaeats_embed_partner_v2";

/**
 * Restaurangernas domäner ligger i admin (RestaurantDomain) och bekräftas av
 * servern när kioskbeviset lämnas ut. Lägg aldrig till en domän här. Bara
 * lokala sajter under utveckling litas på utan server, som tidigare.
 */
const LOCAL_DEV_PARTNER_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:4000",
]);
const LOCAL_DEV_MENU_PATH = "/meny.html";

export type VerifiedEmbedPartner = {
  origin: string;
  restaurantSlug: string;
  menuPath: string;
  primaryOrigin: string;
};

let verifiedPartnerMemory: VerifiedEmbedPartner | null = null;

/** Bara en ren origin: https, eller http mot localhost under utveckling. */
function normalizeOrigin(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !candidate || candidate.length > 256) return null;
  try {
    const url = new URL(candidate);
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !local) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validMenuPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && /^\/(?!\/)[A-Za-z0-9._~/-]*$/.test(value) && !value.split("/").includes("..");
}

function parseVerifiedPartner(value: unknown): VerifiedEmbedPartner | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const origin = normalizeOrigin(record.origin);
  const primaryOrigin = normalizeOrigin(record.primaryOrigin) || origin;
  if (!origin || !primaryOrigin || origin !== record.origin) return null;
  if (typeof record.restaurantSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.restaurantSlug)) return null;
  if (!validMenuPath(record.menuPath)) return null;
  return { origin, restaurantSlug: record.restaurantSlug, menuPath: record.menuPath, primaryOrigin };
}

function readVerifiedPartner(): VerifiedEmbedPartner | null {
  if (verifiedPartnerMemory) return verifiedPartnerMemory;
  if (typeof window === "undefined") return null;
  try {
    verifiedPartnerMemory = parseVerifiedPartner(
      JSON.parse(window.sessionStorage.getItem(EMBED_VERIFIED_PARTNER_SESSION_KEY) || "null"),
    );
  } catch {
    verifiedPartnerMemory = null;
  }
  return verifiedPartnerMemory;
}

/**
 * Sparar partnern som servern bekräftade när kioskbeviset lämnades ut. Bara
 * kioskAccessClient anropar den, med svaret från /api/kiosk/session.
 */
export function storeVerifiedEmbedPartner(value: unknown): VerifiedEmbedPartner | null {
  const partner = parseVerifiedPartner(value);
  if (!partner) return null;
  verifiedPartnerMemory = partner;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(EMBED_VERIFIED_PARTNER_SESSION_KEY, JSON.stringify(partner));
      window.sessionStorage.setItem(EMBED_PARENT_ORIGIN_SESSION_KEY, partner.origin);
    } catch { /* privat läge: minneskopian räcker för sidan */ }
  }
  return partner;
}

/**
 * Gör fliken samstämmig med den embed som visas nu. Anropas efter varje
 * kioskbevis. Utan det kan en partner från en tidigare embed i samma flik
 * ligga kvar, och kassan skulle då skicka fel restaurangs returadress, som
 * servern nekar. Partnern gäller bara när servern bekräftat den för just den
 * här restaurangen och domänen.
 */
export function syncEmbedPartnerAfterKiosk(restaurantSlug: string, value: unknown, claimedOrigin: string | null): void {
  const partner = parseVerifiedPartner(value);
  if (partner && partner.restaurantSlug === restaurantSlug && partner.origin === claimedOrigin) {
    storeVerifiedEmbedPartner(partner);
    return;
  }
  verifiedPartnerMemory = null;
  if (typeof window === "undefined") return;
  // Lokala utvecklingssajter litas på utan server.
  const legacy = claimedOrigin && LOCAL_DEV_PARTNER_ORIGINS.has(claimedOrigin) ? claimedOrigin : null;
  try {
    window.sessionStorage.removeItem(EMBED_VERIFIED_PARTNER_SESSION_KEY);
    if (legacy) window.sessionStorage.setItem(EMBED_PARENT_ORIGIN_SESSION_KEY, legacy);
    else window.sessionStorage.removeItem(EMBED_PARENT_ORIGIN_SESSION_KEY);
  } catch { /* noop */ }
}

/**
 * Frågar servern om origin hör till restaurangen, utan att skapa kioskbevis.
 * Används när en betalning landar på viaeats toppnivå och kunden ska tillbaka
 * till partnerns sida. Returnerar partnerns bekräftade origin eller null.
 */
export async function verifyEmbedParentOrigin(restaurantSlug: string, candidate: unknown): Promise<string | null> {
  const origin = normalizeOrigin(candidate);
  if (!origin || !restaurantSlug) return null;
  const known = trustedPartnerOrigin(origin);
  if (known) return known;
  try {
    const query = new URLSearchParams({ slug: restaurantSlug, origin });
    const response = await fetch(`/api/platform/embed/partner?${query.toString()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { allowed?: unknown; partner?: unknown };
    if (data.allowed !== true) return null;
    const partner = storeVerifiedEmbedPartner(data.partner);
    return partner && partner.restaurantSlug === restaurantSlug && partner.origin === origin ? origin : null;
  } catch {
    return null;
  }
}

/** Sökvägen där partnern har embedden. Betalningar återvänder hit. */
export function partnerMenuPath(origin: string): string {
  const verified = readVerifiedPartner();
  if (verified && verified.origin === origin) return verified.menuPath;
  if (verified && verified.primaryOrigin === origin) return verified.menuPath;
  return LOCAL_DEV_PARTNER_ORIGINS.has(origin) ? LOCAL_DEV_MENU_PATH : "/meny";
}

/**
 * Returnerar origin om den är en betrodd partner: bekräftad av servern för den
 * här fliken, eller en lokal utvecklingssajt. Används för postMessage-mål och för
 * att godta meddelanden från föräldern.
 */
export function trustedPartnerOrigin(candidate: unknown): string | null {
  const origin = normalizeOrigin(candidate);
  if (!origin) return null;
  const verified = readVerifiedPartner();
  if (verified && (verified.origin === origin || verified.primaryOrigin === origin)) return origin;
  return LOCAL_DEV_PARTNER_ORIGINS.has(origin) ? origin : null;
}

/**
 * Förälderns riktiga origin enligt webbläsaren (Chrome och Safari). Den går
 * inte att förfalska via adressen och finns kvar även när lagringen är
 * blockerad. Firefox saknar den, och där gäller parent_origin.
 */
function actualParentOrigin(): string | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  try {
    const ancestors = window.location.ancestorOrigins;
    return ancestors && ancestors.length > 0 ? normalizeOrigin(ancestors[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Kommer meddelandet från partnersidan som bäddar in oss? Godtar viaeats egen
 * origin, en bekräftad partner och förälderns riktiga origin enligt
 * webbläsaren. Bara för ofarliga meddelanden som att öppna en produkt.
 */
export function isEmbedParentMessage(event: MessageEvent): boolean {
  if (typeof window === "undefined" || event.source !== window.parent) return false;
  if (event.origin === window.location.origin) return true;
  return trustedPartnerOrigin(event.origin) !== null || event.origin === actualParentOrigin();
}

/** Origin som embed.js uppgav. Inte betrodd: servern avgör vid kioskbeviset. */
export function claimedEmbedParentOrigin(candidate?: unknown): string | null {
  const actual = actualParentOrigin();
  const fromCandidate = actual || normalizeOrigin(candidate);
  if (typeof window === "undefined") return fromCandidate;
  const fromQuery = fromCandidate || normalizeOrigin(
    new URLSearchParams(window.location.search).get(EMBED_PARENT_ORIGIN_PARAM),
  );
  try {
    if (fromQuery) {
      window.sessionStorage.setItem(EMBED_PARENT_CLAIM_SESSION_KEY, fromQuery);
      return fromQuery;
    }
    return normalizeOrigin(window.sessionStorage.getItem(EMBED_PARENT_CLAIM_SESSION_KEY));
  } catch {
    return fromQuery;
  }
}

export function rememberEmbedParentOrigin(candidate: unknown): string | null {
  claimedEmbedParentOrigin(candidate);
  const origin = trustedPartnerOrigin(candidate);
  if (!origin || typeof window === "undefined") return origin;
  try { window.sessionStorage.setItem(EMBED_PARENT_ORIGIN_SESSION_KEY, origin); } catch { /* noop */ }
  return origin;
}

export function readEmbedParentOrigin(): string | null {
  if (typeof window === "undefined") return null;
  // Den riktiga föräldern går före allt annat. Står föräldern i adressen
  // gäller den, även när den inte är betrodd. En sparad partner från en
  // tidigare embed i fliken får aldrig ta över.
  const actual = actualParentOrigin();
  if (actual) return rememberEmbedParentOrigin(actual);
  const fromAddress = new URLSearchParams(window.location.search).get(EMBED_PARENT_ORIGIN_PARAM);
  if (fromAddress) return rememberEmbedParentOrigin(fromAddress);
  try {
    return trustedPartnerOrigin(window.sessionStorage.getItem(EMBED_PARENT_ORIGIN_SESSION_KEY));
  } catch {
    return trustedPartnerOrigin(readVerifiedPartner()?.origin);
  }
}

// Partnersidan ber om en tillbaka-knapp via ?back=1 på första iframe-URL:en.
// Flaggan sparas per flik så att den följer med till kassan och spårningen.
const EMBED_BACK_PARAM = "back";
const EMBED_BACK_SESSION_KEY = "viaeats_embed_back_v1";

export function readEmbedBackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get(EMBED_BACK_PARAM) === "1") {
      window.sessionStorage.setItem(EMBED_BACK_SESSION_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(EMBED_BACK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Ber partnersidan (embed.js) att navigera till sin egen tillbaka-adress. */
// Meddelandet bär ingen data, så "*" är ofarligt när partnerns origin är okänd
// (t.ex. palmyrapizzeria.se utan www). embed.js bestämmer själv målet.
export function requestEmbedBack() {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ type: "viaeats:navigate-back" }, readEmbedParentOrigin() || "*");
}

export function partnerOriginForRestaurant(restaurantSlug: unknown): string | null {
  if (typeof restaurantSlug !== "string") return null;
  const slug = restaurantSlug.trim().toLowerCase();
  const verified = readVerifiedPartner();
  return verified && verified.restaurantSlug === slug ? verified.primaryOrigin : null;
}

// Embedden har ingen orderhistorik, men kunden ska kunna lämna sidan och sedan hitta tillbaka till
// sin pågående order. Senaste ordern per restaurang sparas därför här (bara id, inget ägarbevis:
// åtkomsten sitter fortfarande i den HttpOnly order-sessionen) och visas som "Order" i EmbeddedNav.
const EMBED_ORDER_PREFIX = "viaeats_embed_order_v1:";
const EMBED_ORDER_TTL_MS = 12 * 60 * 60 * 1000;

export function rememberEmbedOrder(restaurantSlug: string, orderId: string) {
  if (typeof window === "undefined" || !restaurantSlug || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return;
  try {
    window.localStorage.setItem(EMBED_ORDER_PREFIX + restaurantSlug, JSON.stringify({ id: orderId, at: Date.now() }));
  } catch { /* privat läge: fliken syns då bara på ordersidan */ }
}

export function readEmbedOrder(restaurantSlug: string): string | null {
  if (typeof window === "undefined" || !restaurantSlug) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EMBED_ORDER_PREFIX + restaurantSlug) || "null");
    if (!parsed || typeof parsed.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(parsed.id)) return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > EMBED_ORDER_TTL_MS) return null;
    return parsed.id;
  } catch {
    return null;
  }
}
