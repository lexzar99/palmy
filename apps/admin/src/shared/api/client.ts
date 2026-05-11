"use client";

import axios, { AxiosRequestConfig } from "axios";
import { getStoredToken } from "@/shared/auth/storage";

export const api = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  // withCredentials = skicka cookies (admin_token HttpOnly) med alla requests.
  // Krävs för cookie-baserad auth efter migration från localStorage.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // Skickar fortfarande Bearer-token om en gammal session finns kvar i
  // localStorage. När alla klienter migrerat går detta ta bort — backend
  // läser cookie först ändå.
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getApiUrl = <T,>(url: string) => `/api${url.startsWith("/") ? url : `/${url}`}` as T extends string ? T : string;

export async function apiGet<T>(url: string, config?: AxiosRequestConfig) {
  const response = await api.get<T>(getApiUrl<string>(url), config);
  return response.data;
}

export async function apiPost<T>(url: string, payload?: unknown, config?: AxiosRequestConfig) {
  const response = await api.post<T>(getApiUrl<string>(url), payload, config);
  return response.data;
}

export async function apiPatch<T>(url: string, payload?: unknown, config?: AxiosRequestConfig) {
  const response = await api.patch<T>(getApiUrl<string>(url), payload, config);
  return response.data;
}

export async function apiPut<T>(url: string, payload?: unknown, config?: AxiosRequestConfig) {
  const response = await api.put<T>(getApiUrl<string>(url), payload, config);
  return response.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig) {
  const response = await api.delete<T>(getApiUrl<string>(url), config);
  return response.data;
}
