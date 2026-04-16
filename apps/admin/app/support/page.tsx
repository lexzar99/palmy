/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LifeBuoy, Mail, Phone, MessageSquare, AlertCircle, Clock,
  CheckCircle2, Inbox, Star, Filter, Search, Send
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Mock data (since no API endpoint might exist yet for Tickets, we build it to work stand-alone first)
const MOCK_TICKETS = [
  { id: "T-1004", subject: "Saknad vara i leverans", customer: "Anna Svensson", status: "OPEN", priority: "HIGH", time: "10 min sedan", msg: "Hej, jag saknade min dricka i min senaste beställning från KebabHuset." },
  { id: "T-1003", subject: "Kan inte byta lösenord", customer: "Johan Andersson", status: "PENDING", priority: "MEDIUM", time: "2 tim sedan", msg: "Får inget SMS när jag försöker byta lösenord." },
  { id: "T-1002", subject: "Fel på kvitto", customer: "Maria Nilsson", status: "CLOSED", priority: "LOW", time: "Igår", msg: "Momsen ser fel ut på mitt kvitto från förra veckan." },
  { id: "T-1001", subject: "Sen leverans", customer: "Erik Karlsson", status: "OPEN", priority: "HIGH", time: "1 d sedan", msg: "Maten kom 45 minuter sent och var kall!" },
];

export default function SupportDeskPage() {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false); // Simulate load
  
  useEffect(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 600); // UI feel
  }, []);

  const selectedTicket = useMemo(() => tickets.find(t => t.id === selectedTicketId), [tickets, selectedTicketId]);

  const filteredTickets = useMemo(() => {
    if (filter === "ALL") return tickets;
    return tickets.filter(t => t.status === filter);
  }, [tickets, filter]);

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === "OPEN").length,
    pending: tickets.filter(t => t.status === "PENDING").length,
  };

  const prioritizeColor = (prio: string) => {
    switch(prio) {
      case "HIGH": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "MEDIUM": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default: return "text-sky-400 bg-sky-500/10 border-sky-500/20";
    }
  };

  const statusColor = (status: string) => {
     switch(status) {
       case "OPEN": return "text-emerald-400";
       case "PENDING": return "text-amber-400";
       case "CLOSED": return "text-[var(--text-secondary)]";
       default: return "text-white";
     }
  };

  const handleResolve = () => {
    if (!selectedTicketId) return;
    setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, status: "CLOSED" } : t));
    setSelectedTicketId(null);
  };

  return (
    <div className="space-y-8 pb-24 text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <LifeBuoy className="text-gold-500" size={28} /> Support Desk
          </h1>
          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-[0.2em] mt-2">
            Central Ärendehantering · Live
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Öppna Ärenden", val: stats.open, icon: AlertCircle, color: "text-rose-400" },
          { label: "Väntande (Kräver Svar)", val: stats.pending, icon: Clock, color: "text-amber-400" },
          { label: "Lösta Idag", val: "12", icon: CheckCircle2, color: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="p-6 rounded-[2rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-5 opacity-10 group-hover:scale-110 transition-transform duration-500 ${s.color}`}>
              <s.icon size={50} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{s.label}</p>
            <p className={`text-4xl font-black mt-2 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Main UI */}
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6 max-h-[800px]">
        {/* Inbox List */}
        <div className="h-[70vh] flex flex-col rounded-[2.5rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-4">
             <div className="flex gap-2">
               {["ALL", "OPEN", "PENDING", "CLOSED"].map(f => (
                 <button key={f} onClick={() => setFilter(f)}
                   className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all ${filter === f ? "bg-gold-500 text-zinc-950 shadow-md" : "text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-white"}`}>
                   {f === "ALL" ? "Inkorg" : f}
                 </button>
               ))}
             </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
             {filteredTickets.map(t => (
               <div key={t.id} onClick={() => setSelectedTicketId(t.id)}
                 className={`p-4 rounded-3xl cursor-pointer border transition-all ${selectedTicketId === t.id ? "bg-gold-500/10 border-gold-500/30" : "bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:border-gold-500/20"}`}>
                 <div className="flex justify-between items-start mb-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border ${prioritizeColor(t.priority)}`}>
                     {t.priority}
                   </span>
                   <span className="text-[9px] font-bold text-[var(--text-secondary)]">{t.time}</span>
                 </div>
                 <h3 className={`text-sm font-black uppercase tracking-tight ${selectedTicketId === t.id ? "text-gold-500" : "text-white"}`}>
                   {t.subject}
                 </h3>
                 <p className="text-[10px] text-[var(--text-secondary)] font-bold mt-1.5 flex items-center gap-1.5">
                   <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'OPEN' ? 'bg-emerald-400' : t.status === 'PENDING' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                   {t.customer}
                 </p>
               </div>
             ))}
          </div>
        </div>

        {/* Chat / Ticket View */}
        <div className="h-[70vh] rounded-[2.5rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden flex flex-col">
          {!selectedTicket ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-30">
               <Inbox size={48} className="mb-4" />
               <p className="text-[10px] font-black uppercase tracking-widest">Klicka på ett ärende för att svara</p>
             </div>
          ) : (
             <div className="flex-1 flex flex-col relative h-full">
               {/* Head */}
               <div className="p-6 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex justify-between items-center z-10">
                 <div>
                   <h2 className="text-xl font-black uppercase tracking-tight">{selectedTicket.subject}</h2>
                   <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">
                     Ärende #{selectedTicket.id} · Från: <span className="text-gold-500">{selectedTicket.customer}</span>
                   </p>
                 </div>
                 <div className="flex gap-2">
                   {selectedTicket.status !== "CLOSED" && (
                     <button onClick={handleResolve} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                       <CheckCircle2 size={12} /> Markera Löst
                     </button>
                   )}
                 </div>
               </div>

               {/* Chat Body */}
               <div className="flex-1 p-6 overflow-y-auto space-y-6">
                 {/* Customer Msg */}
                 <div className="flex gap-4">
                   <div className="w-10 h-10 rounded-2xl bg-gold-500 flex items-center justify-center text-[#0d0d0d] font-black shrink-0">
                     {selectedTicket.customer.charAt(0)}
                   </div>
                   <div className="bg-[var(--bg-primary)] border border-white/5 p-4 rounded-2xl rounded-tl-sm max-w-[80%]">
                     <p className="text-xs font-bold leading-relaxed">{selectedTicket.msg}</p>
                     <p className="text-[8px] font-black uppercase text-[var(--text-secondary)] mt-3 text-right">{selectedTicket.time}</p>
                   </div>
                 </div>

                 {/* System context (optional logic)*/}
                 <div className="flex justify-center">
                   <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--bg-primary)] px-3 py-1 rounded-full border border-[var(--border-subtle)]">
                     Kunden använde MatGo iOS App v2.1.0
                   </span>
                 </div>
               </div>

               {/* Reply Box */}
               {selectedTicket.status !== "CLOSED" ? (
                 <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                   <div className="relative">
                     <textarea 
                       value={reply}
                       onChange={e => setReply(e.target.value)}
                       placeholder="Skriv ditt svar här..." 
                       className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 pr-16 resize-none outline-none font-bold text-sm focus:border-gold-500/30 transition-all min-h-[100px]"
                     />
                     <button className="absolute bottom-4 right-4 w-10 h-10 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-xl flex items-center justify-center transition-all shadow-[0_0_15px_rgba(231,178,75,0.3)]">
                       <Send size={16} className="-ml-0.5" />
                     </button>
                   </div>
                 </div>
               ) : (
                 <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center text-[10px] font-black uppercase tracking-widest text-emerald-400/50">
                    Detta ärende är stängt
                 </div>
               )}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
