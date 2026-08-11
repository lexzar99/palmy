"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { AlertCircle, CreditCard, Loader2, RefreshCw } from "lucide-react";
import {
  preloadStripeWallets,
  type PreparedStripePayment,
} from "./StripeWalletButtons";

export type StripeCardBillingDetails = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type StripeCardFormProps = {
  publishableKey: string;
  amountOre: number;
  amountLabel?: string;
  billingDetails: StripeCardBillingDetails;
  disabled?: boolean;
  createPayment: () => Promise<PreparedStripePayment>;
  onConfirmed: (orderId: string) => Promise<void> | void;
  onProcessingChange?: (processing: boolean) => void;
  onReady?: () => void;
  onLoadError?: (error: unknown) => void;
};

const SEK_FORMATTER = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function validPublishableKey(value: string): boolean {
  return /^pk_(?:live|test)_[A-Za-z0-9]+$/.test(value.trim());
}

function optionalValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function cardErrorMessage(error: unknown): string {
  const value = error as {
    code?: unknown;
    decline_code?: unknown;
    response?: { data?: { error?: unknown; message?: unknown } };
  } | null;
  const code = typeof value?.code === "string" ? value.code : undefined;
  const declineCode = typeof value?.decline_code === "string" ? value.decline_code : undefined;
  const messages: Record<string, string> = {
    authentication_required: "Din bank kräver verifiering. Slutför den och försök igen.",
    card_declined: "Kortet nekades. Prova ett annat kort eller betalsätt.",
    expired_card: "Kortet har gått ut. Prova ett annat kort.",
    incomplete_cvc: "Fyll i kortets säkerhetskod.",
    incomplete_expiry: "Fyll i kortets utgångsdatum.",
    incomplete_number: "Fyll i hela kortnumret.",
    incomplete_zip: "Fyll i postnumret som hör till kortet.",
    incorrect_cvc: "Kortets säkerhetskod är fel. Kontrollera koden och försök igen.",
    incorrect_number: "Kortnumret är fel. Kontrollera numret och försök igen.",
    insufficient_funds: "Kortet saknar tillräckligt saldo. Prova ett annat kort eller betalsätt.",
    invalid_cvc: "Kontrollera kortets säkerhetskod.",
    invalid_expiry_month: "Kontrollera kortets utgångsmånad.",
    invalid_expiry_year: "Kontrollera kortets utgångsår.",
    lost_card: "Kortet kunde inte användas. Kontakta banken eller prova ett annat kort.",
    payment_intent_authentication_failure: "Bankverifieringen misslyckades. Försök igen eller välj ett annat betalsätt.",
    processing_error: "Betalningen kunde inte behandlas just nu. Försök igen om en stund.",
    stolen_card: "Kortet kunde inte användas. Kontakta banken eller prova ett annat kort.",
  };
  if (declineCode && messages[declineCode]) return messages[declineCode];
  if (code && messages[code]) return messages[code];

  const apiError = value?.response?.data?.error;
  if (typeof apiError === "string" && apiError.trim()) return apiError;
  const apiMessage = value?.response?.data?.message;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  return "Kortbetalningen kunde inte genomföras. Kontrollera uppgifterna och försök igen.";
}

function DeferredCardForm({
  amountOre,
  amountLabel,
  billingDetails,
  disabled,
  createPayment,
  onConfirmed,
  onProcessingChange,
  onReady,
  onLoadError,
}: Omit<StripeCardFormProps, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementRevision, setElementRevision] = useState(0);
  const confirmedOrderId = useRef<string | null>(null);

  useEffect(() => () => onProcessingChange?.(false), [onProcessingChange]);

  const setBusy = (next: boolean) => {
    setProcessing(next);
    onProcessingChange?.(next);
  };

  const verifyConfirmedOrder = async (orderId: string) => {
    try {
      await onConfirmed(orderId);
    } catch {
      setError("Betalningen är skickad. Tryck igen för att kontrollera betalningsstatus.");
    }
  };

  const handleSubmit = async () => {
    if (processing || disabled) return;
    if (!stripe || !elements || !ready) {
      setError("Kortbetalningen är inte redo ännu. Vänta ett ögonblick och försök igen.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Once Stripe has accepted the card, a retry only re-runs backend
      // verification. It must never create or confirm a second payment.
      if (confirmedOrderId.current) {
        await verifyConfirmedOrder(confirmedOrderId.current);
        return;
      }

      // Validate the visible card fields before freezing the order or creating
      // a PaymentIntent. A customer can therefore close this form without any
      // abandoned payment being created in the backend.
      const submitted = await elements.submit();
      if (submitted.error) {
        setError(cardErrorMessage(submitted.error));
        return;
      }

      const prepared = await createPayment();
      if (prepared.status === "paid") {
        confirmedOrderId.current = prepared.orderId;
        await verifyConfirmedOrder(prepared.orderId);
        return;
      }

      const result = await stripe.confirmPayment({
        elements,
        clientSecret: prepared.clientSecret,
        confirmParams: {
          return_url: prepared.returnUrl,
          payment_method_data: {
            billing_details: {
              name: billingDetails.name.trim(),
              email: optionalValue(billingDetails.email),
              phone: optionalValue(billingDetails.phone),
            },
          },
        },
        redirect: "if_required",
      });
      if (result.error) {
        setError(cardErrorMessage(result.error));
        return;
      }

      confirmedOrderId.current = prepared.orderId;
      await verifyConfirmedOrder(prepared.orderId);
    } catch (caught) {
      setError(cardErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const retryElement = () => {
    if (processing) return;
    setReady(false);
    setLoadError(false);
    setError(null);
    setElementRevision((current) => current + 1);
  };

  const formattedAmount = amountLabel || SEK_FORMATTER.format(amountOre / 100);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className={disabled ? "pointer-events-none opacity-55" : ""}>
        {/* Keep Stripe's iframe mounted and visible while it loads. Hiding it
            behind readiness state can prevent Elements from ever becoming ready. */}
        <PaymentElement
          key={elementRevision}
          options={{
            business: { name: "ViaEats" },
            defaultValues: {
              billingDetails: {
                name: billingDetails.name.trim(),
                email: optionalValue(billingDetails.email),
                phone: optionalValue(billingDetails.phone),
              },
            },
            fields: {
              billingDetails: {
                name: "never",
                email: "never",
                phone: "never",
                address: "if_required",
              },
            },
            layout: {
              type: "accordion",
              defaultCollapsed: false,
              radios: "never",
              paymentMethodLogoPosition: "end",
            },
            paymentMethodOrder: ["card"],
            wallets: {
              applePay: "never",
              googlePay: "never",
              link: "never",
            },
            readOnly: Boolean(disabled || processing),
          }}
          onReady={() => {
            setReady(true);
            setLoadError(false);
            onReady?.();
          }}
          onLoadError={(event) => {
            setReady(false);
            setLoadError(true);
            onLoadError?.(event.error);
          }}
        />
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-5 text-amber-700">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>Stripe kunde inte ladda kortfälten. Kontrollera anslutningen och försök igen.</span>
          </div>
          <button
            type="button"
            onClick={retryElement}
            className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-white/70 px-3 font-semibold text-amber-800"
          >
            <RefreshCw size={14} /> Ladda om kortfälten
          </button>
        </div>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || !ready || loadError || processing || disabled}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 text-[15px] font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {processing ? (
          <><Loader2 size={19} className="animate-spin" /> Behandlar betalningen…</>
        ) : confirmedOrderId.current ? (
          <><RefreshCw size={18} /> Kontrollera betalningsstatus</>
        ) : (
          <><CreditCard size={18} /> Betala {formattedAmount}</>
        )}
      </button>
    </form>
  );
}

export default function StripeCardForm(props: StripeCardFormProps) {
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
    loader: "auto",
    appearance: {
      theme: "flat",
      labels: "floating",
      inputs: "spaced",
      variables: {
        colorPrimary: "#F0531C",
        colorBackground: "#FFFFFF",
        colorText: "#171A1B",
        colorDanger: "#E11D48",
        borderRadius: "14px",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSizeBase: "15px",
        fontWeightMedium: "550",
        spacingUnit: "4px",
        focusBoxShadow: "0 0 0 3px rgba(240, 83, 28, 0.14)",
      },
      rules: {
        ".Input": {
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          padding: "14px",
        },
        ".Input:hover": {
          borderColor: "#CBD5E1",
        },
        ".Input:focus": {
          borderColor: "#F0531C",
          boxShadow: "0 0 0 3px rgba(240, 83, 28, 0.14)",
        },
        ".Label": {
          color: "#64748B",
          fontWeight: "500",
        },
        ".AccordionItem": {
          border: "0",
          boxShadow: "none",
        },
      },
    },
  }), [props.amountOre]);

  if (!validPublishableKey(props.publishableKey) || props.amountOre < 1) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-600">
        <AlertCircle size={16} className="mt-0.5 shrink-0" /> Kortbetalningen kan inte startas just nu. Välj ett annat betalsätt.
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <DeferredCardForm
        amountOre={props.amountOre}
        amountLabel={props.amountLabel}
        billingDetails={props.billingDetails}
        disabled={props.disabled}
        createPayment={props.createPayment}
        onConfirmed={props.onConfirmed}
        onProcessingChange={props.onProcessingChange}
        onReady={props.onReady}
        onLoadError={props.onLoadError}
      />
    </Elements>
  );
}
