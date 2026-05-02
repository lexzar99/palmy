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

export const formatQuickAddress = (address: QuickAddress) => {
  let street = address.street;
  let zip = address.zip;
  
  if (!zip && street) {
    const zipMatch = street.match(/\b(\d{3,5})\b/);
    if (zipMatch) {
      zip = zipMatch[1];
    }
  }
  
  if (street && zip && street.toLowerCase().includes(zip.toLowerCase())) {
    street = street.replace(zip, "").replace(/,\s*,/g, ",").replace(/^,|,$/g, "").trim();
  }
  
  const parts = [street, zip].filter(Boolean);
  if (address.city && !street.toLowerCase().includes(address.city.toLowerCase())) {
    parts.push(address.city);
  }
  return parts.join(", ") || address.street;
};

const isSameAddress = (a: QuickAddress, b: QuickAddress) => {
  // Text dedup first — same formatted/normalized address counts as same place
  // regardless of GPS jitter on repeated permission grants.
  if (
    normalize(formatQuickAddress(a)) === normalize(formatQuickAddress(b)) ||
    (normalize(a.street) && normalize(a.street) === normalize(b.street) && normalize(a.zip) === normalize(b.zip))
  ) {
    return true;
  }

  // Fallback: GPS proximity. ~0.0005° ≈ 50m — generous enough to swallow
  // device GPS noise on repeated location-permission grants without
  // accidentally collapsing genuinely different nearby addresses.
  if (
    a.latitude != null &&
    a.longitude != null &&
    b.latitude != null &&
    b.longitude != null
  ) {
    return (
      Math.abs(a.latitude - b.latitude) < 0.0005 &&
      Math.abs(a.longitude - b.longitude) < 0.0005
    );
  }

  return false;
};

// Collapse duplicates from the same physical address but slightly different
// coords / formatting (e.g. multiple location-permission grants pushed in
// near-identical entries before the dedup tightening landed).
const dedupeAddresses = (entries: QuickAddress[]): QuickAddress[] => {
  const out: QuickAddress[] = [];
  for (const entry of entries) {
    const match = out.findIndex((existing) => isSameAddress(existing, entry));
    if (match === -1) {
      out.push(entry);
    } else {
      // Keep the freshest copy of the duplicate.
      const existing = out[match];
      const winner = (entry.updatedAt || 0) > (existing.updatedAt || 0) ? entry : existing;
      const isDefault = existing.isDefault || entry.isDefault;
      out[match] = { ...winner, isDefault };
    }
  }
  return out;
};

export const readQuickAddresses = async (): Promise<QuickAddress[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUICK_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned = dedupeAddresses(parsed).slice(0, MAX_ADDRESSES);
    // Persist back if we collapsed anything so the storage stays clean.
    if (cleaned.length !== parsed.length) {
      AsyncStorage.setItem(QUICK_ADDRESSES_KEY, JSON.stringify(cleaned)).catch(() => {});
    }
    return cleaned;
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
