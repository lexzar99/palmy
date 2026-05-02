import React from "react";
import { Platform } from "react-native";
import { StripeProvider, usePaymentSheet } from "@stripe/stripe-react-native";
import { EXPO_PUBLIC_STRIPE_MERCHANT_ID } from "./env";

export function AppStripeProvider({ children, publishableKey, urlScheme }: { children: React.ReactNode; publishableKey: string; urlScheme: string }) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <StripeProvider
      publishableKey={publishableKey}
      urlScheme={urlScheme}
      // Must match app.json ios.plugins["@stripe/stripe-react-native"].merchantIdentifier
      // AND the merchant ID registered in Apple Developer → Identifiers.
      merchantIdentifier={EXPO_PUBLIC_STRIPE_MERCHANT_ID}
    >
      <>{children}</>
    </StripeProvider>
  );
}

export function useAppPaymentSheet() {
  if (Platform.OS === "web") {
    return {
      initPaymentSheet: async (_options?: any) => {
        console.log("💳 [Stripe Mock] initPaymentSheet called on web", _options);
        return { error: null };
      },
      presentPaymentSheet: async (_options?: any) => {
        console.log("💳 [Stripe Mock] presentPaymentSheet called on web (Simulating Success)");
        return { error: null };
      },
    };
  }

  const stripe = usePaymentSheet();
  return stripe;
}
