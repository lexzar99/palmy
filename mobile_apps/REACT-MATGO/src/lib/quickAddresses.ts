import AsyncStorage from "@react-native-async-storage/async-storage";

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

export const QUICK_ADDRESSES_KEY = "react-matgo-quick-addresses";
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

export const readQuickAddresses = async (): Promise<QuickAddress[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUICK_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ADDRESSES);
  } catch {
    return [];
  }
};

export const writeQuickAddresses = async (addresses: QuickAddress[]) => {
  await AsyncStorage.setItem(
    QUICK_ADDRESSES_KEY,
    JSON.stringify(addresses.slice(0, MAX_ADDRESSES)),
  );
};

export const rememberQuickAddress = async (address: QuickAddress) => {
  const now = Date.now();
  const existing = await readQuickAddresses();
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

  await writeQuickAddresses(normalized);
  return normalized;
};

export const ensureQuickAddress = async (address: QuickAddress) => {
  const existing = await readQuickAddresses();
  if (existing.some((item) => isSameAddress(item, address))) return existing;

  const next = [
    ...existing,
    { ...address, isDefault: existing.length === 0, updatedAt: Date.now() },
  ].slice(0, MAX_ADDRESSES);
  await writeQuickAddresses(next);
  return next;
};

export const setDefaultQuickAddress = async (address: QuickAddress) => {
  const existing = await readQuickAddresses();
  const next = existing.map((item) => ({
    ...item,
    isDefault: isSameAddress(item, address),
    updatedAt: isSameAddress(item, address) ? Date.now() : item.updatedAt,
  }));
  next.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  await writeQuickAddresses(next);
  return next;
};

export const removeQuickAddress = async (address: QuickAddress) => {
  const filtered = (await readQuickAddresses()).filter((item) => !isSameAddress(item, address));
  if (filtered.length > 0 && !filtered.some((item) => item.isDefault)) {
    filtered[0] = { ...filtered[0], isDefault: true };
  }
  await writeQuickAddresses(filtered);
  return filtered;
};

export const findQuickAddressByText = async (text: string) => {
  const normalized = normalize(text);
  const entries = await readQuickAddresses();
  return entries.find((item) => normalize(formatQuickAddress(item)) === normalized) || null;
};
