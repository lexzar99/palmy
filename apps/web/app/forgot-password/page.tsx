"use client";

import { useState } from "react";
import axios from "axios";
import { Mail, ArrowLeft, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { API_URL } from "@/lib/api";

// Glömt-lösenord-flöde — steg 1 av 2.
//   POST /api/account/forgot-password { email } → alltid 200
// Backend läcker inte om mejlet finns; klienten visar därför alltid
// samma generiska success-text när requesten gått igenom.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Ange en giltig e-postadress");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/account/forgot-password`, {
        email: email.trim(),
      });
      setSent(true);
    } catch (err: any) {
      // Endpoint:n returnerar alltid 200 — om vi får 4xx här är det bara
      // valideringsfel (t.ex. helt ogiltigt format). Visa servermeddelandet
      // eller en fallback.
      setError(err?.response?.data?.error || "Kunde inte skicka länken just nu. Försök igen.");
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
            Glömt <span className="text-gold-500">Lösenord</span>
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">
            Vi mejlar en återställningslänk
          </p>
        </div>

        {sent ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black uppercase tracking-tight text-emerald-500">Klart!</h2>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Om kontot finns har vi skickat en länk till din mejl. Kolla även skräpposten.
            </p>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest pt-2">
              Länken gäller i 1 timme
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
              />
              <input
                type="email"
                placeholder="E-post"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                "Skicka återställningslänk"
              )}
            </button>
          </form>
        )}

        <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
          Kom du på lösenordet?{" "}
          <Link href="/profile" className="text-gold-500">
            Logga in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
