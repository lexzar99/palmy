"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { getStoredAdmin } from "@/shared/auth/storage";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";

export function RealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const admin = getStoredAdmin();
    const socket = io(typeof window !== "undefined" ? window.location.origin : "", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
    });

    const invalidateOperationalQueries = () => {
      void invalidateEconomyDomain(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    };

    socket.on("connect", () => {
      if (admin?.restaurantId && admin.role !== "SUPER_ADMIN") {
        socket.emit("join:admin", { restaurantId: admin.restaurantId });
      } else {
        socket.emit("join:admin");
      }
    });

    socket.on("order:new", invalidateOperationalQueries);
    socket.on("order:updated", invalidateOperationalQueries);
    socket.on("settings:updated", () => {
      void invalidateEconomyDomain(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["zones"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return null;
}
