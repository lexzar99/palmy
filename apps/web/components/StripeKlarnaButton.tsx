"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type {
  StripeElementsOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  preloadStripeWallets,
  type PreparedStripePayment,
} from "./StripeWalletButtons";

type StripeKlarnaButtonProps = {
  publishableKey: string;
  amountOre: number;
  disabled?: boolean;
  createPayment: () => Promise<PreparedStripePayment>;
  onConfirmed: (orderId: string) => Promise<void> | void;
  onProcessingChange?: (processing: boolean) => void;
  onAvailabilityChange?: (available: boolean) => void;
  /**
   * Definitivt besked från Stripe (onReady/onLoadError) — till skillnad från
   * onAvailabilityChange anropas den ALDRIG från unmount-cleanup, så mottagaren
   * kan tryggt visa en fallback på `false` utan att den blinkar vid re-mounts.
   */
  onAvailabilityResolved?: (available: boolean) => void;
};

function validPublishableKey(value: string): boolean {
  return /^pk_(?:live|test)_[A-Za-z0-9]+$/.test(value.trim());
}

function klarnaErrorMessage(error: unknown): string {
  const value = error as { message?: unknown; response?: { data?: { error?: unknown } } } | null;
  const apiMessage = value?.response?.data?.error;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  if (typeof value?.message === "string" && value.message.trim()) return value.message;
  return "Klarna-betalningen kunde inte genomföras. Försök igen eller välj ett annat betalsätt.";
}

function DeferredKlarnaButton({
  disabled,
  createPayment,
  onConfirmed,
  onProcessingChange,
  onAvailabilityChange,
  onAvailabilityResolved,
}: Omit<StripeKlarnaButtonProps, "publishableKey" | "amountOre">) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    onAvailabilityChange?.(false);
    onProcessingChange?.(false);
  }, [onAvailabilityChange, onProcessingChange]);

  const setBusy = (next: boolean) => {
    setProcessing(next);
    onProcessingChange?.(next);
  };

  const handleConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || processing || disabled) {
      event.paymentFailed({ reason: "fail", message: "Klarna är inte redo ännu. Försök igen." });
      return;
    }
    if (event.expressPaymentType !== "klarna") {
      event.paymentFailed({ reason: "invalid_payment_data", message: "Välj Klarna." });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // The branded Klarna interface opens first. Only after the customer has
      // accepted it do we freeze the ViaEats order and create its exact Intent.
      const submitted = await elements.submit();
      if (submitted.error) {
        const message = klarnaErrorMessage(submitted.error);
        event.paymentFailed({ reason: "invalid_payment_data", message });
        setError(message);
        return;
      }

      const prepared = await createPayment();
      if (prepared.status === "paid") {
        await onConfirmed(prepared.orderId);
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: prepared.clientSecret,
        confirmParams: { return_url: prepared.returnUrl },
        redirect: "if_required",
      });
      if (result.error) {
        const message = klarnaErrorMessage(result.error);
        event.paymentFailed({ reason: "fail", message });
        setError(message);
        return;
      }

      await onConfirmed(prepared.orderId);
    } catch (caught) {
      const message = klarnaErrorMessage(caught);
      event.paymentFailed({ reason: "fail", message });
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <ExpressCheckoutElement
        options={{
          billingAddressRequired: false,
          emailRequired: true,
          phoneNumberRequired: false,
          shippingAddressRequired: false,
          business: { name: "ViaEats" },
          buttonHeight: 55,
          layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
          paymentMethodOrder: ["klarna"],
          paymentMethods: {
            applePay: "never",
            googlePay: "never",
            amazonPay: "never",
            klarna: "auto",
            link: "never",
            paypal: "never",
          },
        }}
        onReady={(event) => {
          const nextAvailable = Boolean(event.availablePaymentMethods?.klarna);
          if (!nextAvailable) {
            // Tyst gömd knapp är odebugbar — logga varför fallbacken tar över.
            console.warn(
              "[stripe] Klarna-expressknappen är inte tillgänglig här (webview, webbläsare utan stöd eller Stripe-gating) — ViaEats Klarna-fallback visas i stället.",
              event.availablePaymentMethods ?? null,
            );
          }
          setAvailable(nextAvailable);
          onAvailabilityChange?.(nextAvailable);
          onAvailabilityResolved?.(nextAvailable);
        }}
        onLoadError={(event) => {
          console.warn("[stripe] Klarna Express Checkout kunde inte laddas:", event.error);
          setAvailable(false);
          onAvailabilityChange?.(false);
          onAvailabilityResolved?.(false);
        }}
        onConfirm={(event) => { void handleConfirm(event); }}
        onCancel={() => setBusy(false)}
      />

      {available && processing && (
        <p aria-live="polite" className="mt-2 flex items-center justify-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
          <Loader2 size={14} className="animate-spin" /> Öppnar Klarna…
        </p>
      )}
      {available && error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-[12.5px] leading-5 text-rose-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

export default function StripeKlarnaButton(props: StripeKlarnaButtonProps) {
  const stripePromise = useMemo(
    () => preloadStripeWallets(props.publishableKey),
    [props.publishableKey],
  );
  const options = useMemo<StripeElementsOptions>(() => ({
    mode: "payment",
    amount: props.amountOre,
    currency: "sek",
    paymentMethodTypes: ["klarna"],
    locale: "sv",
    appearance: {
      variables: {
        borderRadius: "14px",
        colorPrimary: "#F0531C",
      },
    },
  }), [props.amountOre]);

  if (!validPublishableKey(props.publishableKey) || props.amountOre < 1) return null;

  return (
    <Elements stripe={stripePromise} options={options}>
      <DeferredKlarnaButton
        disabled={props.disabled}
        createPayment={props.createPayment}
        onConfirmed={props.onConfirmed}
        onProcessingChange={props.onProcessingChange}
        onAvailabilityChange={props.onAvailabilityChange}
        onAvailabilityResolved={props.onAvailabilityResolved}
      />
    </Elements>
  );
}
