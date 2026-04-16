"use client";

import { useEffect, useMemo, useRef, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";

type SocialProvider = "google" | "facebook";

const buildCallbackUrl = (redirect: string) => {
  if (typeof window === "undefined") return "/mobile-auth";
  return `${window.location.origin}/mobile-auth?redirect=${encodeURIComponent(redirect)}`;
};

function MobileAuthContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);

  const redirectTarget = searchParams.get("redirect") || "matgo://auth";
  const provider = useMemo<SocialProvider | null>(() => {
    const val = searchParams.get("provider");
    return val === "google" || val === "facebook" ? (val as SocialProvider) : null;
  }, [searchParams]);

  const isMissingToken = status === "authenticated" && !(session as any)?.platformToken;

  useEffect(() => {
    if (status === "authenticated" && (session as any)?.platformToken) {
      const token = encodeURIComponent((session as any).platformToken as string);
      const separator = redirectTarget.includes("?") ? "&" : "?";
      const finalUrl = `${redirectTarget}${separator}token=${token}`;
      
      console.log("[MobileAuth] Redirecting back to app:", finalUrl);
      
      // Attempt automatic redirect
      window.location.href = finalUrl;
      
      // Fallback: If still on page after 2s, maybe browser blocked automatic redirect
      const timer = setTimeout(() => {
        // No-op, visual state will show the button
      }, 2000);
      
      return () => clearTimeout(timer);
    }

    if (status === "unauthenticated" && provider && !hasStartedRef.current) {
      hasStartedRef.current = true;
      console.log("[MobileAuth] Starting automatic signIn for provider:", provider);
      void signIn(provider, { callbackUrl: buildCallbackUrl(redirectTarget) });
    }
  }, [provider, redirectTarget, session, status]);

  const startProviderLogin = (nextProvider: SocialProvider) => {
    void signIn(nextProvider, { callbackUrl: buildCallbackUrl(redirectTarget) });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ backgroundColor: "#171513" }}>
      <div className="w-full max-w-sm bg-white/5 border border-white/5 rounded-[2.5rem] p-8 text-center shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-gold-500/10 rounded-[1.6rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto">
          {status === "loading" || provider ? <Loader2 size={28} className="animate-spin" /> : <ShieldCheck size={28} />}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black uppercase italic tracking-tight text-white">Mobil Inloggning</h1>
          <p className={`text-[11px] font-bold uppercase tracking-widest ${isMissingToken ? "text-red-500" : "text-zinc-500"}`}>
            {isMissingToken 
              ? "Kunde inte hämta din profil. Kontrollera API-anslutningen." 
              : (status === "loading" || provider ? "Loggar in och skickar dig tillbaka till appen..." : "Välj samma konto som du vill använda i appen")
            }
          </p>
        </div>

        <div className="space-y-4">
          {!provider && (
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => startProviderLogin("google")}
                className="w-full py-4 px-5 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[11px] hover:bg-white/10 transition-all"
              >
                Fortsätt med Google
              </button>
              <button
                type="button"
                onClick={() => startProviderLogin("facebook")}
                className="w-full py-4 px-5 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[11px] hover:bg-white/10 transition-all"
              >
                Fortsätt med Facebook
              </button>
            </div>
          )}

          {status === "authenticated" && (
            <div className="pt-4 border-t border-white/5 space-y-4">
              <button
                onClick={() => {
                  const token = (session as any)?.platformToken;
                  if (!token) {
                    alert("Inloggning lyckades men vi kunde inte hämta din profil från servern. Kontrollera din internetanslutning eller prova igen senare.");
                    return;
                  }
                  const separator = redirectTarget.includes("?") ? "&" : "?";
                  window.location.href = `${redirectTarget}${separator}token=${token}`;
                }}
                className="w-full py-4 px-5 rounded-2xl bg-gold-500 text-black font-black uppercase tracking-widest text-[11px] shadow-lg shadow-gold-500/20 active:scale-95 transition-all"
              >
                Öppna i appen
              </button>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                Klicka på knappen om du inte skickas tillbaka automatiskt
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MobileAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#171513" }}><Loader2 className="animate-spin text-gold-500" /></div>}>
      <MobileAuthContent />
    </Suspense>
  );
}
