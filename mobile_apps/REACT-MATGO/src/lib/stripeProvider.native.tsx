import React from "react";
import { StripeProvider, usePaymentSheet } from "@stripe/stripe-react-native";

export function AppStripeProvider({
  children,
  publishableKey,
  urlScheme,
}: {
  children: React.ReactNode;
  publishableKey: string;
  urlScheme: string;
}) {
  return (
    <StripeProvider publishableKey={publishableKey} urlScheme={urlScheme}>
      <>{children}</>
    </StripeProvider>
  );
}

export function useAppPaymentSheet() {
  return usePaymentSheet();
}
