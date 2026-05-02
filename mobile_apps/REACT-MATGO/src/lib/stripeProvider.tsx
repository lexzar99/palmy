import React from "react";
import { Platform } from "react-native";
import { StripeProvider, usePaymentSheet } from "@stripe/stripe-react-native";
import { EXPO_PUBLIC_STRIPE_MERCHANT_ID } from "./env";
import { captureError } from "./sentry";

export function AppStripeProvider({ children, publishableKey, urlScheme }: { children: React.ReactNode; publishableKey: string; urlScheme: string }) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  // Fail-loud in production logs/Sentry if the publishable key is empty or
  // looks wrong. Stripe will silently no-op and every initPaymentSheet call
  // will fail with a confusing message; surfacing the root cause here saves
  // hours of debugging in the field.
  React.useEffect(() => {
    if (!publishableKey || !publishableKey.startsWith("pk_")) {
      captureError(new Error("[stripe] missing or malformed publishableKey at boot"), {
        publishableKey: publishableKey ? `${publishableKey.slice(0, 8)}…` : "(empty)",
        merchantId: EXPO_PUBLIC_STRIPE_MERCHANT_ID,
        platform: Platform.OS,
      });
    }
  }, [publishableKey]);

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
