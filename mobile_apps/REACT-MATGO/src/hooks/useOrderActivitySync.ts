/**
 * Global order sync — keeps the in-app banner data fresh and the Live
 * Activity dismissed at the right moment. This hook NEVER pushes state into
 * the Live Activity; that is the backend's job exclusively (APNs liveactivity
 * push topic). React Native cannot reliably drive ActivityKit updates when
 * the app is backgrounded or killed, so we don't try.
 *
 * What the hook still owns:
 *   - Mirroring fresh /api/orders/:id snapshots into the Zustand store so the
 *     LiveOrderBanner inside the app renders correctly
 *   - Calling endOrderActivity locally as a *dismiss* shortcut when the
 *     server-side state has clearly moved to a terminal status. The LA push
 *     pipeline already does this, but a foreground call gives an instant
 *     dismiss without waiting for APNs.
 *   - Scheduling the local review notification on DELIVERED.
 *
 * What the hook no longer does:
 *   - Calling updateOrderActivity. Removed in the rewrite — Swift renders
 *     whatever the backend last pushed.
 *   - Auto-flipping the order to DELIVERED client-side; the backend's
 *     liveActivityFinalize tick + heartbeat owns that lifecycle now.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, SOCKET_URL } from '../lib/api';
import { endOrderActivity, mapServerStatusToActivity } from '../lib/liveActivities';
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

        // Foreground dismiss shortcut for terminal status. Backend's LA
        // push pipeline ends the activity too — this just gives an instant
        // foreground dismiss without waiting for APNs round-trip.
        if (status) {
          const mapped = mapServerStatusToActivity(status, orderType);
          if (mapped?.ends) {
            await endOrderActivity(orderId);
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
        endOrderActivity(orderId).catch(() => {});
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
