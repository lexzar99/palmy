// Aktiv deal-kontraktet — webbens motsvarighet till Swift-appens AppStorage.
// Nycklarna delas mellan hemskärmens deals-rail, profil/rewards och kassan:
//   viaeats.activeUserDealId       — vald UserDeal (sträng, "" = ingen)
//   viaeats.activeUserDealSnapshot — JSON av HomeAppDeal (eller "" när
//                                     kassan själv sätter/byter deal)
// Kassan LÄSER id:t, quotar mot servern (POST /api/deals/app/quote) som enda
// sanning för rabattbeloppet, och skickar userDealId på ordern. Efter betald
// order nollas båda nycklarna.
export const ACTIVE_USER_DEAL_ID_KEY = "viaeats.activeUserDealId";
export const ACTIVE_USER_DEAL_SNAPSHOT_KEY = "viaeats.activeUserDealSnapshot";

export function readActiveUserDealId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ACTIVE_USER_DEAL_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function readActiveUserDealSnapshot<T = Record<string, unknown>>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_USER_DEAL_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

/** Sätt aktiv deal. snapshot = HomeAppDeal-objekt, eller utelämnad → "" (kassan äger valet). */
export function writeActiveUserDeal(userDealId: string, snapshot?: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_USER_DEAL_ID_KEY, userDealId);
    localStorage.setItem(
      ACTIVE_USER_DEAL_SNAPSHOT_KEY,
      snapshot === undefined ? "" : JSON.stringify(snapshot),
    );
  } catch {
    /* noop */
  }
}

export function clearActiveUserDeal() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_USER_DEAL_ID_KEY);
    localStorage.removeItem(ACTIVE_USER_DEAL_SNAPSHOT_KEY);
  } catch {
    /* noop */
  }
}
