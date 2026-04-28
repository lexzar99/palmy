import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';
import { updateOrderActivity, mapServerStatusToActivity, endOrderActivity } from '../lib/liveActivities';

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

    // Anropas när man tar emot en notis. Med _contentAvailable=true från
    // servern fyrar denna även när appen är i bakgrunden (~30s wake-window),
    // vilket vi använder för att hålla Live Activity i Dynamic Island i sync
    // utan att kräva att kunden öppnar appen.
    notificationListener.current = Notifications.addNotificationReceivedListener(async (notif) => {
      setNotification(notif);
      try {
        const data = (notif?.request?.content?.data || {}) as Record<string, any>;
        const orderId: string | undefined = data?.orderId;
        const status: string | undefined = data?.status;
        if (orderId && status) {
          // Hämta order-typ via API för att veta om READY ska mappas till
          // pickup eller delivery i widgeten.
          let orderType: string | undefined;
          try {
            const res = await api.get(`/api/orders/${orderId}`);
            orderType = res.data?.orderType || res.data?.type;
          } catch {}
          const mapped = mapServerStatusToActivity(status, orderType as any);
          if (mapped) {
            if (mapped.ends) {
              await updateOrderActivity(orderId, mapped.status, {});
              await endOrderActivity(orderId);
            } else {
              await updateOrderActivity(orderId, mapped.status, {});
            }
          }
        }
      } catch {}
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

    return () => {
      active = false;
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
      requestPermissionRef.current = null;
    };
  }, []);

  // Skicka push token till databasen så fort vi har ett token och en inloggad användare
  useEffect(() => {
    if (sessionToken && expoPushToken) {
      api.post(
        '/api/notifications/register',
        { token: expoPushToken },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      ).catch((err) => console.warn('Kunde inte skicka push token till servern:', err));
    }
  }, [sessionToken, expoPushToken]);

  // Registrera även den råa APNs-tokenen så backenden kan skicka direkt via
  // APNs (med apns-collapse-id) istället för Expo, vilket låter iOS *ersätta*
  // status-notisen istället för att stapla en ny per steg.
  useEffect(() => {
    if (sessionToken && apnsDeviceToken) {
      console.log('[push] Registering APNs device token (len=' + apnsDeviceToken.length + ')');
      api.post(
        '/api/notifications/register-device',
        { token: apnsDeviceToken },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      )
        .then(() => console.log('[push] APNs device token registered'))
        .catch((err) => {
          console.warn('[push] APNs token registration failed:', err?.response?.status, err?.response?.data || err?.message);
        });
    }
  }, [sessionToken, apnsDeviceToken]);

  const requestPermission = async () => {
    if (requestPermissionRef.current) {
      return await requestPermissionRef.current();
    }
    return false;
  };

  return { expoPushToken, notification, requestPermission, initialNotificationData };
}
