"use client";

import { useState } from "react";
import axios from "axios";
import { User, ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { API_URL } from "@/lib/api";

// Email-registreringen utfärdar INTE längre JWT direkt. Backend skickar
// verifieringsmejl och svarar med { ok, email }. Vi visar då en persistent
// "kolla din mejl"-vy med möjlighet att skicka om länken eller gå tillbaka
// till login. Användaren slutför inloggningen genom att klicka i mejlet —
// verify-email-sidan (eller foodgo://verify-email-deep-länken på mobil) tar
// emot tokenen, byter mot JWT och persistar sessionen.
const RegisterPage = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError("");
    try {
      // Backend skapar konto + skickar verifieringsmejl + svarar med
      // { ok, email } (ingen token!). Klienten får INTE försöka logga in
      // användaren här — vi visar bara "kolla din mejl"-läget.
      await axios.post(`${API_URL}/api/account/register-user`, {
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        password,
      });
      setRegisteredEmail(email);
    } catch (err: any) {
      setError(err.response?.data?.error || "Registrering misslyckades");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResendStatus("sending");
    try {
      await axios.post(`${API_URL}/api/account/send-verification-email`, { email: registeredEmail });
      setResendStatus("sent");
      setTimeout(() => setResendStatus("idle"), 4000);
    } catch {
      setResendStatus("error");
      setTimeout(() => setResendStatus("idle"), 4000);
    }
  };

  return (
    <div className="min-h-screen md:pt-20 pt-24 pb-32 px-6 flex flex-col items-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Link href="/profile" className="absolute top-8 left-8 transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft size={16} /> Tillbaka
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-10"
      >
        <div className="text-center space-y-4">
           <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
              {registeredEmail ? <MailCheck size={32} /> : <User size={32} />}
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tight">
             {registeredEmail ? <>Kolla din <span className="text-gold-500">Mejl</span></> : <>Skapa <span className="text-gold-500">Konto</span></>}
           </h1>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">
             {registeredEmail ? "Verifiering krävs innan första inloggningen" : "Bli medlem för att spara din historik"}
           </p>
        </div>

        {registeredEmail ? (
          <div className="space-y-5">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[2.5rem] p-8 text-center space-y-3">
               <p className="text-zinc-200 text-[13px] leading-relaxed">
                 Vi skickade en verifieringslänk till{" "}
                 <span className="font-black text-emerald-400 break-all">{registeredEmail}</span>.
               </p>
               <p className="text-zinc-400 text-[11px] leading-relaxed">
                 Klicka på länken i mejlet för att slutföra registreringen och logga in.
                 Länken gäller i 24 timmar.
               </p>
               <p className="text-zinc-500 text-[10px] leading-relaxed">
                 Hittar du inte mejlet? Kolla skräpposten.
               </p>
            </div>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus === "sending"}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-4 rounded-3xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {resendStatus === "sending" ? <Loader2 className="animate-spin" size={14} /> : null}
              {resendStatus === "sent" ? "Länken skickad igen" : resendStatus === "error" ? "Försök igen" : "Skicka igen"}
            </button>

            <Link
              href="/profile"
              className="block text-center text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-gold-500 transition-colors"
            >
              Tillbaka till login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
             <input
               type="text"
               placeholder="Förnamn"
               required
               value={firstName}
               onChange={(e) => setFirstName(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
             />
             <input
               type="text"
               placeholder="Efternamn"
               required
               value={lastName}
               onChange={(e) => setLastName(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
             />
             <input
               type="email"
               placeholder="E-post"
               required
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
             />
             <input
               type="tel"
               placeholder="Telefonnummer (+46 70 000 00 00)"
               required
               value={phone}
               onChange={(e) => setPhone(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
             />
             <input
               type="password"
               placeholder="Välj lösenord"
               required
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500 text-white"
             />

             {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}

             <button
               type="submit"
               disabled={isRegistering}
               className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
             >
               {isRegistering ? <Loader2 className="animate-spin" size={20} /> : "Skapa Konto"}
             </button>
          </form>
        )}

        {!registeredEmail && (
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
             Har du redan ett konto? <Link href="/profile" className="text-gold-500">Logga in</Link>
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default RegisterPage;
