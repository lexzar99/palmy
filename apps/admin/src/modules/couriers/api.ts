import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface CourierRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city: string;
  vehicle: "BIKE" | "EBIKE" | "CAR";
  online: boolean;
  isActive: boolean;
  currentLat?: number | null;
  currentLng?: number | null;
  lastSeenAt?: string | null;
  ratePerKm: number; // kr
  todayEarnings: number;
  todayDeliveries: number;
  last30Earnings: number;
  last30Deliveries: number;
}

export interface CourierApplication {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city: string;
  vehicle: "BIKE" | "EBIKE" | "CAR";
  message?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export interface CreateCourierPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  vehicle?: "BIKE" | "EBIKE" | "CAR";
  personalNumber?: string;
  address?: string;
  payoutAccount?: string;
  ratePerKm?: number; // kr/km
}

export interface CourierDeliveryRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  restaurantName: string | null;
  type: string | null;
  status: string;
  distanceKm: number;
  payout: number;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  pickupMin: number | null;
  deliverMin: number | null;
}

export interface CourierDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    city: string;
    vehicle: "BIKE" | "EBIKE" | "CAR";
    ratePerKm: number;
    isActive: boolean;
    profileImageUrl?: string | null;
    personalNumber?: string | null;
    address?: string | null;
    payoutAccount?: string | null;
    createdAt: string;
  };
  session: {
    online: boolean;
    sessionStartedAt?: string | null;
    lastSeenAt?: string | null;
    currentLat?: number | null;
    currentLng?: number | null;
  };
  stats: {
    totalDeliveries: number;
    totalEarnings: number;
    todayDeliveries: number;
    todayEarnings: number;
    last30Deliveries: number;
    last30Earnings: number;
    avgPickupMin: number | null; // accept → hämtad
    avgDeliverMin: number | null; // hämtad → levererad
    avgTotalMin: number | null; // accept → levererad
  };
  deliveries: CourierDeliveryRow[];
}

// ── Utbetalningsunderlag: leveranser i ett tidsintervall (ingen 50-tak) ──────
export interface CourierDeliveryExportRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  restaurantName: string | null;
  type: string | null;
  status: string;
  distanceKm: number;
  ratePerKm: number; // kr/km (fryst vid accept)
  payout: number; // kr
  tip: number; // kr
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  pickupMin: number | null;
  deliverMin: number | null;
}

export interface CourierDeliveriesResult {
  deliveries: CourierDeliveryExportRow[];
  total: number;
  payoutSum: number; // total utbetalning (kr) för DELIVERED i urvalet
}

export const courierDeliveriesQueryKey = (id: string, from: string, to: string, status: string) =>
  ["couriers", "deliveries", id, from, to, status] as const;

export const getCourierDeliveries = (
  id: string,
  params: { from?: string; to?: string; status?: string },
) => {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return apiGet<CourierDeliveriesResult>(`/admin/couriers/${id}/deliveries${qs ? `?${qs}` : ""}`);
};

export const couriersQueryKey = ["couriers", "list"] as const;
export const courierDetailQueryKey = (id: string) => ["couriers", "detail", id] as const;
export const getCourierDetail = (id: string) => apiGet<CourierDetail>(`/admin/couriers/${id}`);
export const applicationsQueryKey = ["couriers", "applications"] as const;

export const getCouriers = () => apiGet<CourierRow[]>("/admin/couriers");
export const createCourier = (payload: CreateCourierPayload) => apiPost<{ id: string }>("/admin/couriers", payload);
export const updateCourier = (
  id: string,
  // email/password: inloggnings-ändringar (super-admin). Lösenordsbyte loggar
  // ut kuriren från alla enheter (tokenVersion bumpas server-side).
  payload: Partial<{ isActive: boolean; ratePerKm: number; city: string; vehicle: string; phone: string; email: string; password: string }>,
) => apiPatch<{ ok: boolean }>(`/admin/couriers/${id}`, payload);
export const revokeCourier = (id: string) => apiPost<{ ok: boolean }>(`/admin/couriers/${id}/revoke`, {});

export const getApplications = () => apiGet<CourierApplication[]>("/admin/courier-applications");
export const approveApplication = (id: string, password: string) =>
  apiPost<{ courierId: string }>(`/admin/courier-applications/${id}/approve`, { password });
export const rejectApplication = (id: string) => apiPost<{ ok: boolean }>(`/admin/courier-applications/${id}/reject`, {});
