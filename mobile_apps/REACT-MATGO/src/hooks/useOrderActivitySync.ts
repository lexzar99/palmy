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
 *   3. 60-second poll                (only used while the socket is down)
 *   4. Push notification handler     (wakes JS in background)
 *
 * Each path funnels into one fetch + updateOrderActivity call. The status
 * mapping is shared with the backend so the on-device LA matches whatever
 * APNs is also pushing directly into the Dynamic Island.
 *
 * On-the-way auto-dismiss: once the order has been DELIVERING for 20 min AND
 * the visible countdown has expired, both the in-app banner and the LA bow
 * out — even if the backend hasn't flipped the status to DELIVERED yet. This
 * mirrors the heuristic the backend LA-finaliser uses.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, SOCKET_URL } from '../lib/api';
import {
  endOrderActivity,
  mapServerStatusToActivity,
  updateOrderActivity,
} from '../lib/liveActivities';
import { evaluateOnTheWayDismiss, evaluateOnTheWayComplete } from '../lib/orderTiming';
import { scheduleReviewNotification } from '../lib/reviewNotification';
import { useAppStore } from '../store/useAppStore';

export function useOrderActivitySync(orderId: string | null) {
  const lastStatus = useRef<string | null>(null);
  const lastEta = useRef<number | null>(null);
  const lastEtaEndsAt = useRef<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setActiveOrder = useAppStore((s) => s.setActiveOrder);
  const setActiveOrderData = useAppStore((s) => s.setActiveOrderData);
  const token = useAppStore((s) => s.token);
  // Always read the latest token at call-time — the user can sign in / out
  // between mount and the next sync tick.
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!orderId) {
      lastStatus.current = null;
      lastEta.current = null;
      lastEtaEndsAt.current = null;
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      if (completeTimer.current) {
        clearTimeout(completeTimer.current);
        completeTimer.current = null;
      }
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const scheduleDismiss = (
      status: string,
      deliveringAt: string | null,
      etaEndsAt: number | null,
    ) => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      const verdict = evaluateOnTheWayDismiss({ status, deliveringAt, etaEndsAt });
      if (verdict.ready) {
        runAutoDismiss();
        return;
      }
      if (verdict.msUntilReady != null) {
        dismissTimer.current = setTimeout(runAutoDismiss, verdict.msUntilReady);
      }
    };

    /**
     * Schedules the *auto-DELIVERED* edge — 2 minutes after the on-the-way
     * dismiss window. When this fires we treat the order as delivered
     * client-side: flip the cached snapshot to DELIVERED, fire a local
     * review notification, and let the rest of the dismiss path run.
     */
    const scheduleComplete = (
      status: string,
      deliveringAt: string | null,
      etaEndsAt: number | null,
      restaurantName: string | null,
    ) => {
      if (completeTimer.current) {
        clearTimeout(completeTimer.current);
        completeTimer.current = null;
      }
      const verdict = evaluateOnTheWayComplete({ status, deliveringAt, etaEndsAt });
      const fire = () => {
        if (cancelled || !orderId) return;
        // Flip the cached snapshot so any UI mounted on a stale screen sees
        // DELIVERED right away. Backend will catch up on its next sync.
        const current = useAppStore.getState().activeOrder;
        if (current && current.id != null && String(current.id) === String(orderId)) {
          setActiveOrderData({ ...current, status: 'DELIVERED' });
        }
        endOrderActivity(orderId).catch(() => {});
        void scheduleReviewNotification(orderId, restaurantName);
        setActiveOrder(null);
      };
      if (verdict.ready) {
        fire();
        return;
      }
      if (verdict.msUntilReady != null) {
        completeTimer.current = setTimeout(fire, verdict.msUntilReady);
      }
    };

    const runAutoDismiss = () => {
      if (cancelled || !orderId) return;
      // Belt-and-braces: re-confirm with a fresh fetch before tearing
      // anything down so we don't dismiss against a status the server has
      // since walked back.
      api.get(`/api/orders/${orderId}`, tokenRef.current ? { headers: { Authorization: `Bearer ${tokenRef.current}` } } : undefined)
        .then((res) => {
          if (cancelled) return;
          const data = res.data || {};
          const status: string = data.status;
          const deliveringAt: string | null = data.deliveringAt ?? null;
          const etaEndsAt: number | null = data.etaEndsAt
            ? Math.floor(new Date(data.etaEndsAt).getTime() / 1000)
            : null;
          const verdict = evaluateOnTheWayDismiss({ status, deliveringAt, etaEndsAt });
          if (!verdict.ready) {
            // Server says we're still mid-delivery — re-arm.
            scheduleDismiss(status, deliveringAt, etaEndsAt);
            return;
          }
          endOrderActivity(orderId).catch(() => {});
          setActiveOrder(null);
        })
        .catch(() => {
          // Couldn't reach the server — dismiss anyway, the timer is the
          // user-visible source of truth at this point.
          endOrderActivity(orderId).catch(() => {});
          setActiveOrder(null);
        });
    };

    const sync = async () => {
      try {
        const headers = tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : undefined;
        const res = await api.get(`/api/orders/${orderId}`, headers ? { headers } : undefined);
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

        // Push the freshest snapshot into the store so the in-app banner
        // can render without running its own fetch / socket / poll loop.
        setActiveOrderData(data);

        // ── Terminal-status fast path ──────────────────────────────────────
        // Runs BEFORE the no-op check so a duplicate DELIVERED payload
        // (e.g. the socket fires twice, or the poll catches the same state)
        // still fires the dismiss exactly once per session. We track via a
        // separate flag instead of `lastStatus` so the no-op gate below can
        // still de-dupe non-terminal statuses.
        if (status) {
          const mapped = mapServerStatusToActivity(status, orderType);
          if (mapped?.ends) {
            if (dismissTimer.current) {
              clearTimeout(dismissTimer.current);
              dismissTimer.current = null;
            }
            if (completeTimer.current) {
              clearTimeout(completeTimer.current);
              completeTimer.current = null;
            }
            await endOrderActivity(orderId);
            // Only fire the review nudge for happy-path completions —
            // not for cancellations / failures.
            if (status === 'DELIVERED' || status === 'COMPLETED') {
              void scheduleReviewNotification(orderId, data.restaurantName ?? null);
            }
            setActiveOrder(null);
            lastStatus.current = status;
            lastEta.current = eta;
            lastEtaEndsAt.current = etaEndsAt;
            return;
          }
        }

        // Always (re)arm the dismiss + auto-complete timers based on the
        // freshest server data — even if `status` itself didn't change,
        // deliveringAt or etaEndsAt might have moved.
        if (status) {
          scheduleDismiss(status, deliveringAt, etaEndsAt);
          scheduleComplete(status, deliveringAt, etaEndsAt, data.restaurantName ?? null);
        }

        // No-op when nothing material has changed — avoids burning APNs and
        // the device's renderer with redundant updates. etaEndsAt is part of
        // the comparison now so a fresh countdown actually propagates.
        if (
          status === lastStatus.current &&
          eta === lastEta.current &&
          etaEndsAt === lastEtaEndsAt.current
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
          }
        }

        lastStatus.current = status ?? null;
        lastEta.current = eta;
        lastEtaEndsAt.current = etaEndsAt;
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
      // If the socket payload itself signals a terminal status, dismiss
      // immediately rather than waiting for the follow-up GET — the GET can
      // race against an HTTP cache and return the stale pre-DELIVERED row,
      // which would silently no-op us into never dismissing the LA.
      const terminal = ['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'DELIVERY_FAILED'];
      if (typeof payload?.status === 'string' && terminal.includes(payload.status)) {
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
        if (completeTimer.current) {
          clearTimeout(completeTimer.current);
          completeTimer.current = null;
        }
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

    // Poll fallback — only runs while the socket is down. Keeping the cadence
    // longer than the original 15 s because we now share state with the
    // banner (no more dual-fetch storms).
    pollInterval = setInterval(() => {
      if (!socket?.connected) sync();
    }, 60000);

    // Foreground — catch up immediately after a backgrounding window.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });

    return () => {
      cancelled = true;
      try { socket?.disconnect(); } catch {}
      if (pollInterval) clearInterval(pollInterval);
      appStateSub.remove();
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      if (completeTimer.current) {
        clearTimeout(completeTimer.current);
        completeTimer.current = null;
      }
    };
  }, [orderId, setActiveOrder, setActiveOrderData]);
}
