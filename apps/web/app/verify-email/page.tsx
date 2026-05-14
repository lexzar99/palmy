"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, Loader2, CheckCircle2, MailCheck, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { persistPlatformSession } from "@/lib/platformSessionClient";

// Email-verifierings-flöde — steg 2 av 2.
//   GET  ?token=…              ← länk från mejlet, auto-postar nedan
//   POST /api/account/verify-email { token }  → { ok, token, email, user }
// Lyckad verify: vi har nu en JWT (det är "första login"-momentet för
// email-registrerade användare). Vi persistar plattforms-sessionen och
// redirectar in i appen. Misslyckad → felmeddelande + möjlighet att be
// om en ny länk via /register.
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  // Två tillstånd vid mount: vi har en token och försöker verifiera, eller
  // tokenen saknas helt.
  const [status, setStatus] = useState<"verifying" | "success" | "error" | "missing">(
    !token || token.length < 32 ? "missing" : "verifying"
  );
  const [error, setError] = useState("");
  // En enda POST per page-load — React 19 strict-mode kör effects två gånger,
  // så vi guardar med en ref för att slippa dubbel-API-anrop.
  const sent = useRef(false);

  useEffect(() => {
    if (status !== "verifying") return;
    if (sent.current) return;
    sent.current = true;

    (async () => {
      try {
        const res = await axios.post(`${API_URL}/api/account/verify-email`, { token });
        // Backend returnerar nu en JWT på lyckad verifiering — det är
        // användarens "första inloggning". Vi persistar sessionen och
        // skickar in dem i appen efter en kort bekräftelse.
        const jwt = res.data?.token;
        if (jwt) {
          try {
            await persistPlatformSession(jwt);
          } catch {
            // Persist-fel — användaren får logga in manuellt. Vi fortsätter
            // ändå visa success-vyn så de vet att kontot är verifierat.
          }
        }
        setStatus("success");
        // Liten paus så användaren ser bekräftelsen innan vi flyttar dem.
        setTimeout(() => router.push("/profile"), 1500);
      } catch (err: any) {
        setError(
          err?.response?.data?.error ||
            "Länken är ogiltig eller har gått ut. Be om en ny."
        );
        setStatus("error");
      }
    })();
  }, [token, status, router]);

  return (
    <div
      className="min-h-screen md:pt-20 pt-24 pb-32 px-6 flex flex-col items-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Link
        href="/"
        className="absolute top-8 left-8 transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} /> Tillbaka
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-10"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
            <MailCheck size={32} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight">
            Verifiera <span className="text-gold-500">Email</span>
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">
            Vi bekräftar din e-postadress
          </p>
        </div>

        {status === "missing" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <AlertTriangle size={48} className="text-red-500 mx-auto" />
            <h2 className="text-xl font-black uppercase tracking-tight text-red-500">Länk saknas</h2>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Den här sidan kräver en verifieringslänk från mejlet vi skickat.
              Öppna länken i mejlet på samma enhet.
            </p>
          </div>
        )}

        {status === "verifying" && (
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 text-center space-y-4">
            <Loader2 className="animate-spin text-gold-500 mx-auto" size={48} />
            <p className="text-zinc-400 text-xs leading-relaxed">
              Bekräftar din e-postadress…
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto animate-bounce" />
            <h2 className="text-xl font-black uppercase tracking-tight text-emerald-500">
              Din e-post är verifierad
            </h2>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Tack! Vi loggar in dig och tar dig till din profil…
            </p>
            <Link
              href="/profile"
              className="inline-block mt-4 bg-gold-500 hover:bg-gold-600 text-zinc-950 px-6 py-3 rounded-3xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all"
            >
              Till profilen
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <AlertTriangle size={48} className="text-red-500 mx-auto" />
            <h2 className="text-xl font-black uppercase tracking-tight text-red-500">
              Kunde inte verifiera
            </h2>
            <p className="text-zinc-400 text-xs leading-relaxed">{error}</p>
            <Link
              href="/register"
              className="inline-block mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-gold-500 transition-colors"
            >
              Be om en ny länk
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <Loader2 className="animate-spin text-gold-500" size={40} />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
