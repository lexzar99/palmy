"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const VerifyPhonePage = () => {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError("");
    
    // Simulate verification
    setTimeout(() => {
      if (code === "1234") {
        setSuccess(true);
        setTimeout(() => router.push("/profile"), 2000);
      } else {
        setError("Felaktig kod. Försök igen (Test-kod: 1234)");
        setIsVerifying(false);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen pt-24 pb-32 px-6 flex flex-col items-center justify-center" style={{ backgroundColor: "#171513" }}>
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
              <ShieldCheck size={32} />
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tight">Verifiera <span className="text-gold-500">Nummer</span></h1>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Vi har skickat en kod till ditt nummer</p>
        </div>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-10 text-center space-y-4">
             <CheckCircle2 size={48} className="text-emerald-500 mx-auto animate-bounce" />
             <h2 className="text-xl font-black uppercase tracking-tight text-emerald-500">Verifierad!</h2>
             <p className="text-zinc-400 text-xs">Ditt nummer är nu verifierat. Skickar dig till din profil...</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-6">
             <input 
               type="text" 
               maxLength={4}
               placeholder="1234"
               value={code}
               onChange={(e) => setCode(e.target.value)}
               className="w-full h-20 bg-white/5 border border-white/5 rounded-3xl text-center text-3xl font-black focus:ring-2 focus:ring-gold-500/50 outline-none"
             />
             
             {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}
             
             <button 
               type="submit"
               disabled={isVerifying || code.length < 4}
               className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
             >
               {isVerifying ? <Loader2 className="animate-spin" size={20} /> : "Verifiera"}
             </button>

             <button type="button" className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-all">
                Skicka koden igen
             </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default VerifyPhonePage;
