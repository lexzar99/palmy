import axios from 'axios';
import prisma from './prisma';

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface SendResult {
  sent: number;
  errors: number;
}

export async function sendPushNotification(tokens: string[], title: string, body: string, data?: any): Promise<SendResult> {
  if (tokens.length === 0) return { sent: 0, errors: 0 };

  const messages = tokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
    channelId: 'default',
  }));

  const response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
    headers: {
      'Accept': 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
  });

  const tickets: ExpoTicket[] = response.data?.data || [];
  let sent = 0;
  let errors = 0;

  for (const ticket of tickets) {
    if (ticket.status === 'ok') {
      sent++;
    } else {
      errors++;
      console.error(`❌ Expo ticket error: ${ticket.message}`, ticket.details);
    }
  }

  if (errors > 0) {
    console.warn(`⚠️ Expo Push: ${sent} ok, ${errors} errors out of ${tickets.length} tickets`);
  }

  return { sent, errors };
}

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
    return { success: false, count: 0, errors: 0, error: 'Användaren har ingen push-token registrerad' };
  }

  const result = await sendPushNotification([user.pushToken], title, body, data);
  return { success: result.errors === 0, count: result.sent, errors: result.errors };
}

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
    return { success: true, count: 0, errors: 0 };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  const results = await Promise.all(chunks.map((chunk) => sendPushNotification(chunk, title, body, data)));
  const sent = results.reduce((s, r) => s + r.sent, 0);
  const errors = results.reduce((s, r) => s + r.errors, 0);
  return { success: errors === 0, count: sent, errors, chunks: chunks.length };
}

export async function sendToAllUsers(title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      isActive: true,
      deletedAt: null,
    },
    select: { pushToken: true },
  });

  const tokens = users
    .map(u => u.pushToken as string)
    .filter(t => t && t.startsWith('ExponentPushToken'));

  if (tokens.length === 0) {
    return { success: true, count: 0, errors: 0 };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  const results = await Promise.all(chunks.map(chunk => sendPushNotification(chunk, title, body, data)));
  const sent = results.reduce((s, r) => s + r.sent, 0);
  const errors = results.reduce((s, r) => s + r.errors, 0);
  return { success: errors === 0, count: sent, errors, chunks: chunks.length };
}
