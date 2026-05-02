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
    // NB: NO `_contentAvailable` here. Combining alert + content-available
    // sometimes makes iOS deliver the push silently (sound but no banner).
    // LiveActivity stays in sync via the dedicated APNs push-to-update path.
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
 * Skickar push till en specifik användare (via id, email eller telefon)
 */
export async function sendToUser(identifier: string, title: string, body: string, data?: any) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: identifier },
        { email: identifier },
        { phone: identifier },
      ],
      deletedAt: null,
    },
    select: { pushToken: true, id: true },
  });

  if (!user?.pushToken || !user.pushToken.startsWith('ExponentPushToken')) {
    return { success: false, count: 0, error: 'Användaren har ingen push-token registrerad' };
  }

  await sendPushNotification([user.pushToken], title, body, data);
  return { success: true, count: 1 };
}

/**
 * Skickar push till alla användare i en specifik stad
 */
export async function sendToCity(city: string, title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: {
      city: { contains: city, mode: 'insensitive' },
      pushToken: { not: null },
      isActive: true,
      deletedAt: null,
    },
    select: { pushToken: true },
  });

  const tokens = users
    .map((u) => u.pushToken as string)
    .filter((t) => t && t.startsWith('ExponentPushToken'));

  if (tokens.length === 0) {
    return { success: true, count: 0 };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  await Promise.all(chunks.map((chunk) => sendPushNotification(chunk, title, body, data)));
  return { success: true, count: tokens.length, chunks: chunks.length };
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
