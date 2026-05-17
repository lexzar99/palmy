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

    try {
      // INGEN Promise.race med timeout. Tidigare hade vi 30s timeout men det
      // triggade FALSKT FEL för Klarna/Swish: dessa kräver redirect, så
      // confirmPayment() returnerar aldrig (browsern navigerar bort) →
      // Promise.race vinner med TIMEOUT efter 30s → kunden ser "Betalningen
      // tog för lång tid" precis när Klarna-sidan laddar. Felaktig signal.
      // Stripe har egen server-side timeout-handling, vi behöver inte vår.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // For Klarna/Swish: Stripe redirectar till deras flow, returns hit
          // efter signing. För kort: konfirmeras direkt i-page (om inget 3DS).
          return_url: `${window.location.origin}/cart?payment_success=true${draftId ? `&draftId=${draftId}` : ''}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        // Översätt vanliga Stripe-felmeddelanden till svenska istället för
        // engelska technical-strings ("Card declined" → "Kortet är avslaget").
        const code = error.code || '';
        const declineCode = (error as any).decline_code || '';
        const localized = localizeStripeError(code, declineCode, error.message);
        setErrorMessage(localized);
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        await onSuccess(paymentIntent.id);
        setIsProcessing(false);
        return;
      }

      // status === 'processing' eller 'requires_action' utan auto-redirect
      // → låt webhook sköta finalisering. Kunden ser betalsidan stänga och
      // tracking ladda. Visar ingen falsk error.
      setErrorMessage("Betalningen behandlas. Du redirectas så snart Stripe bekräftat.");
      setIsProcessing(false);
    } catch (unexpectedError) {
      console.error("Stripe checkout error:", unexpectedError);
      setErrorMessage("Kunde inte genomföra betalningen. Försök igen.");
      setIsProcessing(false);
    }
  };

  // Mappa Stripe-felmeddelanden från engelska till svenska. Stripe returnerar
  // koder (t.ex. "card_declined") + decline_codes ("insufficient_funds") som
  // vi kan översätta. Fallback till error.message (kan vara på engelska men
  // i alla fall actionable).
  const localizeStripeError = (code: string, declineCode: string, fallback?: string): string => {
    // Decline codes (Stripe's mest specifika info)
    const declineMap: Record<string, string> = {
      insufficient_funds: 'Kortet saknar täckning. Prova ett annat kort eller betalningsmetod.',
      lost_card: 'Kortet är spärrat. Kontakta din bank.',
      stolen_card: 'Kortet är spärrat. Kontakta din bank.',
      expired_card: 'Kortet har gått ut. Använd ett annat kort.',
      incorrect_cvc: 'Fel CVC-kod. Kontrollera siffrorna på baksidan av kortet.',
      processing_error: 'Tekniskt fel hos kortleverantören. Försök igen om en stund.',
      generic_decline: 'Kortet är avvisat. Prova ett annat kort eller kontakta din bank.',
      do_not_honor: 'Kortet är avvisat av banken. Kontakta din bank eller prova ett annat kort.',
      card_velocity_exceeded: 'För många försök på kort tid. Vänta och försök igen.',
      fraudulent: 'Banken misstänker bedrägeri. Kontakta din bank eller prova ett annat kort.',
    };
    if (declineCode && declineMap[declineCode]) return declineMap[declineCode];

    // Generic codes
    const codeMap: Record<string, string> = {
      card_declined: 'Kortet är avvisat. Prova ett annat kort eller betalningsmetod.',
      authentication_required: 'Din bank kräver verifiering. Genomför 3D Secure i bank-appen.',
      payment_intent_authentication_failure: 'Verifieringen misslyckades. Försök igen eller använd ett annat kort.',
      incorrect_number: 'Felaktigt kortnummer. Kontrollera siffrorna och försök igen.',
      invalid_expiry_month: 'Felaktigt utgångsdatum (månad).',
      invalid_expiry_year: 'Felaktigt utgångsdatum (år).',
      invalid_cvc: 'Felaktig CVC-kod.',
      processing_error: 'Tekniskt fel. Försök igen om en stund.',
    };
    if (code && codeMap[code]) return codeMap[code];

    // Fallback: använd Stripe-message:n (kan vara engelsk men beskrivande)
    return fallback || 'Betalningen kunde inte genomföras. Försök igen.';
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
              business: { name: 'FoodGo' },
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

      <p className="text-[10px] text-center font-bold tracking-wide leading-relaxed" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
        Genom att betala accepterar du{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-gold-600 hover:text-gold-500">
          köpvillkoren
        </a>
        {" "}och godkänner att vi behandlar din data enligt{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-gold-600 hover:text-gold-500">
          integritetspolicyn
        </a>
        .<br />
        Säker krypterad anslutning via Stripe.
      </p>
    </form>
  );
};

export default StripeCheckout;
