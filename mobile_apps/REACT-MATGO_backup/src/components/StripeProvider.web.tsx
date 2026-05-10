// Web stub — Stripe Native SDK is not available on web.
// This simply renders children without any Stripe context.
import React from "react";

interface StripeProviderProps {
  publishableKey: string;
  merchantIdentifier?: string;
  urlScheme?: string;
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  return <>{children}</>;
}
