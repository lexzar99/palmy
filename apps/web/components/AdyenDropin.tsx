"use client";

/**
 * Adyen Web Drop-in v6 (sessions-flöde), temad till Silk.
 *
 * Monteras på kassan, ingen sid-redirect för kort. Redirect-metoder (Swish/
 * Klarna) lämnar sidan och returnerar med ?redirectResult → vi återanvänder
 * sessionen ur sessionStorage och kör submitDetails. Klienten flippar ALDRIG
 * order-status, det gör webhooken. onCompleted routar bara till order-tracking.
 *
 * Verifierat mot @adyen/adyen-web@6.40.0 (named export, new Dropin(checkout,cfg)).
 */
import { useEffect, useRef, useState } from "react";
import "@adyen/adyen-web/styles/adyen.css";
import "./adyen-silk-theme.css";
import { API_URL } from "@/lib/api";

const CLIENT_KEY = process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || "";
const ENVIRONMENT = (process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT || "test") as "test" | "live";

type Props = {
  orderId: string;
  returnUrl: string;
  onCompleted: (resultCode: string) => void;
  onFailed: (resultCode: string) => void;
  onError?: (message: string) => void;
};

type Phase = "loading" | "ready" | "redirect" | "error";

export default function AdyenDropin({ orderId, returnUrl, onCompleted, onFailed, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    let dropin: { unmount: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        // v6: Drop-in inkluderar INTE metod-komponenterna automatiskt — vi måste
        // importera klasserna och passa dem i paymentMethodComponents, annars
        // renderas de inte (konsolen varnar "you support X but not configured").
        const { AdyenCheckout, Dropin, Card, Klarna, Swish, ApplePay, GooglePay } = await import("@adyen/adyen-web");

        const url = new URL(window.location.href);
        const redirectResult = url.searchParams.get("redirectResult");

        // Hämta session: vid redirect-retur återanvänd den lagrade (samma session
        // måste användas), annars skapa en ny via backend /create.
        let session: { id: string; sessionData: string };
        const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("adyen.session") : null;
        if (redirectResult && stored) {
          session = JSON.parse(stored);
        } else {
          const res = await fetch(`${API_URL}/api/payments/create`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId, returnUrl }),
          });
          const data = await res.json();
          if (!data?.session?.id || !data?.session?.sessionData) {
            throw new Error(data?.details || data?.error || "Kunde inte starta betalningen");
          }
          session = data.session;
          try {
            sessionStorage.setItem("adyen.session", JSON.stringify(session));
          } catch {
            /* privat läge: redirect-metoder kan då tappa sessionen, kort funkar */
          }
        }
        if (cancelled) return;

        const checkout = await AdyenCheckout({
          environment: ENVIRONMENT,
          clientKey: CLIENT_KEY,
          countryCode: "SE", // obligatoriskt i v6
          locale: "sv-SE",
          session,
          onPaymentCompleted: (result: any) => {
            try {
              sessionStorage.removeItem("adyen.session");
            } catch {
              /* noop */
            }
            onCompleted(result?.resultCode || "Authorised");
          },
          onPaymentFailed: (result: any) => {
            onFailed(result?.resultCode || "failed");
          },
          onError: (err: any) => {
            if (cancelled) return;
            setPhase("error");
            onError?.(err?.message || "Betalningen kunde inte genomföras.");
          },
        });
        if (cancelled || !containerRef.current) return;

        if (redirectResult) {
          // Återuppta redirect-betalning (Swish/Klarna). onPaymentCompleted/Failed
          // triggas härifrån, ingen manuell /payments/details behövs i sessions-flödet.
          setPhase("redirect");
          await checkout.submitDetails({ details: { redirectResult } });
        } else {
          dropin = new Dropin(checkout, {
            // Öppna INTE första metoden automatiskt → alla metoder visas som en
            // lista (kort/Klarna/Swish), ingen förvald, så kunden ser alla val.
            openFirstPaymentMethod: false,
            paymentMethodComponents: [Card, Klarna, Swish, ApplePay, GooglePay],
            paymentMethodsConfiguration: {
              card: {
                hasHolderName: true,
                holderNameRequired: true,
                // Kortnummer/CVC ligger i Adyens iframes (PCI). Deras textfärg styrs
                // via styles-config, inte CSS från sidan. Vit text på mörk yta.
                styles: {
                  base: { color: "#fafafa", fontSize: "16px", fontFamily: "Inter, sans-serif", placeholderColor: "#6b6b70" },
                  placeholder: { color: "#6b6b70" },
                  error: { color: "#fb7185" },
                },
              },
            },
          }).mount(containerRef.current);
          setPhase("ready");
        }
      } catch (e: any) {
        if (cancelled) return;
        setPhase("error");
        onError?.(e?.message || "Något gick fel. Försök igen om en stund.");
      }
    })();

    return () => {
      cancelled = true;
      dropin?.unmount();
    };
    // orderId byts aldrig under komponentens liv; mount en gång.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="delivera-adyen">
      {phase === "loading" && (
        <div className="flex items-center justify-center py-10">
          <div
            className="h-7 w-7 animate-spin rounded-full"
            style={{ border: "2px solid rgba(17,17,19,0.12)", borderTopColor: "#E7B24B" }}
          />
        </div>
      )}

      <div ref={containerRef} />

      {phase === "redirect" && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl text-center"
          style={{ background: "rgba(255,255,255,0.94)" }}
        >
          <div
            className="h-7 w-7 animate-spin rounded-full"
            style={{ border: "2px solid rgba(17,17,19,0.12)", borderTopColor: "#E7B24B" }}
          />
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: "#111113" }}>
            Verifierar betalningen
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#5C5C61" }}>
            Slutför i fönstret som öppnas, du kommer tillbaka hit automatiskt.
          </p>
        </div>
      )}
    </div>
  );
}
