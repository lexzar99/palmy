import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantName?: string | null;
  restaurantId?: string | null;
  lastLogin?: string | null;
  active: boolean;
  createdAt: string;
}

export const staffQueryKey = ["users", "staff"] as const;

export const getStaff = () => apiGet<StaffRecord[]>("/admin/staff");

export const inviteStaff = (payload: { name: string; email: string; role: string }) =>
  apiPost<StaffRecord & { temporaryPassword: string }>("/admin/staff/invite", payload);

export const updateStaff = (staffId: string, payload: { active?: boolean; role?: string; name?: string }) =>
  apiPatch<StaffRecord>(`/admin/staff/${staffId}`, payload);

export const deleteStaff = (staffId: string) => apiDelete<{ success: boolean }>(`/admin/staff/${staffId}`);

export const resetStaffPassword = (staffId: string) => apiPost<{ success: boolean; temporaryPassword: string }>(`/admin/staff/${staffId}/reset-password`);
