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
    const value = searchParams.get("provider");
    return value === "google" || value === "facebook" ? value : null;
  }, [searchParams]);

  useEffect(() => {
    if (status === "authenticated" && (session as any)?.platformToken) {
      const token = encodeURIComponent((session as any).platformToken as string);
      const separator = redirectTarget.includes("?") ? "&" : "?";
      window.location.replace(`${redirectTarget}${separator}token=${token}`);
      return;
    }

    if (status === "unauthenticated" && provider && !hasStartedRef.current) {
      hasStartedRef.current = true;
      void signIn(provider, { callbackUrl: buildCallbackUrl(redirectTarget) });
    }
  }, [provider, redirectTarget, session, status]);

  const startProviderLogin = (nextProvider: SocialProvider) => {
    void signIn(nextProvider, { callbackUrl: buildCallbackUrl(redirectTarget) });
  };

  return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-white/5 border border-white/5 rounded-[2.5rem] p-8 text-center shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-gold-500/10 rounded-[1.6rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto">
          {status === "loading" || provider ? <Loader2 size={28} className="animate-spin" /> : <ShieldCheck size={28} />}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black uppercase italic tracking-tight text-white">Mobil Inloggning</h1>
          <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
            {status === "loading" || provider ? "Loggar in och skickar dig tillbaka till appen..." : "Välj samma konto som du vill använda i appen"}
          </p>
        </div>

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
      </div>
    </div>
  );
}

export default function MobileAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" /></div>}>
      <MobileAuthContent />
    </Suspense>
  );
}
