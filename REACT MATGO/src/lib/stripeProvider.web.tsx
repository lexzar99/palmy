import React from "react";

export function AppStripeProvider({ children }: { children: React.ReactNode; publishableKey: string; urlScheme: string }) {
  return <>{children}</>;
}

export function useAppPaymentSheet() {
  return {
    initPaymentSheet: async (_options?: unknown) => ({
      error: { message: "Stripe PaymentSheet is available on native iOS and Android builds." },
    }),
    presentPaymentSheet: async (_options?: unknown) => ({
      error: { message: "Stripe PaymentSheet is available on native iOS and Android builds." },
    }),
  };
}
