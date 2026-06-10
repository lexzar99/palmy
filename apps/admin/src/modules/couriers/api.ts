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

export const couriersQueryKey = ["couriers", "list"] as const;
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
