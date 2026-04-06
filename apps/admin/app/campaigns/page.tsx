/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { 
  Sparkles, 
  Users, 
  Store, 
  ArrowRight,
  Gift,
  Ticket
} from "lucide-react";
import { motion } from "framer-motion";

export default function CampaignsHubPage() {
  return (
    <div className="min-h-screen glass p-4 lg:p-10 text-[var(--text-primary)] font-sans">
      <div className="max-w-[1000px] mx-auto">
        
        {/* Header */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-2 text-gold-500">
            <Sparkles size={20} />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none text-gold-500/50">Marknadsföring & Kampanjer</span>
          </div>
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter uppercase italic leading-none">
            VÄLJ <span className="text-gold-500">KAMPANJ-TYP</span>
          </h1>
          <p className="text-[var(--text-primary)]/20 text-xs font-bold uppercase tracking-widest mt-4">Välj vad du vill hantera för att komma igång.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <Link href="/campaigns/restaurants" className="group relative glass border border-[var(--border-subtle)] rounded-[3rem] p-12 overflow-hidden transition-all hover:border-gold-500/30 hover:-translate-y-2">
              <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 blur-[80px] group-hover:bg-emerald-500/10 transition-all" />
              <div className="w-16 h-16 bg-emerald-500/10 flex items-center justify-center rounded-2xl text-emerald-500 mb-8 group-hover:scale-110 transition-transform">
                 <Store size={32} />
              </div>
              <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-4">Restaurang <span className="text-emerald-500">Erbjudanden</span></h2>
              <p className="text-[11px] font-black text-[var(--text-primary)]/20 uppercase tracking-widest leading-relaxed mb-10 max-w-[200px]">Hantera generella rabatter, kombodeals och erbjudanden som syns för alla på menyn.</p>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                 Gå vidare <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
              </div>
           </Link>

           <Link href="/campaigns/customers" className="group relative glass border border-[var(--border-subtle)] rounded-[3rem] p-12 overflow-hidden transition-all hover:border-gold-500/30 hover:-translate-y-2">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gold-500/5 blur-[80px] group-hover:bg-gold-500/10 transition-all" />
              <div className="w-16 h-16 bg-gold-500/10 flex items-center justify-center rounded-2xl text-gold-500 mb-8 group-hover:scale-110 transition-transform">
                 <Users size={32} />
              </div>
              <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-4">Kund <span className="text-gold-500">Unika Deals</span></h2>
              <p className="text-[11px] font-black text-[var(--text-primary)]/20 uppercase tracking-widest leading-relaxed mb-10 max-w-[200px]">Skapa riktade kampanjer med personliga, telefon-låsta koder till specifika kundgrupper.</p>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gold-500">
                 Gå vidare <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
              </div>
           </Link>
        </div>

      </div>
    </div>
  );
}
