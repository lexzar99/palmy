/**
 * Soft prompts that nudge the user to fix the two permission issues that
 * silently degrade the post-order experience on iOS:
 *
 *  1. Notifications denied — without this we can't push status changes at all.
 *  2. "Frequent Updates" toggle off — Live Activity push-to-update gets
 *     aggressively throttled and the Dynamic Island countdown can drift by
 *     minutes. The toggle lives in Settings → FoodGo → Live Activities and
 *     there is no API to read it, so we just ask once after the first order
 *     and link the user there.
 *
 * Both prompts respect a "shown once" flag stored in AsyncStorage so the user
 * isn't pestered every time they place an order.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";

const FREQUENT_UPDATES_SEEN = "react-matgo:frequent-updates-prompt-shown";
const NOTIF_DENIED_SEEN = "react-matgo:notif-denied-prompt-shown";

export async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  } catch {
    // Linking.openSettings throws on some web/dev environments — swallow.
  }
}

/** Call once after the user has just placed their first order. */
export async function maybeShowFrequentUpdatesPrompt(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const seen = await AsyncStorage.getItem(FREQUENT_UPDATES_SEEN);
    if (seen === "1") return;
    await AsyncStorage.setItem(FREQUENT_UPDATES_SEEN, "1");
  } catch {
    return;
  }
  // Defer the alert by a beat so the order-confirmation transition has time
  // to land — popping the alert mid-navigation feels jumpy.
  setTimeout(() => {
    Alert.alert(
      "Få exakt nedräkning ⏱️",
      "För att Dynamic Island ska visa rätt tid hela vägen, slå på \"Frequent Updates\" i Inställningar → FoodGo → Live Activities.",
      [
        { text: "Inte nu", style: "cancel" },
        { text: "Öppna inställningar", onPress: () => { void openAppSettings(); } },
      ],
      { cancelable: true },
    );
  }, 1200);
}

/** Call when we know the user has actively declined notifications. */
export async function maybeShowNotificationsDeniedPrompt(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "denied") return;
    const seen = await AsyncStorage.getItem(NOTIF_DENIED_SEEN);
    if (seen === "1") return;
    await AsyncStorage.setItem(NOTIF_DENIED_SEEN, "1");
  } catch {
    return;
  }
  Alert.alert(
    "Notiser är avstängda",
    "Vi behöver kunna pinga dig när maten är på väg och när den är framme. Slå på notiser i Inställningar för att aldrig missa en uppdatering.",
    [
      { text: "Senare", style: "cancel" },
      { text: "Öppna inställningar", onPress: () => { void openAppSettings(); } },
    ],
    { cancelable: true },
  );
}

/** Reset both flags — useful for QA / signing out. */
export async function resetPermissionPromptFlags(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([FREQUENT_UPDATES_SEEN, NOTIF_DENIED_SEEN]);
  } catch {}
}
