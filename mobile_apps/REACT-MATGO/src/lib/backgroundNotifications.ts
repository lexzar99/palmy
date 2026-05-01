/**
 * Background notification handler — keeps Live Activities in sync when the
 * app is backgrounded or killed.
 *
 * Why this exists:
 *   `Notifications.addNotificationReceivedListener` (in usePushNotifications)
 *   only fires while the JS context is alive — i.e. app in the foreground.
 *   When admin marks an order DELIVERING and the customer's phone has the app
 *   backgrounded, iOS may throttle the dedicated `liveactivity` APNs topic
 *   (especially without "Frequent Updates" enabled), so the Dynamic Island
 *   freezes on the previous step.
 *
 *   The backend covers this by also sending a regular alert push with
 *   `content-available: 1`, which iOS treats as a wake. But Expo only
 *   delivers that wake into JS if a TaskManager task is registered for
 *   background notifications. This module sets that up.
 *
 * Flow when app is backgrounded:
 *   1. Backend pushes alert with `content-available: 1` + `data.orderId`.
 *   2. iOS wakes JS for ~30 seconds in a background task.
 *   3. Our task unwraps the orderId and calls `syncOrderActivityFromServer`.
 *   4. That fetches the latest order state and calls `Activity.update()`
 *      directly on the native side — Dynamic Island refreshes.
 */
import { syncOrderActivityFromServer } from './liveActivities';

const TASK_NAME = 'foodgo-background-notification';

// Defer requires so a missing native module never crashes app start.
// The native ExpoTaskManager pod must be linked (`pod install`) for this
// path to engage; without it we silently no-op and rely on the
// foreground-only `addNotificationReceivedListener` fallback.
let TaskManager: typeof import('expo-task-manager') | null = null;
let Notifications: typeof import('expo-notifications') | null = null;
try {
  TaskManager = require('expo-task-manager');
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('[bgNotif] expo-task-manager not available — skipping background sync');
}

let taskDefined = false;
function defineTaskOnce() {
  if (taskDefined || !TaskManager) return;
  try {
    TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
      if (error) {
        console.warn('[bgNotif] task error:', error.message);
        return;
      }
      try {
        const payload: any = data;
        const inner =
          payload?.notification?.data ??
          payload?.notification?.request?.content?.data ??
          payload?.data ??
          payload;
        const orderId = inner?.orderId ?? inner?.['order-id'];
        if (typeof orderId === 'string' && orderId.length > 0) {
          await syncOrderActivityFromServer(orderId);
        }
      } catch (e) {
        console.warn('[bgNotif] sync failed:', (e as Error)?.message);
      }
    });
    taskDefined = true;
  } catch (e) {
    console.warn('[bgNotif] defineTask failed:', (e as Error)?.message);
  }
}

defineTaskOnce();

let registered = false;
export async function registerBackgroundNotificationTask(): Promise<void> {
  if (registered || !Notifications) return;
  try {
    await Notifications.registerTaskAsync(TASK_NAME);
    registered = true;
    console.log('[bgNotif] background notification task registered');
  } catch (e) {
    console.warn('[bgNotif] register failed:', (e as Error)?.message);
  }
}
