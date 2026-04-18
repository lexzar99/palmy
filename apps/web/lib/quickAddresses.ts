export interface QuickAddress {
  id?: string;
  label?: string;
  street: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
  updatedAt?: number;
}

export const QUICK_ADDRESSES_KEY = "platform_quick_addresses";
const MAX_ADDRESSES = 3;

const normalize = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const formatQuickAddress = (address: QuickAddress) =>
  [address.street, address.zip, address.city].filter(Boolean).join(", ") || address.street;

const isSameAddress = (a: QuickAddress, b: QuickAddress) => {
  if (
    a.latitude != null &&
    a.longitude != null &&
    b.latitude != null &&
    b.longitude != null
  ) {
    return (
      Math.abs(a.latitude - b.latitude) < 0.000001 &&
      Math.abs(a.longitude - b.longitude) < 0.000001
    );
  }

  return (
    normalize(formatQuickAddress(a)) === normalize(formatQuickAddress(b)) ||
    (normalize(a.street) === normalize(b.street) && normalize(a.zip) === normalize(b.zip))
  );
};

export const readQuickAddresses = (): QuickAddress[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(QUICK_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ADDRESSES);
  } catch {
    return [];
  }
};

export const writeQuickAddresses = (addresses: QuickAddress[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUICK_ADDRESSES_KEY, JSON.stringify(addresses.slice(0, MAX_ADDRESSES)));
};

export const rememberQuickAddress = (address: QuickAddress) => {
  const now = Date.now();
  const existing = readQuickAddresses();
  const previous = existing.find((item) => isSameAddress(item, address));
  const nextEntry: QuickAddress = {
    ...previous,
    ...address,
    isDefault: true,
    updatedAt: now,
  };

  const withoutMatch = existing.filter((item) => !isSameAddress(item, nextEntry));
  const normalized = [
    nextEntry,
    ...withoutMatch.map((item) => ({ ...item, isDefault: false })),
  ].slice(0, MAX_ADDRESSES);

  writeQuickAddresses(normalized);
  return normalized;
};

export const ensureQuickAddress = (address: QuickAddress) => {
  const existing = readQuickAddresses();
  if (existing.some((item) => isSameAddress(item, address))) return existing;

  const next = [
    ...existing,
    { ...address, isDefault: existing.length === 0, updatedAt: Date.now() },
  ].slice(0, MAX_ADDRESSES);
  writeQuickAddresses(next);
  return next;
};

export const setDefaultQuickAddress = (address: QuickAddress) => {
  const existing = readQuickAddresses();
  const next = existing.map((item) => ({
    ...item,
    isDefault: isSameAddress(item, address),
    updatedAt: isSameAddress(item, address) ? Date.now() : item.updatedAt,
  }));
  next.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  writeQuickAddresses(next);
  return next;
};

export const removeQuickAddress = (address: QuickAddress) => {
  const filtered = readQuickAddresses().filter((item) => !isSameAddress(item, address));
  if (filtered.length > 0 && !filtered.some((item) => item.isDefault)) {
    filtered[0] = { ...filtered[0], isDefault: true };
  }
  writeQuickAddresses(filtered);
  return filtered;
};

export const findQuickAddressByText = (text: string) => {
  const normalized = normalize(text);
  return readQuickAddresses().find((item) => normalize(formatQuickAddress(item)) === normalized);
};
