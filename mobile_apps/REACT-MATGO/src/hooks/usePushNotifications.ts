import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';

export function usePushNotifications(sessionToken: string | null) {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
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
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    };

    requestPermissionRef.current = requestPushPermissionManual;

    // Anropas när man tar emot en notis (medan appen är öppen)
    notificationListener.current = Notifications.addNotificationReceivedListener((notif) => {
      setNotification(notif);
    });

    // Anropas när man TAPPAT på en notis i notis-centret
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Användare klickade på notifikationen:', response);
      // TODO: Hantera navigering (Deeplink) här om `response.notification.request.content.data` innehåller route-info
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

  const requestPermission = async () => {
    if (requestPermissionRef.current) {
      return await requestPermissionRef.current();
    }
    return false;
  };

  return { expoPushToken, notification, requestPermission };
}
