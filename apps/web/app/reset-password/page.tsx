"use client";

import { Suspense, useState } from "react";
import axios from "axios";
import { Lock, ArrowLeft, Loader2, CheckCircle2, KeyRound, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";

// Glömt-lösenord-flöde — steg 2 av 2.
//   POST /api/account/reset-password { token, newPassword }
// Tokenen kommer från mejlet (?token=…). Lyckad reset → redirect till home
// efter ~2 sekunder. Misslyckad → felmeddelande, länk för att be om ny.
function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Klient-side guard: visa direkt felview om token saknas helt
  // (annars hade vi gjort ett onödigt API-anrop som ändå skulle 400a).
  const tokenMissing = !token || token.length < 32;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Lösenorden matchar inte");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/account/reset-password`, {
        token,
        newPassword,
      });
      setSuccess(true);
      // Användaren får logga in själv på /profile — vi kan inte autologga
      // eftersom vi inte vet lösenordet i klartext längre (det är hashed).
      setTimeout(() => router.push("/profile"), 2200);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          "Länken är ogiltig eller har gått ut. Be om en ny."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen md:pt-20 pt-24 pb-32 px-6 flex flex-col items-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Link
        href="/profile"
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
            <KeyRound size={32} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight">
            Nytt <span className="text-gold-500">Lösenord</span>
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">
            Välj ett lösenord — minst 8 tecken
          </p>
        </div>

        {tokenMissing ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <AlertTriangle size={48} className="text-red-500 mx-auto" />
            <h2 className="text-xl font-black uppercase tracking-tight text-red-500">Länk saknas</h2>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Den här sidan kräver en återställningslänk. Be om en ny från glömt-lösenord-sidan.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block mt-4 text-gold-500 text-[10px] font-black uppercase tracking-widest"
            >
              Begär ny länk
            </Link>
          </div>
        ) : success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto animate-bounce" />
            <h2 className="text-xl font-black uppercase tracking-tight text-emerald-500">
              Lösenordet är ändrat
            </h2>
            <p className="text-zinc-400 text-xs">Skickar dig till inloggning...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
              />
              <input
                type="password"
                placeholder="Nytt lösenord"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 pl-14 pr-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
              />
            </div>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
              />
              <input
                type="password"
                placeholder="Bekräfta lösenord"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 pl-14 pr-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
              />
            </div>

            {error && (
              <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                "Spara nytt lösenord"
              )}
            </button>
          </form>
        )}

        {!success && !tokenMissing && (
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
            Länken slutade fungera?{" "}
            <Link href="/forgot-password" className="text-gold-500">
              Begär ny
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordContent />
    </Suspense>
  );
}
