"use client";

import { useState } from "react";
import axios from "axios";
import { User, Lock, Phone, Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { persistPlatformSession } from "@/lib/platformSessionClient";

const RegisterPage = () => {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/register-user`, { firstName, lastName, email, phone: phone || undefined, password });
      await persistPlatformSession(res.data.token);
      // Fire-and-forget — backend returnerar alltid 200 (läcker inte konto-existens),
      // men en network-error ska inte fälla själva registreringen.
      axios.post(`${API_URL}/api/account/send-verification-email`, { email }).catch(() => null);
      setSuccess(true);
      setTimeout(() => router.push("/profile"), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error || "Registrering misslyckades");
    } finally {
      setIsRegistering(false);
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
              <User size={32} />
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tight">Skapa <span className="text-gold-500">Konto</span></h1>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Bli medlem för att spara din historik</p>
        </div>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
             <CheckCircle2 size={48} className="text-emerald-500 mx-auto animate-bounce" />
             <h2 className="text-xl font-black uppercase tracking-tight text-emerald-500">Klart!</h2>
             <p className="text-zinc-300 text-xs leading-relaxed">
               Vi skickade en verifieringslänk till <span className="font-black text-emerald-400">{email}</span>.
             </p>
             <p className="text-zinc-500 text-[11px] leading-relaxed">
               Kolla din mejl för att slutföra ditt konto. Skickar dig till din profil...
             </p>
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

        <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
           Har du redan ett konto? <Link href="/profile" className="text-gold-500">Logga in</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
