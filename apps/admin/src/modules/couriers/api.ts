import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface CourierRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city: string;
  vehicle: "BIKE" | "CAR";
  online: boolean;
  isActive: boolean;
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
  vehicle: "BIKE" | "CAR";
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
  vehicle?: "BIKE" | "CAR";
  personalNumber?: string;
  address?: string;
  payoutAccount?: string;
  ratePerKm?: number; // kr/km
}

export interface CourierDeliveryRow {
  id: string;
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
    vehicle: "BIKE" | "CAR";
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

export const couriersQueryKey = ["couriers", "list"] as const;
export const courierDetailQueryKey = (id: string) => ["couriers", "detail", id] as const;
export const getCourierDetail = (id: string) => apiGet<CourierDetail>(`/admin/couriers/${id}`);
export const applicationsQueryKey = ["couriers", "applications"] as const;

export const getCouriers = () => apiGet<CourierRow[]>("/admin/couriers");
export const createCourier = (payload: CreateCourierPayload) => apiPost<{ id: string }>("/admin/couriers", payload);
export const updateCourier = (id: string, payload: Partial<{ isActive: boolean; ratePerKm: number; city: string; vehicle: string; phone: string }>) =>
  apiPatch<{ ok: boolean }>(`/admin/couriers/${id}`, payload);
export const revokeCourier = (id: string) => apiPost<{ ok: boolean }>(`/admin/couriers/${id}/revoke`, {});

export const getApplications = () => apiGet<CourierApplication[]>("/admin/courier-applications");
export const approveApplication = (id: string, password: string) =>
  apiPost<{ courierId: string }>(`/admin/courier-applications/${id}/approve`, { password });
export const rejectApplication = (id: string) => apiPost<{ ok: boolean }>(`/admin/courier-applications/${id}/reject`, {});
