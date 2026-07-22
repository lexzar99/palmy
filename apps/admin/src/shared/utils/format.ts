export const formatCurrency = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  return `${Math.round(numeric).toLocaleString("sv-SE")} kr`;
};

export const formatCurrencyExact = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kr`;
};

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

export const formatNumber = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("sv-SE");

export const formatPercent = (value: number | null | undefined) => `${Number(value || 0).toFixed(1)}%`;

export const orderStatusLabel = (status: string | null | undefined) => {
  switch (status) {
    case "PENDING":
      return "Väntar";
    case "ACCEPTED":
      return "Tillagas";
    case "PREPARING":
      return "Tillagas";
    case "READY":
      return "Redo att hämtas";
    case "DELIVERING":
      return "På väg";
    case "DELIVERED":
      return "Levererad";
    case "COMPLETED":
      return "Slutförd";
    case "DELIVERY_FAILED":
      return "Misslyckad";
    case "CANCELLED":
      return "Avbruten";
    case "REJECTED":
      return "Nekad";
    default:
      return status || "Okänd";
  }
};

export const paymentStatusLabel = (status: string | null | undefined) => {
  switch (String(status || "").toUpperCase()) {
    case "PAID": return "Betald";
    case "PENDING": return "Väntar på betalning";
    case "REFUNDING": return "Återbetalas";
    case "REFUNDED": return "Återbetald";
    case "PARTIALLY_REFUNDED": return "Delvis återbetald";
    case "FAILED": return "Misslyckad";
    case "NEEDS_REVIEW": return "Behöver granskas";
    default: return status || "—";
  }
};

// Återbetalningsläge ersätter orderstatus-brickan i listor och historik så
// personalen direkt ser "Återbetalas" (pågår) respektive "Återbetald" (klar).
export const refundBadge = (
  paymentStatus: string | null | undefined,
): { label: string; tone: "warning" | "danger" } | null => {
  switch (String(paymentStatus || "").toUpperCase()) {
    case "REFUNDING": return { label: "Återbetalas", tone: "warning" };
    case "PARTIALLY_REFUNDED": return { label: "Delvis återbetald", tone: "warning" };
    case "REFUNDED": return { label: "Återbetald", tone: "danger" };
    default: return null;
  }
};

export const orderTypeLabel = (type: string | null | undefined) => {
  switch (type) {
    case "DELIVERY":
      return "Leverans";
    case "PICKUP":
    case "TAKEAWAY":
      return "Avhämtning";
    case "DINE_IN":
      return "Äta här";
    default:
      return type || "—";
  }
};

export const orderStatusTone = (status: string | null | undefined) => {
  switch (status) {
    case "PENDING":
      return "warning";
    case "ACCEPTED":
    case "PREPARING":
    case "READY":
      return "info";
    case "DELIVERING":
    case "DELIVERED":
      return "success";
    case "DELIVERY_FAILED":
    case "CANCELLED":
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
};

export const restaurantTierLabel = (tier: number | null | undefined) => {
  switch (tier) {
    case 1:
      return "Gold";
    case 2:
      return "Silver";
    case 0:
      return "Hidden";
    default:
      return "Standard";
  }
};

export const shortText = (value: string | null | undefined, max = 90) => {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max)}...` : value;
};
