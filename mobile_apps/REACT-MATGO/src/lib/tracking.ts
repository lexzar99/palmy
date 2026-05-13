import { Platform } from "react-native";

/**
 * Apple App Tracking Transparency (ATT) helper.
 *
 * iOS App Store kräver att appen visar ATT-prompten innan IDFA används
 * (Sentry, analytics, etc). Endast iOS — Android/web returnerar 'unavailable'.
 *
 * Vi laddar expo-tracking-transparency dynamiskt så att frånvaron av
 * modulen (t.ex. när man bygger utan plugin under utveckling) inte
 * kraschar appen.
 */
export type TrackingStatus = "granted" | "denied" | "unavailable";

export async function requestTracking(): Promise<TrackingStatus> {
  if (Platform.OS !== "ios") return "unavailable";
  try {
    // Dynamic require so apps utan plugin fortfarande startar.
    const mod = require("expo-tracking-transparency");
    if (!mod?.getTrackingPermissionsAsync || !mod?.requestTrackingPermissionsAsync) {
      return "unavailable";
    }
    const current = await mod.getTrackingPermissionsAsync();
    if (current.status === "granted") return "granted";
    if (current.status === "denied") return "denied";
    if (current.status === "undetermined" || current.canAskAgain) {
      const next = await mod.requestTrackingPermissionsAsync();
      if (next.status === "granted") return "granted";
      return "denied";
    }
    return "denied";
  } catch {
    return "unavailable";
  }
}
