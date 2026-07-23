import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  role: string;
  restaurantName?: string | null;
  restaurantId?: string | null;
  lastLogin?: string | null;
  active: boolean;
  createdAt: string;
}

export interface InviteStaffPayload {
  name: string;
  email: string;
  role: string;
  username?: string;
  avatarUrl?: string;
  /** Valfritt eget lösenord; utan det genererar API:t ett tillfälligt. */
  password?: string;
}

export const staffQueryKey = ["users", "staff"] as const;

export const getStaff = () => apiGet<StaffRecord[]>("/admin/staff");

export const inviteStaff = (payload: InviteStaffPayload) =>
  apiPost<StaffRecord & { temporaryPassword: string | null }>("/admin/staff/invite", payload);

export const updateStaff = (
  staffId: string,
  payload: { active?: boolean; role?: string; name?: string; username?: string | null; avatarUrl?: string | null },
) => apiPatch<StaffRecord>(`/admin/staff/${staffId}`, payload);

export const deleteStaff = (staffId: string) => apiDelete<{ success: boolean }>(`/admin/staff/${staffId}`);

export const resetStaffPassword = (staffId: string) => apiPost<{ success: boolean; temporaryPassword: string }>(`/admin/staff/${staffId}/reset-password`);
