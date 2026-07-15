"use client";

import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/shared/api/client";
import { setStoredAdminSession, type StoredAdminSession } from "@/shared/auth/storage";

export interface VerifiedAdminSession extends StoredAdminSession {}

export const adminSessionQueryKey = ["admin-session"] as const;

export async function verifyAdminSession() {
  const response = await apiPost<{ valid: boolean; admin?: VerifiedAdminSession }>("/account/verify");
  if (!response.valid || !response.admin) {
    throw new Error("SESSION_VERIFICATION_REJECTED");
  }

  setStoredAdminSession(response.admin);
  return response.admin;
}

export function isAuthoritativeAuthError(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export function useAdminSession() {
  return useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: verifyAdminSession,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}
