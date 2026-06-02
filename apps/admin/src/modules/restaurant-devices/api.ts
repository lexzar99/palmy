import { apiDelete, apiGet, apiPost } from "@/shared/api/client";

export type TerminalDeviceStatus = "linked" | "revoked";

export interface TerminalDevice {
  id: string;
  deviceId: string;
  label: string | null;
  status: TerminalDeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PendingPairingCode {
  code: string;
  expiresAt: string;
}

export interface RestaurantDevicesResponse {
  devices: TerminalDevice[];
  pendingCode: PendingPairingCode | null;
}

export const getRestaurantDevices = (restaurantId: string) =>
  apiGet<RestaurantDevicesResponse>(`/admin/restaurants/${restaurantId}/devices`);

export const generatePairingCode = (restaurantId: string) =>
  apiPost<PendingPairingCode>(`/admin/restaurants/${restaurantId}/devices/pairing-code`);

export const revokeDevice = (id: string) =>
  apiPost<{ success: boolean }>(`/admin/devices/${id}/revoke`);

export const restoreDevice = (id: string) =>
  apiPost<{ success: boolean }>(`/admin/devices/${id}/restore`);

export const deleteDevice = (id: string) =>
  apiDelete<{ success: boolean }>(`/admin/devices/${id}`);
