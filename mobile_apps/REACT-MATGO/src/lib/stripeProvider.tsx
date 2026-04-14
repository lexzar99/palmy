import React from "react";
import { Alert, Platform } from "react-native";

export function AppStripeProvider({ children }: { children: React.ReactNode; publishableKey: string; urlScheme: string }) {
  return <>{children}</>;
}

export function useAppPaymentSheet() {
  return {
    initPaymentSheet: async (_options?: any) => {
      // If we are on web, we simulate initiation
      if (Platform.OS === 'web') {
        console.log("💳 [Stripe Mock] initPaymentSheet called on web", _options);
        return { error: null };
      }
      return {
        error: { message: "Stripe PaymentSheet requires a native build. For testing, use the 'testa' promo code to bypass Stripe." },
      };
    },
    presentPaymentSheet: async (_options?: any) => {
      // If we are on web, we simulate success
      if (Platform.OS === 'web') {
        console.log("💳 [Stripe Mock] presentPaymentSheet called on web (Simulating Success)");
        return { error: null };
      }
      return {
        error: { message: "Stripe PaymentSheet requires a native build. For testing, use the 'testa' promo code to bypass Stripe." },
      };
    },
  };
}
