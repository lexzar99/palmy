export const formatCurrency = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  return `${Math.round(numeric).toLocaleString("sv-SE")} kr`;
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
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "DELIVERING":
      return "Delivering";
    case "DELIVERED":
      return "Delivered";
    case "DELIVERY_FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "REJECTED":
      return "Rejected";
    default:
      return status || "Unknown";
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
