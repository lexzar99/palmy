import { apiDelete, apiGet, apiPost } from "@/shared/api/client";

export type TerminalDeviceStatus = "linked" | "revoked";

export interface TerminalDevice {
  id: string;
  deviceId: string;
  label: string | null;
  status: TerminalDeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
}

export interface PendingPairingCode {
  code: string;
  expiresAt: string;
  reused?: boolean;
  serverTime?: string;
  validForSeconds?: number;
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

// ── Partner-APK:er som terminalerna uppdaterar sig från ─────────────────────

export interface TerminalAppRelease {
  id: string;
  versionCode: number;
  versionName: string;
  flavor: string;
  sha256: string;
  sizeBytes: number;
  notes: string | null;
  isActive: boolean;
  uploadedBy: string | null;
  createdAt: string;
}

export const getTerminalReleases = () =>
  apiGet<{ releases: TerminalAppRelease[] }>("/admin/terminal-releases");

/**
 * Servern läser versionCode/versionName ur själva APK:n — vi skickar bara
 * filen och eventuella släppanteckningar. onProgress driver progressbaren,
 * eftersom en APK på några MB tar märkbar tid på restaurang-Wi-Fi.
 */
export const uploadTerminalRelease = (
  file: File,
  opts: { flavor?: string; notes?: string; onProgress?: (percent: number) => void } = {},
) => {
  const form = new FormData();
  form.append("apk", file);
  if (opts.flavor) form.append("flavor", opts.flavor);
  if (opts.notes) form.append("notes", opts.notes);
  return apiPost<{ release: TerminalAppRelease }>("/admin/terminal-releases", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (!opts.onProgress || !event.total) return;
      opts.onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
};

export const activateTerminalRelease = (id: string) =>
  apiPost<{ release: TerminalAppRelease; warning?: string }>(`/admin/terminal-releases/${id}/activate`);

export const deleteTerminalRelease = (id: string) =>
  apiDelete<{ success: boolean }>(`/admin/terminal-releases/${id}`);
