import axios from "axios";
import type { PublicDeal } from "../types";
import {
  EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SOCKET_URL,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_WEB_URL,
} from "./env";

export const API_URL = EXPO_PUBLIC_API_URL;
export const SOCKET_URL = EXPO_PUBLIC_SOCKET_URL || API_URL;
export const WEB_URL = EXPO_PUBLIC_WEB_URL;
export const STRIPE_PUBLISHABLE_KEY = EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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
