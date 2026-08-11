"use client";

import { useMemo, useState } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { AlertCircle, Loader2 } from "lucide-react";

export type StripeCheckoutMethod = "klarna" | "apple_pay" | "google_pay" | "card";

type StripeInlineCheckoutProps = {
  clientSecret: string;
  publishableKey: string;
  method: StripeCheckoutMethod;
  returnUrl: string;
  amountLabel: string;
  onSubmitStart: () => void;
  onSubmitEnd: () => void;
  onVerified: () => Promise<void> | void;
};

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();

function stripePromise(publishableKey: string) {
  const cached = stripePromiseCache.get(publishableKey);
  if (cached) return cached;
  const next = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, next);
  return next;
}

function localizedStripeError(code: string | undefined, fallback?: string): string {
  const messages: Record<string, string> = {
    card_declined: "Kortet nekades. Prova ett annat kort eller betalsätt.",
    authentication_required: "Din bank kräver verifiering. Slutför den och försök igen.",
    payment_intent_authentication_failure: "Bankverifieringen misslyckades. Försök igen eller välj ett annat betalsätt.",
    incorrect_number: "Kontrollera kortnumret och försök igen.",
    invalid_expiry_month: "Kontrollera kortets utgångsmånad.",
    invalid_expiry_year: "Kontrollera kortets utgångsår.",
    invalid_cvc: "Kontrollera kortets CVC-kod.",
    processing_error: "Betalningen kunde inte behandlas just nu. Försök igen om en stund.",
  };
  return (code && messages[code]) || fallback || "Betalningen kunde inte genomföras. Försök igen.";
}

function StripePaymentForm({
  method,
  returnUrl,
  amountLabel,
  onSubmitStart,
  onSubmitEnd,
  onVerified,
}: Omit<StripeInlineCheckoutProps, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const isWallet = method === "apple_pay" || method === "google_pay";

  const confirm = async (expressEvent?: { paymentFailed: (payload?: { reason?: "fail"; message?: string }) => void }) => {
    if (!stripe || !elements || processing) return;
    setProcessing(true);
    setError(null);
    onSubmitStart();
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (result.error) {
        const message = localizedStripeError(result.error.code, result.error.message);
        expressEvent?.paymentFailed({ reason: "fail", message });
        setError(message);
        onSubmitEnd();
        setProcessing(false);
        return;
      }

      // Redirect-metoder lämnar sidan. Om Stripe kan slutföra utan redirect
      // verifierar backend alltid PaymentIntenten innan ordern markeras PAID.
      await onVerified();
    } catch {
      const message = "Kunde inte verifiera betalningen. Försök igen eller välj ett annat betalsätt.";
      expressEvent?.paymentFailed({ reason: "fail", message });
      setError(message);
      onSubmitEnd();
      setProcessing(false);
    }
  };

  if (isWallet) {
    const walletKey = method === "apple_pay" ? "applePay" : "googlePay";
    return (
      <div className="space-y-4">
        <ExpressCheckoutElement
          options={{
            buttonHeight: 52,
            buttonType: method === "apple_pay" ? { applePay: "plain" } : { googlePay: "pay" },
            layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
            paymentMethodOrder: [method],
            paymentMethods: {
              applePay: method === "apple_pay" ? "always" : "never",
              googlePay: method === "google_pay" ? "always" : "never",
              amazonPay: "never",
              klarna: "never",
              link: "never",
              paypal: "never",
            },
          }}
          onReady={(event) => setWalletAvailable(Boolean(event.availablePaymentMethods?.[walletKey]))}
          onConfirm={(event) => { void confirm(event); }}
          onCancel={() => {
            onSubmitEnd();
            setProcessing(false);
          }}
          onLoadError={() => setWalletAvailable(false)}
        />
        {walletAvailable === null && (
          <p className="flex items-center justify-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <Loader2 size={15} className="animate-spin" /> Kontrollerar plånboken…
          </p>
        )}
        {walletAvailable === false && (
          <p className="rounded-xl border px-4 py-3 text-[13px] leading-5" style={{ color: "var(--text-secondary)", borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)" }}>
            {method === "apple_pay" ? "Apple Pay" : "Google Pay"} är inte tillgängligt på den här enheten eller i den här webbläsaren. Gå tillbaka och välj kort eller ett annat betalsätt.
          </p>
        )}
        {processing && (
          <p className="flex items-center justify-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            <Loader2 size={16} className="animate-spin" /> Verifierar betalningen…
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void confirm(); }} className="space-y-5">
      <PaymentElement
        options={{
          business: { name: "ViaEats" },
          layout: { type: "tabs", defaultCollapsed: false, radios: "always" },
          paymentMethodOrder: method === "klarna" ? ["klarna"] : ["card"],
          wallets: { applePay: "never", googlePay: "never", link: "never" },
        }}
      />
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || processing}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 text-[15px] font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-50"
      >
        {processing ? <Loader2 size={20} className="animate-spin" /> : `Betala ${amountLabel}`}
      </button>
    </form>
  );
}

export default function StripeInlineCheckout(props: StripeInlineCheckoutProps) {
  const options = useMemo<StripeElementsOptions>(() => ({
    clientSecret: props.clientSecret,
    locale: "sv",
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#F0531C",
        colorBackground: "#FFFFFF",
        colorText: "#171A1B",
        colorDanger: "#E11D48",
        borderRadius: "12px",
        fontFamily: "Inter, system-ui, sans-serif",
      },
    },
  }), [props.clientSecret]);

  return (
    <Elements
      key={`${props.clientSecret}:${props.method}`}
      stripe={stripePromise(props.publishableKey)}
      options={options}
    >
      <StripePaymentForm
        method={props.method}
        returnUrl={props.returnUrl}
        amountLabel={props.amountLabel}
        onSubmitStart={props.onSubmitStart}
        onSubmitEnd={props.onSubmitEnd}
        onVerified={props.onVerified}
      />
    </Elements>
  );
}
