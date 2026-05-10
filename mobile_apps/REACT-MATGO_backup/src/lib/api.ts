import axios from "axios";
import type { PublicDeal } from "../types";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://palmy-production-2021.up.railway.app";
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_URL;
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || "https://web-production-67f45.up.railway.app";
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  "pk_live_51I3pwDKdGKs9NoqFOB3IsKFwX9sKQQlU7U9Wpqf6FSPQhcH6tAXGFg671LIkJcldt2nw3XTubrNthBRtfXE7kV2D00KI4qzbJ9";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

export function getImageUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

export function formatDealReward(deal: PublicDeal) {
  if (deal.discountType === "FIXED") {
    return `${deal.discountValue} kr rabatt`;
  }
  return `${deal.discountValue}% rabatt`;
}
