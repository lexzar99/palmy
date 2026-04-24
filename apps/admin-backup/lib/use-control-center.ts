"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useRestaurantStore } from "@/store/restaurantStore";

export interface ControlCenterSummary {
  todayRevenue: number;
  todayOrders: number;
  liveOrders: number;
  openRestaurants: number;
  totalRestaurants: number;
  activeCustomers: number;
  monthlyPayoutExposure: number;
  avgTicket: number;
  avgRating: number;
  registeredCustomers?: number;
}

export interface ControlCenterRestaurantSnapshot {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  featuredClass: number;
  featuredLabel: string;
  isOpen: boolean;
  manualIsOpen: boolean;
  adminEmail: string | null;
  hasHours: boolean;
  hasVisuals: boolean;
  etaMinutes: number;
  deliveryFee: number;
  minOrderAmount: number;
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  liveOrders: number;
  pendingOrders: number;
  avgOrderValue: number;
  reviewScore: number;
  reviewCount: number;
  payoutEstimate: number;
  commissionEstimate: number;
  subscriptionEstimate: number;
  refundsLast30d: number;
  focus: string;
  updatedAt: string;
}

export interface ControlCenterAlert {
  id: string;
  severity: "high" | "medium" | "info";
  domain: "ops" | "finance" | "security" | "quality";
  title: string;
  description: string;
  restaurantId?: string;
}

export interface ControlCenterData {
  scope: { restaurantId: string | null; isSuperAdmin: boolean };
  summary: ControlCenterSummary;
  liveStatusCounts: Record<string, number>;
  trend: Array<{ label: string; revenue: number; orders: number }>;
  paymentMix: Array<{ method: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  recentReviews: Array<{
    id: string;
    restaurantName: string | null;
    customerName: string;
    rating: number;
    review: string;
    reviewedAt: string;
  }>;
  customerSignals: Array<{
    id: string;
    label: string;
    phone: string | null;
    totalSpent: number;
    orders: number;
    lastOrderAt: string;
    favoriteRestaurant: string | null;
    refundCount: number;
    verified: boolean;
  }>;
  restaurantSnapshots: ControlCenterRestaurantSnapshot[];
  payoutQueue: Array<{
    restaurantId: string;
    name: string;
    city?: string | null;
    featuredClass: number;
    featuredLabel: string;
    grossSales: number;
    orderCount: number;
    commission: number;
    subscription: number;
    payout: number;
    readiness: "ready" | "action";
  }>;
  alerts: ControlCenterAlert[];
  security: {
    loginRateLimit: boolean;
    verifyRateLimit: boolean;
    socketGuard: boolean;
    uploadGuard: boolean;
    cloudinaryConfigured: boolean;
    aliasSync: boolean;
    notes: string[];
  };
}

export const useControlCenter = () => {
  const { selectedRestaurantId } = useRestaurantStore();
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      setError("Ingen aktiv admin-session hittades.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_URL}/api/admin/control-center`, {
        headers: { Authorization: `Bearer ${token}` },
        params: selectedRestaurantId ? { restaurantId: selectedRestaurantId } : undefined,
      });
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Kunde inte ladda kontrollcentret.");
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    selectedRestaurantId,
  };
};
