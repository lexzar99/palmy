import { useState, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';
import { syncOrderActivityFromServer } from '../lib/liveActivities';
import { maybeShowNotificationsDeniedPrompt } from '../lib/permissionPrompts';

export function usePushNotifications(
  sessionToken: string | null,
  onNotificationTap?: (data: Record<string, any>) => void,
) {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [apnsDeviceToken, setApnsDeviceToken] = useState<string>('');
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [initialNotificationData, setInitialNotificationData] = useState<Record<string, any> | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const requestPermissionRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    let active = true;

    async function registerForPushNotificationsAsync() {
      let token;
      
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#D9B055', // Matching MatGo gold
        });
      }

      // We skip push setup on Web
      if (Platform.OS === 'web') return null;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      // If the user actively declined we can't recover by re-requesting (iOS
      // returns 'denied' without showing the popup again). Show a one-shot
      // soft nudge that links them straight to the Settings entry.
      if (existingStatus === 'denied') {
        void maybeShowNotificationsDeniedPrompt();
      }

      // Endast om de redan har godkänt hämtar vi token automatiskt vid appstart
      if (existingStatus === 'granted') {
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
          if (!projectId) throw new Error('Project ID saknas i app.json');
          token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        } catch (e) {
          console.warn('Misslyckades att hämta Push Token:', e);
        }
        // iOS APNs device token (hex). Used by the backend to send pushes
        // direct via APNs HTTP/2 with apns-collapse-id, so each order's
        // status updates roll into a single replaceable notification.
        if (Platform.OS === 'ios') {
          try {
            const dev = await Notifications.getDevicePushTokenAsync();
            if (dev?.type === 'ios' && typeof dev.data === 'string') {
              setApnsDeviceToken(dev.data);
            }
          } catch (e) {
            console.warn('Misslyckades att hämta APNs device token:', e);
          }
        }
      }
      return token;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (active && token) {
        setExpoPushToken(token);
      }
    });

    // Tillåt att trigga popup-rutan manuellt från koden istället (e.g. efter Onboarding)
    const requestPushPermissionManual = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
          const newToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
          setExpoPushToken(newToken);
          if (Platform.OS === 'ios') {
            try {
              const dev = await Notifications.getDevicePushTokenAsync();
              if (dev?.type === 'ios' && typeof dev.data === 'string') {
                setApnsDeviceToken(dev.data);
              }
            } catch {}
          }
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    };

    requestPermissionRef.current = requestPushPermissionManual;

    // Notis-listener: capture payload + (NEW) trigger an LA resync from
    // server when the alert carries an orderId. The backend now sets
    // content-available: 1 on order-status alerts so iOS briefly wakes JS in
    // the background — we use that wake to call `Activity.update()` directly.
    // This is the belt-and-braces fallback for the dedicated LA APNs push,
    // which iOS aggressively throttles when the user hasn't enabled
    // "Frequent Updates" in Settings → FoodGo → Live Activities.
    //
    // It's safe to call updateOrderActivity here even though we have a
    // separate foreground sync hook: `LiveActivitiesModule.updateOrderActivity`
    // no longer triggers a system "ding" (no AlertConfiguration), so re-syncs
    // are silent.
    notificationListener.current = Notifications.addNotificationReceivedListener((notif) => {
      setNotification(notif);
      const data = notif?.request?.content?.data as Record<string, any> | undefined;
      const orderId = data?.orderId;
      if (typeof orderId === 'string' && orderId.length > 0) {
        syncOrderActivityFromServer(orderId).catch(() => {});
      }
    });

    // Anropas när man TAPPAT på en notis i notis-centret (app i bakgrunden)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (onNotificationTap && data) onNotificationTap(data);
    });

    // Anropas när appen öppnas från ett dött läge via en notis
    // Store the data so App.tsx can process it once NavigationContainer is ready
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !active) return;
      const data = response.notification.request.content.data as Record<string, any>;
      if (data && Object.keys(data).length > 0) setInitialNotificationData(data);
    });

    // Clear the red badge whenever the user opens the app. iOS leaves the
    // "1" badge above the app icon until something explicitly resets the
    // count — without this, status pushes leave a stuck badge that doesn't
    // go away when the user comes back into the app.
    const clearBadge = () => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
    };
    clearBadge();
    const badgeSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') clearBadge();
    });

    return () => {
      active = false;
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
      badgeSub.remove();
      requestPermissionRef.current = null;
    };
  }, []);

  // Skicka push token till databasen så fort vi har ett token och en inloggad
  // användare. Retries with exponential backoff so a transient network blip
  // at app launch doesn't permanently leave the device unreachable for
  // pushes (we used to silently drop the failure and never retry).
  useEffect(() => {
    if (!sessionToken || !expoPushToken) return;
    let cancelled = false;
    const send = async (attempt = 0) => {
      try {
        await api.post(
          '/api/notifications/register',
          { token: expoPushToken },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        );
      } catch (err) {
        if (cancelled || attempt >= 4) {
          console.warn('Kunde inte skicka push token till servern:', err);
          return;
        }
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000);
        setTimeout(() => { if (!cancelled) send(attempt + 1); }, delay);
      }
    };
    send();
    return () => { cancelled = true; };
  }, [sessionToken, expoPushToken]);

  // Registrera även den råa APNs-tokenen så backenden kan skicka direkt via
  // APNs (med apns-collapse-id) istället för Expo, vilket låter iOS *ersätta*
  // status-notisen istället för att stapla en ny per steg.
  useEffect(() => {
    if (!sessionToken || !apnsDeviceToken) return;
    let cancelled = false;
    const send = async (attempt = 0) => {
      try {
        await api.post(
          '/api/notifications/register-device',
          { token: apnsDeviceToken },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        );
        console.log('[push] APNs device token registered');
      } catch (err: any) {
        if (cancelled || attempt >= 4) {
          console.warn('[push] APNs token registration failed:', err?.response?.status, err?.response?.data || err?.message);
          return;
        }
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000);
        setTimeout(() => { if (!cancelled) send(attempt + 1); }, delay);
      }
    };
    send();
    return () => { cancelled = true; };
  }, [sessionToken, apnsDeviceToken]);

  const requestPermission = async () => {
    if (requestPermissionRef.current) {
      return await requestPermissionRef.current();
    }
    return false;
  };

  return { expoPushToken, notification, requestPermission, initialNotificationData };
}
