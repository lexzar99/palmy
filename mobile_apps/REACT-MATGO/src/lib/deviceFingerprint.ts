import AsyncStorage from "@react-native-async-storage/async-storage";

// Stable per-install device id. Used for referral redemption so backend can
// dedupe self-referrals / re-runs from the same physical device. We don't
// rely on expo-application's vendor id because that requires extra
// permissions on iOS and resets on uninstall anyway — a random id stored in
// AsyncStorage is good enough for the abuse model the backend cares about.
const KEY = "matgo_device_id";

export async function getDeviceFingerprint(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = `rn-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await AsyncStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage failure (rare — AsyncStorage on JSC is essentially never
    // unavailable) — fall back to an ephemeral id so the redeem call still
    // has *something* to send. Worst case: backend treats it as a new device.
    return `rn-ephemeral-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}
