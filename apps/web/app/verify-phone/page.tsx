import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function VerifyPhonePage() {
  return (
    <div
      className="min-h-screen px-6 pt-24 pb-32 flex items-center justify-center"
      style={{ backgroundColor: "#171513" }}
    >
      <Link
        href="/profile"
        className="absolute top-8 left-8 text-zinc-500 hover:text-white transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]"
      >
        <ArrowLeft size={16} /> Tillbaka
      </Link>

      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
          <ShieldCheck size={32} />
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white">
            Verifiera <span className="text-gold-500">Nummer</span>
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Testsidan med statisk kod ar borttagen. Telefonverifiering sker nu via det riktiga OTP-flodet i din profil.
          </p>
        </div>

        <Link
          href="/profile"
          className="w-full inline-flex items-center justify-center gap-3 bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all"
        >
          Oppna profil
        </Link>
      </div>
    </div>
  );
}
