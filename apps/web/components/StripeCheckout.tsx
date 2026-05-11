"use client";

import { useState } from "react";
import { 
  PaymentElement, 
  useStripe, 
  useElements 
} from "@stripe/react-stripe-js";
import { Loader2, CreditCard } from "lucide-react";

interface StripeCheckoutProps {
  onSuccess: (paymentIntentId: string) => Promise<void> | void;
  amount: number;
  draftId?: string;
}

const StripeCheckout = ({ onSuccess, amount, draftId }: StripeCheckoutProps) => {
  const stripe = useStripe();
  const elements = useElements();
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // 30s timeout — om Stripe hänger (dåligt nätverk, deras backend slö) får
    // kunden ett vettigt felmeddelande istället för spinnande oändligt
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 30_000),
    );

    try {
      const confirmPromise = stripe.confirmPayment({
        elements,
        confirmParams: {
          // Return URL is required but we'll try to handle it in-page if possible
          // For Swish/Klarna, Stripe will redirect and then come back
          return_url: `${window.location.origin}/cart?payment_success=true${draftId ? `&draftId=${draftId}` : ''}`,
        },
        redirect: 'if_required',
      });

      const { error, paymentIntent } = await Promise.race([confirmPromise, timeoutPromise]);

      if (error) {
        setErrorMessage(error.message || "Ett oväntat fel uppstod.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        await onSuccess(paymentIntent.id);
        setIsProcessing(false);
        return;
      }

      setErrorMessage("Betalningen väntar fortfarande på bekräftelse. Försök igen om en stund.");
      setIsProcessing(false);
    } catch (unexpectedError) {
      const isTimeout = (unexpectedError as Error)?.message === 'TIMEOUT';
      if (isTimeout) {
        console.warn("[stripe] confirmPayment timed out after 30s");
        setErrorMessage("Betalningen tog för lång tid. Kontrollera din internetanslutning och försök igen.");
      } else {
        console.error("Stripe checkout error:", unexpectedError);
        setErrorMessage("Kunde inte genomföra betalningen. Försök igen.");
      }
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-3xl p-6" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gold-500 rounded-2xl flex items-center justify-center text-zinc-950">
            <CreditCard size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>Säker Betalning</h3>
            <p className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--text-secondary)" }}>Kort, Swish, Apple/Google Pay</p>
          </div>
        </div>

        {/* Stripe Payment Element */}
        <div className="stripe-element-container min-h-[250px]">
          <PaymentElement
            options={{
              layout: 'tabs',
              business: { name: 'MatGo' },
              // Säkerställ att Apple/Google Pay är synliga om enheten stöder
              // dem. Stripe filtrerar baserat på Dashboard-konfig + domain
              // verification, men explicit `wallets` ger bättre fallback.
              wallets: { applePay: 'auto', googlePay: 'auto' },
              // Önskad ordning: wallets först (snabbast för användaren),
              // sen kort, sist Klarna.
              paymentMethodOrder: ['apple_pay', 'google_pay', 'card', 'klarna'],
            }}
          />
        </div>


        {errorMessage && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-bold uppercase tracking-wider text-center">
            {errorMessage}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-gold-500 text-zinc-950 font-black py-5 rounded-3xl uppercase tracking-[0.2em] text-sm hover:bg-gold-400 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_40px_rgba(212,167,74,0.2)]"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <>Betala {amount} kr nu</>
        )}
      </button>

      <p className="text-[9px] text-center font-black uppercase tracking-widest leading-relaxed" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
        Genom att betala accepterar du MatGos köpvillkor.<br/>
        Säker krypterad anslutning via Stripe.
      </p>
    </form>
  );
};

export default StripeCheckout;
