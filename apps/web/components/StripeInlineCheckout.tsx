"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

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

type ElementReadiness = "loading" | "ready" | "unavailable" | "timed_out" | "error";

// Stripe normally resolves these events in well under a second. The bounds
// below prevent blocked scripts, privacy extensions or unsupported webviews
// from leaving the checkout in a permanent loading state.
export const STRIPE_READINESS_TIMEOUTS = Object.freeze({
  stripeJsMs: 6_000,
  walletMs: 4_000,
  paymentElementMs: 6_000,
});

type StripePromise = ReturnType<typeof loadStripe>;
const stripePromiseCache = new Map<string, StripePromise>();
const resolvedStripeCache = new Map<string, Stripe>();

function validPublishableKey(value: string): boolean {
  return /^pk_(?:live|test)_[A-Za-z0-9]+$/.test(value.trim());
}

/**
 * Warm Stripe.js and the account-specific Stripe instance while the customer
 * is still reviewing the cart. The same promise is reused by Elements later,
 * so choosing a Stripe method does not begin with a cold script download.
 */
export function preloadStripeCheckout(publishableKey: string): StripePromise {
  const key = publishableKey.trim();
  if (!validPublishableKey(key)) return Promise.reject(new Error("Ogiltig Stripe-nyckel"));

  const resolved = resolvedStripeCache.get(key);
  if (resolved) return Promise.resolve(resolved);

  const cached = stripePromiseCache.get(key);
  if (cached) return cached;

  const request = loadStripe(key).then((stripe) => {
    if (stripe) resolvedStripeCache.set(key, stripe);
    return stripe;
  });
  stripePromiseCache.set(key, request);
  // A network error must not poison every later retry for this key.
  void request.catch(() => {
    if (stripePromiseCache.get(key) === request) stripePromiseCache.delete(key);
  });
  return request;
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

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-[52px] items-center justify-center gap-3 rounded-xl border px-4" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
      <Loader2 size={17} className="animate-spin" />
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  );
}

function ReadinessFallback({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="flex h-full min-h-[112px] flex-col items-center justify-center rounded-xl border px-4 py-4 text-center" style={{ color: "var(--text-secondary)", borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)" }}>
      <AlertCircle size={19} className="mb-2 text-amber-500" />
      <p className="max-w-md text-[13px] leading-5">{message}</p>
      <button type="button" onClick={retry} className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold" style={{ color: "var(--text-primary)", borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
        <RefreshCw size={14} /> Försök igen
      </button>
    </div>
  );
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
  const [elementRevision, setElementRevision] = useState(0);
  const [readiness, setReadiness] = useState<ElementReadiness>("loading");
  const isWallet = method === "apple_pay" || method === "google_pay";
  const methodLabel = method === "apple_pay" ? "Apple Pay" : method === "google_pay" ? "Google Pay" : method === "klarna" ? "Klarna" : "kortbetalningen";

  useEffect(() => {
    setReadiness("loading");
    setError(null);
    const timeout = window.setTimeout(() => {
      setReadiness((current) => current === "loading" ? "timed_out" : current);
    }, isWallet ? STRIPE_READINESS_TIMEOUTS.walletMs : STRIPE_READINESS_TIMEOUTS.paymentElementMs);
    return () => window.clearTimeout(timeout);
  }, [elementRevision, isWallet, method]);

  const retryElement = () => {
    setProcessing(false);
    onSubmitEnd();
    setElementRevision((current) => current + 1);
  };

  const confirm = async (expressEvent?: { paymentFailed: (payload?: { reason?: "fail"; message?: string }) => void }) => {
    if (!stripe || !elements || processing || readiness !== "ready") return;
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
        <div className="relative min-h-[52px]">
          <div className={readiness === "ready" ? "opacity-100" : "pointer-events-none absolute inset-0 invisible opacity-0"}>
            <ExpressCheckoutElement
              key={`${method}:${elementRevision}`}
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
              onReady={(event) => setReadiness(Boolean(event.availablePaymentMethods?.[walletKey]) ? "ready" : "unavailable")}
              onConfirm={(event) => { void confirm(event); }}
              onCancel={() => {
                onSubmitEnd();
                setProcessing(false);
              }}
              onLoadError={() => setReadiness("error")}
            />
          </div>
          {readiness === "loading" && <LoadingPlaceholder label={`Startar ${methodLabel}…`} />}
          {readiness === "unavailable" && (
            <ReadinessFallback
              message={`${methodLabel} är inte tillgängligt på den här enheten eller i den här webbläsaren. Du kan försöka igen eller gå tillbaka och välja kort.`}
              retry={retryElement}
            />
          )}
          {readiness === "timed_out" && (
            <ReadinessFallback
              message={`${methodLabel} svarade inte inom några sekunder. Kontrollera anslutningen och försök igen, eller välj kort.`}
              retry={retryElement}
            />
          )}
          {readiness === "error" && (
            <ReadinessFallback
              message={`Stripe kunde inte ladda ${methodLabel}. Kontrollera anslutningen och försök igen, eller välj kort.`}
              retry={retryElement}
            />
          )}
        </div>
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
      <div className={`relative ${readiness === "ready" ? "" : "min-h-[168px]"}`}>
        <div className={readiness === "ready" ? "opacity-100" : "pointer-events-none absolute inset-x-0 top-0 invisible opacity-0"}>
          <PaymentElement
            key={`${method}:${elementRevision}`}
            options={{
              business: { name: "ViaEats" },
              layout: { type: "tabs", defaultCollapsed: false, radios: "always" },
              paymentMethodOrder: method === "klarna" ? ["klarna"] : ["card"],
              wallets: { applePay: "never", googlePay: "never", link: "never" },
            }}
            onReady={() => setReadiness("ready")}
            onLoadError={() => setReadiness("error")}
          />
        </div>
        {readiness === "loading" && <LoadingPlaceholder label={method === "klarna" ? "Startar Klarna…" : "Laddar kortfälten…"} />}
        {readiness === "timed_out" && (
          <ReadinessFallback
            message={`${methodLabel === "kortbetalningen" ? "Kortfälten" : methodLabel} svarade inte inom några sekunder. Kontrollera anslutningen och försök igen.`}
            retry={retryElement}
          />
        )}
        {readiness === "error" && (
          <ReadinessFallback
            message={`Stripe kunde inte ladda ${methodLabel}. Kontrollera anslutningen och försök igen.`}
            retry={retryElement}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || processing || readiness !== "ready"}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 text-[15px] font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-50"
      >
        {processing ? <Loader2 size={20} className="animate-spin" /> : `Betala ${amountLabel}`}
      </button>
    </form>
  );
}

export default function StripeInlineCheckout(props: StripeInlineCheckoutProps) {
  const [stripe, setStripe] = useState<Stripe | null>(() => resolvedStripeCache.get(props.publishableKey.trim()) || null);
  const [stripeState, setStripeState] = useState<"loading" | "ready" | "timed_out" | "error">(() => stripe ? "ready" : "loading");
  const [loadRevision, setLoadRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const key = props.publishableKey.trim();
    const ready = resolvedStripeCache.get(key);
    if (ready) {
      setStripe(ready);
      setStripeState("ready");
      return () => { active = false; };
    }

    setStripe(null);
    setStripeState("loading");
    const timeout = window.setTimeout(() => {
      if (active) setStripeState((current) => current === "loading" ? "timed_out" : current);
    }, STRIPE_READINESS_TIMEOUTS.stripeJsMs);

    void preloadStripeCheckout(key)
      .then((nextStripe) => {
        if (!active) return;
        window.clearTimeout(timeout);
        if (!nextStripe) {
          setStripeState("error");
          return;
        }
        setStripe(nextStripe);
        setStripeState("ready");
      })
      .catch(() => {
        if (!active) return;
        window.clearTimeout(timeout);
        setStripeState("error");
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [loadRevision, props.publishableKey]);

  const options = useMemo<StripeElementsOptions>(() => ({
    clientSecret: props.clientSecret,
    locale: "sv",
    loader: "auto",
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

  if (stripeState === "loading") {
    return <div className="min-h-[168px]"><LoadingPlaceholder label="Startar Stripe…" /></div>;
  }
  if (stripeState === "timed_out" || stripeState === "error" || !stripe) {
    return (
      <ReadinessFallback
        message={stripeState === "timed_out"
          ? "Stripe svarade inte inom några sekunder. Kontrollera anslutningen och försök igen."
          : "Stripe kunde inte laddas. Kontrollera anslutningen och försök igen."}
        retry={() => {
          stripePromiseCache.delete(props.publishableKey.trim());
          setLoadRevision((current) => current + 1);
        }}
      />
    );
  }

  return (
    <Elements
      key={`${props.clientSecret}:${props.method}:${loadRevision}`}
      stripe={stripe}
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
