import { ShieldAlert } from "lucide-react";

/**
 * Native bearer hand-off is intentionally unavailable for launch. The former
 * page exposed a 30-day platform JWT inside a custom-scheme URL, which could be
 * intercepted by another app registering the same custom scheme. Native auth
 * must return with PKCE + a one-time server code over claimed HTTPS app links.
 */
export default function MobileAuthPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ backgroundColor: "#171513" }}
    >
      <section className="w-full max-w-sm rounded-[2.5rem] border border-white/10 bg-white/5 p-8 text-center shadow-2xl space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <ShieldAlert size={28} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-white">
            Uppdatering krävs
          </h1>
          <p className="text-sm leading-relaxed text-zinc-300">
            Den här appversionens verifiering är avstängd av säkerhetsskäl.
            Uppdatera ViaEats-appen innan du verifierar numret igen.
          </p>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Kod: NATIVE_AUTH_UPDATE_REQUIRED
        </p>
      </section>
    </main>
  );
}
