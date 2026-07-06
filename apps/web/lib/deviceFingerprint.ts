/**
 * Enkel canvas + navigator-baserad device fingerprint för referral-abuse-
 * prevention. Inte kryptografiskt säker — bara "good enough" för att detektera
 * när samma webbläsare/enhet försöker använda flera referral-koder i rad.
 *
 * Backend (`POST /api/account/redeem-code`) tar emot deviceFingerprint som
 * vanlig sträng och lagrar tillsammans med IP för matchning.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr-no-fingerprint";

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    // OBS: strängen ingår i hashen — byte påverkar bara NYA fingerprints.
    ctx.fillText("ViaEats fingerprint", 2, 2);
    const dataUrl = canvas.toDataURL();

    // Lägg till navigator-fingerprint för extra entropi
    const nav = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;

    // Snabb DJB2-liknande hash — räcker för match/no-match
    let hash = 0;
    const str = dataUrl + "|" + nav;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `web-${Math.abs(hash).toString(36)}`;
  } catch {
    return `web-fallback-${Math.random().toString(36).slice(2)}`;
  }
}
