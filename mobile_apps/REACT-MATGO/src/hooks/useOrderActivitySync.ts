/**
 * Global Live Activity sync.
 *
 * Mounted at App level whenever there's an active order, so the Dynamic
 * Island stays in sync regardless of which screen the user is currently on
 * (LiveOrderBanner is conditionally hidden on the order detail page, which
 * previously meant statuses got "stuck" until the user backed out).
 *
 * Sources of truth, in order:
 *   1. Socket event `order:status`   (push-style, instant)
 *   2. AppState 'active' transitions (catches up after backgrounding)
 *   3. 15-second poll                (fallback if socket drops)
 *   4. Push notification handler     (wakes JS in background)
 *
 * Each path funnels into one fetch + updateOrderActivity call. The status
 * mapping is shared with the backend so the on-device LA matches whatever
 * APNs is also pushing directly into the Dynamic Island.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { api, SOCKET_URL } from '../lib/api';
import {
  endOrderActivity,
  mapServerStatusToActivity,
  updateOrderActivity,
} from '../lib/liveActivities';

export function useOrderActivitySync(orderId: string | null) {
  const lastStatus = useRef<string | null>(null);
  const lastEta = useRef<number | null>(null);

  useEffect(() => {
    if (!orderId) {
      lastStatus.current = null;
      lastEta.current = null;
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        const res = await api.get(`/api/orders/${orderId}`);
        if (cancelled) return;
        const data = res.data || {};
        const orderType: 'DELIVERY' | 'PICKUP' | undefined =
          data.orderType || data.type;
        const status: string | undefined = data.status;
        const eta: number | null = data.estimatedTime ?? null;
        const etaEndsAt: number | null = data.etaEndsAt
          ? Math.floor(new Date(data.etaEndsAt).getTime() / 1000)
          : null;
        const deliveringAt: string | null = data.deliveringAt ?? null;

        // No-op when nothing material has changed — avoids burning APNs and
        // the device's renderer with redundant updates.
        if (
          status === lastStatus.current &&
          eta === lastEta.current
        ) {
          return;
        }

        if (status) {
          const mapped = mapServerStatusToActivity(status, orderType);
          if (mapped) {
            await updateOrderActivity(orderId, mapped.status, {
              etaMinutes: eta ?? undefined,
              orderType,
              etaEndsAt,
            });
            if (mapped.ends) {
              // Belt-and-braces: also schedule the local end so the LA
              // disappears even if iOS throttled the backend's
              // `event:'end'` APNs push (which can happen when the user
              // hasn't enabled Settings → FoodGo → Live Activities →
              // Frequent Updates). Backend still pushes its own end with
              // the same dismissal-date, whichever wins is fine.
              if (mapped.status === 'delivered') {
                await endOrderActivity(orderId, {
                  dismissalSeconds: 120,
                  finalStatus: 'delivered',
                  orderType,
                });
              } else if (mapped.status === 'cancelled') {
                await endOrderActivity(orderId);
              }
            }
          }
        }
        // Suppress the unused-variable warning while keeping the field
        // around for future foreground-side decisions.
        void deliveringAt;

        lastStatus.current = status ?? null;
        lastEta.current = eta;
      } catch {
        // Silent — next poll / socket / appstate event will retry.
      }
    };

    // Initial fetch + sync.
    sync();

    // Socket — instant updates when admin changes status.
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.emit('join:order', orderId);
    socket.on('order:status', (payload: any) => {
      if (payload?.orderId === orderId) sync();
    });

    // Poll fallback — covers socket drops / server restarts.
    const poll = setInterval(sync, 15000);

    // Foreground — catch up immediately after a backgrounding window.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });

    return () => {
      cancelled = true;
      try { socket.disconnect(); } catch {}
      clearInterval(poll);
      appStateSub.remove();
    };
  }, [orderId]);
}
