"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripeElementsOptions,
  type StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import { AlertCircle, Loader2 } from "lucide-react";

export type StripeWalletMethod = "apple_pay" | "google_pay";

export type PreparedStripeWalletPayment =
  | {
      status: "prepared";
      orderId: string;
      clientSecret: string;
      returnUrl: string;
    }
  | {
      status: "paid";
      orderId: string;
    };

type StripeWalletButtonsProps = {
  publishableKey: string;
  amountOre: number;
  disabled?: boolean;
  createPayment: (method: StripeWalletMethod) => Promise<PreparedStripeWalletPayment>;
  onConfirmed: (orderId: string) => Promise<void> | void;
  onProcessingChange?: (processing: boolean) => void;
  onAvailabilityChange?: (available: boolean) => void;
};

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

function validPublishableKey(value: string): boolean {
  return /^pk_(?:live|test)_[A-Za-z0-9]+$/.test(value.trim());
}

/**
 * Start loading Stripe.js while the customer is still reviewing the cart.
 * The exact same promise is reused by Elements in the payment view.
 */
export function preloadStripeWallets(publishableKey: string): Promise<Stripe | null> {
  const key = publishableKey.trim();
  if (!validPublishableKey(key)) return Promise.resolve(null);
  const cached = stripePromiseCache.get(key);
  if (cached) return cached;
  const request = loadStripe(key);
  stripePromiseCache.set(key, request);
  void request.catch(() => {
    if (stripePromiseCache.get(key) === request) stripePromiseCache.delete(key);
  });
  return request;
}

function walletErrorMessage(error: unknown): string {
  const value = error as { message?: unknown; response?: { data?: { error?: unknown } } } | null;
  const apiMessage = value?.response?.data?.error;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  if (typeof value?.message === "string" && value.message.trim()) return value.message;
  return "Betalningen kunde inte genomföras. Försök igen eller välj ett annat betalsätt.";
}

function DeferredWalletElement({
  disabled,
  createPayment,
  onConfirmed,
  onProcessingChange,
  onAvailabilityChange,
}: Omit<StripeWalletButtonsProps, "publishableKey" | "amountOre">) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => onAvailabilityChange?.(false), [onAvailabilityChange]);

  const setBusy = (next: boolean) => {
    setProcessing(next);
    onProcessingChange?.(next);
  };

  const handleConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || processing || disabled) {
      event.paymentFailed({ reason: "fail", message: "Betalningen är inte redo ännu. Försök igen." });
      return;
    }
    if (event.expressPaymentType !== "apple_pay" && event.expressPaymentType !== "google_pay") {
      event.paymentFailed({ reason: "invalid_payment_data", message: "Välj Apple Pay eller Google Pay." });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Stripe recommends collecting the wallet authorization before creating
      // the Intent. The genuine wallet button therefore opens its native sheet
      // immediately; the frozen ViaEats order and bound PaymentIntent are only
      // created after the customer authorizes inside that sheet.
      const submitted = await elements.submit();
      if (submitted.error) {
        const message = walletErrorMessage(submitted.error);
        event.paymentFailed({ reason: "invalid_payment_data", message });
        setError(message);
        return;
      }

      const prepared = await createPayment(event.expressPaymentType);
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
        const message = walletErrorMessage(result.error);
        event.paymentFailed({ reason: "fail", message });
        setError(message);
        return;
      }

      await onConfirmed(prepared.orderId);
    } catch (caught) {
      const message = walletErrorMessage(caught);
      event.paymentFailed({ reason: "fail", message });
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      {/* Never gate the Element behind visibility/readiness state. Keeping the
          real Stripe iframe mounted is what preserves the browser user gesture
          from click through the native wallet authorization. */}
      <ExpressCheckoutElement
        options={{
          billingAddressRequired: false,
          emailRequired: false,
          phoneNumberRequired: false,
          shippingAddressRequired: false,
          business: { name: "ViaEats" },
          buttonHeight: 56,
          buttonType: { applePay: "plain", googlePay: "pay" },
          buttonTheme: { applePay: "black", googlePay: "black" },
          layout: { maxColumns: 1, maxRows: 2, overflow: "never" },
          paymentMethodOrder: ["apple_pay", "google_pay"],
          paymentMethods: {
            applePay: "auto",
            googlePay: "auto",
            amazonPay: "never",
            klarna: "never",
            link: "never",
            paypal: "never",
          },
        }}
        onReady={(event) => {
          const nextAvailable = Boolean(
            event.availablePaymentMethods?.applePay ||
            event.availablePaymentMethods?.googlePay,
          );
          setAvailable(nextAvailable);
          onAvailabilityChange?.(nextAvailable);
        }}
        onLoadError={() => {
          setAvailable(false);
          onAvailabilityChange?.(false);
        }}
        onConfirm={(event) => { void handleConfirm(event); }}
        onCancel={() => {
          // No order or PaymentIntent exists until onConfirm, so dismissing the
          // native sheet before authorization is a clean, zero-side-effect cancel.
          setBusy(false);
        }}
      />

      {available && processing && (
        <p aria-live="polite" className="mt-2 flex items-center justify-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
          <Loader2 size={14} className="animate-spin" /> Slutför betalningen…
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

export default function StripeWalletButtons(props: StripeWalletButtonsProps) {
  const stripePromise = useMemo(
    () => preloadStripeWallets(props.publishableKey),
    [props.publishableKey],
  );
  const options = useMemo<StripeElementsOptions>(() => ({
    mode: "payment",
    amount: props.amountOre,
    currency: "sek",
    paymentMethodTypes: ["card"],
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
      <DeferredWalletElement
        disabled={props.disabled}
        createPayment={props.createPayment}
        onConfirmed={props.onConfirmed}
        onProcessingChange={props.onProcessingChange}
        onAvailabilityChange={props.onAvailabilityChange}
      />
    </Elements>
  );
}
