/**
 * In-app order banner sync. Strictly UI — DOES NOT TOUCH THE LIVE ACTIVITY.
 *
 * The Live Activity is owned exclusively by the backend over the APNs
 * `liveactivity` topic, with a native auto-end Task in Swift as a local
 * fallback for the dismiss timing. JS only calls startOrderActivity once at
 * order placement (CartScreen) and that's it — no update, no end. Coupling
 * the LA to this hook is exactly what made it freeze when the in-app banner
 * fetch stalled, since the hook's terminal-status branch was the dismiss
 * trigger. They are now fully decoupled.
 *
 * What this hook does:
 *   - Mirrors fresh /api/orders/:id snapshots into the Zustand store so the
 *     LiveOrderBanner can render the latest state.
 *   - Schedules the local review notification on DELIVERED so the customer
 *     gets a "Vad tyckte du?" prompt regardless of LA dismissal timing.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, SOCKET_URL } from '../lib/api';
import { mapServerStatusToActivity } from '../lib/liveActivities';
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

        // Banner-only terminal handling. We do NOT touch the Live Activity
        // here — it dismisses itself via the backend APNs end push and the
        // native scheduled auto-end Task. Decoupling them means a stalled
        // banner fetch can never freeze the LA.
        if (status) {
          const mapped = mapServerStatusToActivity(status, orderType);
          if (mapped?.ends) {
            if (status === 'DELIVERED' || status === 'COMPLETED') {
              void scheduleReviewNotification(orderId, data.restaurantName ?? null);
            }
            setActiveOrder(null);
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
