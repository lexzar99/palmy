"use client";

import { useState } from "react";
import axios from "axios";
import { User, Lock, Phone, Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

const RegisterPage = () => {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/register-user`, { name, phone, password, email });
      localStorage.setItem("platform_user_token", res.data.token);
      setSuccess(true);
      setTimeout(() => router.push("/profile"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Registrering misslyckades");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-32 px-6 flex flex-col items-center">
      <Link href="/profile" className="absolute top-8 left-8 text-zinc-500 hover:text-white transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]">
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
             <p className="text-zinc-400 text-xs">Ditt konto har skapats. Skickar dig till din profil...</p>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
             <input 
               type="text" 
               placeholder="Fullständigt namn"
               required
               value={name}
               onChange={(e) => setName(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
             />
             <input 
               type="tel" 
               placeholder="Telefonnummer"
               required
               value={phone}
               onChange={(e) => setPhone(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
             />
             <input 
               type="email" 
               placeholder="E-post (frivilligt)"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
             />
             <input 
               type="password" 
               placeholder="Välj lösenord"
               required
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
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
