/**
 * Kundens ordernummer: de fyra siffrorna i mitten av det fullständiga numret
 * (PALM-1234-AB12C → 1234). Det är samma nummer som restaurangplattan visar
 * (OrderPresentation.kt tar första sifferföljden med minst fyra siffror), så
 * kunden och köket säger samma sak vid disken. Kvittot visar alltid hela
 * numret, eftersom det är det som är unikt.
 */
export function customerOrderNumber(orderNumber: unknown): string | null {
  const full = String(orderNumber ?? "").trim();
  if (!full) return null;
  return full.match(/\d{4,}/)?.[0] ?? full;
}
