import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';

export function usePushNotifications(sessionToken: string | null) {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

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

      // We skip push setup on Web or if permissions are not granted
      if (Platform.OS === 'web') return null;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('Tillåtelse för push-notiser saknas!');
        return null;
      }

      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) {
          throw new Error('Project ID saknas i app.json (eas.projectId)');
        }

        token = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
      } catch (e) {
        console.warn('Misslyckades att hämta Push Token:', e);
      }

      return token;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (active && token) {
        setExpoPushToken(token);
      }
    });

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
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
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

  return { expoPushToken, notification };
}
