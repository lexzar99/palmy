"use client";

import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/shared/api/client";
import { clearStoredAdminSession, getStoredToken, setStoredAdminSession, type StoredAdminSession } from "@/shared/auth/storage";

export interface VerifiedAdminSession extends StoredAdminSession {}

export const adminSessionQueryKey = ["admin-session"] as const;

export async function verifyAdminSession() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("NO_SESSION");
  }

  const response = await apiPost<{ valid: boolean; admin?: VerifiedAdminSession }>("/account/verify", { token });
  if (!response.valid || !response.admin) {
    clearStoredAdminSession();
    throw new Error("INVALID_SESSION");
  }

  setStoredAdminSession(token, response.admin);
  return response.admin;
}

export function useAdminSession() {
  return useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: verifyAdminSession,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}
