"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Loader2, Settings, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    ordersToday: 0,
    totalOrders: 0,
    revenueToday: 0,
    pendingOrders: 0,
  });
  const [settings, setSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
  });

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("palmyra_token") || ""}` },
      }),
      axios.get(`${API_URL}/api/settings`),
    ]).then(([statsRes, settingsRes]) => {
      setStats(statsRes.data);
      setSettings({
        isOpen: settingsRes.data.isOpen ?? true,
        deliveryFee: settingsRes.data.deliveryFee ?? 49,
        minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Palmyra Control Center</div>
            <h1 className="text-4xl font-black uppercase tracking-tight">Översikt</h1>
            <p className="mt-3 max-w-2xl text-white/40">
              Meny, avgifter och orderflöde är nu tänkta att styras från samma panel. Härifrån kan du snabbt hoppa vidare till det som behöver uppmärksamhet.
            </p>
          </div>
          <div className={`rounded-2xl border px-5 py-4 ${settings.isOpen ? "border-green-500/20 bg-green-500/10 text-green-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>
            <div className="text-[10px] uppercase tracking-[0.3em] opacity-70">Status</div>
            <div className="mt-1 text-xl font-black uppercase">{settings.isOpen ? "Öppen" : "Stängd"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/20">Beställningar idag</div>
          <div className="mt-3 text-3xl font-black text-gold-500">{stats.ordersToday}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/20">Väntar nu</div>
          <div className="mt-3 text-3xl font-black text-gold-500">{stats.pendingOrders}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/20">Omsättning idag</div>
          <div className="mt-3 text-3xl font-black text-gold-500">{stats.revenueToday} kr</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/20">Minimiorder / leverans</div>
          <div className="mt-3 text-xl font-black text-gold-500">{settings.minOrderAmount} kr / {settings.deliveryFee} kr</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Link href="/orders" className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:border-gold-500/30 hover:bg-white/10">
          <ShoppingCart className="text-gold-500" size={24} />
          <h2 className="mt-5 text-2xl font-black uppercase">Beställningar</h2>
          <p className="mt-2 text-white/40">Hantera inkommande order och följ status i realtid.</p>
          <div className="mt-6 flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-gold-500">Öppna <ArrowRight size={16} /></div>
        </Link>
        <Link href="/menu" className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:border-gold-500/30 hover:bg-white/10">
          <UtensilsCrossed className="text-gold-500" size={24} />
          <h2 className="mt-5 text-2xl font-black uppercase">Meny & import</h2>
          <p className="mt-2 text-white/40">Synka Eatsmart-menyn, justera kategorier och koppla tillbehör utan dubbelloggik.</p>
          <div className="mt-6 flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-gold-500">Öppna <ArrowRight size={16} /></div>
        </Link>
        <Link href="/settings" className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:border-gold-500/30 hover:bg-white/10">
          <Settings className="text-gold-500" size={24} />
          <h2 className="mt-5 text-2xl font-black uppercase">Inställningar</h2>
          <p className="mt-2 text-white/40">Styr öppetstatus, leveransavgift, minimiorder och tider från en enda källa.</p>
          <div className="mt-6 flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-gold-500">Öppna <ArrowRight size={16} /></div>
        </Link>
      </div>
    </div>
  );
}
