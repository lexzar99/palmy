"use client";

import axios, { AxiosRequestConfig } from "axios";

export const api = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  // The HttpOnly admin cookie is the only credential used by the frontend.
  withCredentials: true,
});

// Safari reports transient network drops as "Load failed". Retry safe reads
// once so a brief radio/Wi-Fi handover does not break an admin screen.
api.interceptors.response.use(undefined, async (error) => {
  const config = error?.config as (AxiosRequestConfig & { __networkRetry?: boolean }) | undefined;
  const isNetworkFailure = !error?.response && Boolean(error?.request);
  const method = String(config?.method || "get").toLowerCase();
  if (config && isNetworkFailure && method === "get" && !config.__networkRetry) {
    config.__networkRetry = true;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return api.request(config);
  }
  return Promise.reject(error);
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
