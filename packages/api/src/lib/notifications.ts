import axios from 'axios';
import prisma from './prisma';

/**
 * Skickar push-notiser via Expo's Push API
 * Vi använder axios direkt istället för expo-server-sdk för att undvika beroendeproblem i miljön.
 */
export async function sendPushNotification(tokens: string[], title: string, body: string, data?: any) {
  if (tokens.length === 0) return [];

  const messages = tokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
    channelId: 'default',
    // Wake the iOS app briefly when the push arrives so JS can run a short
    // task — used to keep the Live Activity / Dynamic Island in sync without
    // depending on the user opening the app. Combined with normal alert
    // fields this gives both: visible banner + ~30s background JS execution.
    _contentAvailable: true,
    mutableContent: true,
  }));

  try {
    // Expo rekommenderar max 100 meddelanden per anrop
    const response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error('❌ Expo Push Error:', error);
    throw error;
  }
}

/**
 * Skickar push till ALLA registrerade användare
 */
export async function sendToAllUsers(title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: { 
      pushToken: { not: null },
      isActive: true 
    },
    select: { pushToken: true }
  });

  const tokens = users
    .map(u => u.pushToken as string)
    .filter(t => t && t.startsWith('ExponentPushToken'));

  if (tokens.length === 0) {
    return { success: true, count: 0 };
  }

  // Dela upp i chunks om 100st (Expos limit)
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  const results = await Promise.all(
    chunks.map(chunk => sendPushNotification(chunk, title, body, data))
  );

  return { 
    success: true, 
    count: tokens.length, 
    chunks: chunks.length 
  };
}
