"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { emitToast } from "@/shared/components/toast";

// Plockar ut ett läsbart felmeddelande ur ett axios/fetch-fel.
function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return (
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.message ||
    "Något gick fel — försök igen."
  );
}

// Per-mutation-styrning via React Querys `meta`:
//   meta: { toast: false }            → tyst (modulen visar egen toast)
//   meta: { successMessage: "..." }   → custom success-text
//   meta: { errorMessage: "..." }     → custom error-text
type MutationToastMeta = { toast?: boolean; successMessage?: string; errorMessage?: string };

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Global feedback på ALLA mutationer (spara/ta bort/skicka) så hela
        // admin alltid visar grönt vid lyckat och rött vid fel. Moduler med
        // egna toasts opt:ar ut med meta.toast=false.
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            const meta = (mutation.options.meta || {}) as MutationToastMeta;
            if (meta.toast === false) return;
            emitToast({ type: "success", message: meta.successMessage || "Sparat" });
          },
          onError: (error, _vars, _ctx, mutation) => {
            const meta = (mutation.options.meta || {}) as MutationToastMeta;
            if (meta.toast === false) return;
            emitToast({ type: "error", message: meta.errorMessage || extractErrorMessage(error) });
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
