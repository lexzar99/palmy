/**
 * In-app order banner sync — also drives the iOS Live Activity in foreground.
 *
 * Architecture (belt-and-braces):
 *   1. Backend pushes APNs `liveactivity` updates whenever admin changes the
 *      status. That's the path that runs when the app is killed / locked /
 *      backgrounded > 30 s.
 *   2. *This hook* additionally calls `updateOrderActivity` from JS whenever
 *      a socket / poll fetch reports a status change. That's the path that
 *      runs when the app is alive — and it does NOT depend on iOS Frequent-
 *      Updates being enabled, on Railway env vars being set correctly, or on
 *      APNs not being throttled. So the LA always follows the in-app banner
 *      while the app is open, and APNs handles the killed-app case.
 *
 *   Dismissal stays backend-only (APNs `event: end` + the native auto-end
 *   Task in Swift). That keeps the dismiss path decoupled from this hook —
 *   a stalled banner fetch can't freeze the LA the way it used to in
 *   commit ce3fa6e and earlier.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, SOCKET_URL } from '../lib/api';
import {
  mapServerStatusToActivity,
  updateOrderActivity,
} from '../lib/liveActivities';
import { scheduleReviewNotification } from '../lib/reviewNotification';
import { useAppStore } from '../store/useAppStore';

export function useOrderActivitySync(orderId: string | null) {
  const setActiveOrder = useAppStore((s) => s.setActiveOrder);
  const setActiveOrderData = useAppStore((s) => s.setActiveOrderData);
  const token = useAppStore((s) => s.token);
  // Always read the latest token at call-time — the user can sign in / out
  // between mount and the next sync tick.
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    let socket: Socket | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const sync = async () => {
      try {
        const headers = tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : undefined;
        const res = await api.get(`/api/orders/${orderId}`, headers ? { headers } : undefined);
        if (cancelled) return;
        const data = res.data || {};
        const orderType: 'DELIVERY' | 'PICKUP' | undefined = data.orderType || data.type;
        const status: string | undefined = data.status;

        // Mirror the snapshot into the store so the in-app banner renders.
        setActiveOrderData(data);

        if (status) {
          const mapped = mapServerStatusToActivity(status, orderType);
          if (mapped && mapped.ends) {
            // Terminal: leave dismissal to the backend APNs `event: end`
            // push + the native auto-end Task in Swift. Doing
            // endOrderActivity from JS used to freeze the LA when this fetch
            // stalled (ce3fa6e regression).
            if (status === 'DELIVERED' || status === 'COMPLETED') {
              void scheduleReviewNotification(orderId, data.restaurantName ?? null);
            }
            setActiveOrder(null);
          } else if (mapped) {
            // Foreground LA update: drive the Dynamic Island from JS while
            // the app is alive. Belt-and-braces with the backend APNs
            // push — whichever delivers first wins; the second is a no-op
            // (idempotent state apply).
            const etaEndsAtSec =
              typeof data.etaEndsAt === 'string'
                ? Math.floor(new Date(data.etaEndsAt).getTime() / 1000)
                : null;
            void updateOrderActivity(orderId, mapped.status, {
              etaMinutes: typeof data.estimatedTime === 'number' ? data.estimatedTime : undefined,
              orderType,
              etaEndsAt: etaEndsAtSec,
            });
          }
        }
      } catch {
        // Silent — next poll / socket / appstate event will retry.
      }
    };

    // Initial fetch + sync.
    sync();

    // Socket — instant updates when admin changes status.
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.emit('join:order', orderId);
    socket.on('order:status', (payload: any) => {
      if (payload?.orderId !== orderId) return;
      const terminal = ['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'DELIVERY_FAILED'];
      if (typeof payload?.status === 'string' && terminal.includes(payload.status)) {
        // Banner-only — do not call endOrderActivity. Backend handles LA dismiss.
        if (payload.status === 'DELIVERED' || payload.status === 'COMPLETED') {
          const cached = useAppStore.getState().activeOrder;
          void scheduleReviewNotification(orderId, cached?.restaurantName ?? null);
        }
        setActiveOrder(null);
        return;
      }
      sync();
    });

    // Poll fallback for the in-app banner — only runs when the socket is
    // down. NOT used for LA updates; that's APNs only.
    pollInterval = setInterval(() => {
      if (!socket?.connected) sync();
    }, 60000);

    // Foreground — refresh the banner data after a backgrounding window.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });

    return () => {
      cancelled = true;
      try { socket?.disconnect(); } catch {}
      if (pollInterval) clearInterval(pollInterval);
      appStateSub.remove();
    };
  }, [orderId, setActiveOrder, setActiveOrderData]);
}
