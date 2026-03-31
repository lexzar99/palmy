"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { playNotificationSound, primeNotificationAudio } from "@/lib/notificationSounds";

export default function AdminRealtimeBridge() {
  const [soundId, setSoundId] = useState("signal-1");
  const [pendingCount, setPendingCount] = useState(0);
  const soundIdRef = useRef("signal-1");
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<number | null>(null);
  const soundLoopRef = useRef<number | null>(null);

  useEffect(() => {
    soundIdRef.current = soundId;
  }, [soundId]);

  const syncPendingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("palmyra_token") || "";
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const nextPendingIds = new Set<string>(
        (res.data.orders || [])
          .filter((order: any) => order.status === "PENDING")
          .map((order: any) => order.id as string),
      );

      const previousPendingIds = pendingIdsRef.current;
      pendingIdsRef.current = nextPendingIds;
      setPendingCount(nextPendingIds.size);
    } catch {
      // Ignore transient network errors; the socket or next poll will recover.
    }
  }, []);

  useEffect(() => {
    if (soundLoopRef.current) {
      window.clearInterval(soundLoopRef.current);
      soundLoopRef.current = null;
    }

    if (pendingCount <= 0) {
      return () => {
        if (soundLoopRef.current) {
          window.clearInterval(soundLoopRef.current);
          soundLoopRef.current = null;
        }
      };
    }

    void playNotificationSound(soundIdRef.current);
    soundLoopRef.current = window.setInterval(() => {
      void playNotificationSound(soundIdRef.current);
    }, 7000);

    return () => {
      if (soundLoopRef.current) {
        window.clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
    };
  }, [pendingCount]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRes = await axios.get(`${API_URL}/api/settings`);
        setSoundId(settingsRes.data.notificationSound || "signal-1");
      } catch {
        // Keep the current sound if settings fetch fails.
      }
    };

    const prime = () => {
      void primeNotificationAudio();
    };

    window.addEventListener("pointerdown", prime, { passive: true });
    window.addEventListener("keydown", prime);

    void loadSettings();
    void syncPendingOrders();

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    const joinAdminRoom = () => {
      socket.emit("join:admin");
      void syncPendingOrders();
    };

    socket.on("connect", joinAdminRoom);

    socket.on("order:new", (order: any) => {
      if (!order?.id || order.status !== "PENDING") {
        void syncPendingOrders();
        return;
      }

      if (!pendingIdsRef.current.has(order.id)) {
        pendingIdsRef.current.add(order.id);
        setPendingCount(pendingIdsRef.current.size);
      }
    });

    socket.on("order:updated", (payload: any) => {
      if (!payload?.orderId || !payload?.status) {
        void syncPendingOrders();
        return;
      }

      if (payload.status === "PENDING") {
        pendingIdsRef.current.add(payload.orderId);
      } else {
        pendingIdsRef.current.delete(payload.orderId);
      }

      setPendingCount(pendingIdsRef.current.size);
    });

    socket.on("settings:updated", (data: any) => {
      setSoundId(data.notificationSound || "signal-1");
    });

    socket.on("connect_error", (error) => {
      console.warn("Admin realtime connection error:", error.message);
    });

    pollRef.current = window.setInterval(() => {
      void syncPendingOrders();
    }, 8000);

    return () => {
      socket.disconnect();
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (soundLoopRef.current) {
        window.clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
    };
  }, [syncPendingOrders]);

  return null;
}
