"use client";

import { useState } from "react";
import axios from "axios";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { API_URL, apiErrorMessage } from "@/lib/api";

// Glömt-lösenord-flöde — steg 1 av 2.
//   POST /api/account/forgot-password { email } → alltid 200
// Backend läcker inte om mejlet finns; klienten visar därför alltid
// samma generiska success-text när requesten gått igenom.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);

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
    } catch (err) {
      // Endpoint:n returnerar alltid 200 — om vi får 4xx här är det bara
      // valideringsfel (t.ex. helt ogiltigt format). Visa servermeddelandet
      // eller en fallback.
      setError(apiErrorMessage(err, "Kunde inte skicka länken just nu. Försök igen."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-24 pb-28"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="w-full max-w-[400px]">
        <Link
          href="/login"
          aria-label="Tillbaka"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </Link>

        <h1 className="mt-6 text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Återställ lösenord
        </h1>
        <p className="mt-1.5 text-[14.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Ange din e-postadress så mejlar vi en återställningslänk.
        </p>

        {sent ? (
          <div
            className="mt-7 rounded-xl p-6 text-center space-y-3"
            style={{ backgroundColor: "var(--success-soft)", border: "1px solid color-mix(in srgb, var(--success-ink) 25%, transparent)" }}
          >
            <CheckCircle2 size={32} strokeWidth={1.8} className="mx-auto" style={{ color: "var(--success-ink)" }} />
            <h2 className="text-[16px] font-bold" style={{ color: "var(--success-ink)" }}>Länken är skickad</h2>
            <p className="text-[13.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              Om kontot finns har vi skickat en länk till din mejl. Kolla även skräpposten. Länken gäller i 1 timme.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="block text-[13.5px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                E-post
              </label>
              <input
                type="email"
                placeholder="namn@exempel.se"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="w-full h-12 rounded-xl px-4 text-[15px] font-medium outline-none transition-all placeholder:text-zinc-400"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: `1px solid ${focused ? "var(--text-primary)" : "var(--line-strong)"}`,
                  boxShadow: focused ? "0 0 0 3px rgba(127,127,127,.12)" : "none",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {error && (
              <p className="text-[13px] text-center" style={{ color: "#dc2626" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[52px] bg-gold-500 rounded-xl text-[15.5px] font-semibold active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              style={{ color: "#141416" }}
            >
              {submitting ? <Loader2 className="animate-spin" size={20} /> : "Skicka återställningslänk"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[14px]" style={{ color: "var(--text-secondary)" }}>
          Kom du på lösenordet?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Logga in
          </Link>
        </p>
      </div>
    </div>
  );
}
