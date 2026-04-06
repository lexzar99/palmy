"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Save, ToggleLeft, ToggleRight, Clock } from "lucide-react";
import { API_URL } from "@/lib/api";
import { SOUND_OPTIONS, playNotificationSound } from "@/lib/notificationSounds";

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
];

const defaultHours = { open: "11:00", close: "22:00", closed: false };

const AdminSettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    deliveryRadius: 10,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
    notificationSound: "signal-1",
    openingHours: DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {} as Record<string, typeof defaultHours>),
  });

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings`);
        const data = res.data;
        setSettings({
          isOpen: data.isOpen ?? true,
          deliveryFee: data.deliveryFee ?? 49,
          minOrderAmount: data.minOrderAmount ?? 150,
          deliveryRadius: data.deliveryRadius ?? 10,
          estimatedPickupTime: data.estimatedPickupTime ?? 20,
          estimatedDeliveryTime: data.estimatedDeliveryTime ?? 35,
          notificationSound: data.notificationSound ?? "signal-1",
          openingHours: {
            ...DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {}),
            ...(data.openingHours || {}),
          },
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/settings`, settings, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      alert("✅ Inställningar sparade!");
    } catch (err: any) {
      alert(err.response?.data?.error || "Fel vid sparning");
    } finally {
      setSaving(false);
    }
  };

  const updateHours = (day: string, field: string, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], [field]: value },
      },
    }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;
  }

  return (
    <div className="space-y-12 pb-24 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Inställningar</h1>
          <p className="text-[var(--text-primary)]/40 font-medium">Restaurangens öppettider, leverans och tider.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-3 px-8 py-4 bg-gold-500 text-dark-500 font-extrabold rounded-2xl hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 uppercase tracking-widest disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Spara
        </button>
      </div>

      {/* Open/Closed toggle */}
      <div className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-3xl p-8">
        <h2 className="text-xl font-black uppercase tracking-widest mb-8 text-[var(--text-primary)]/60">Restaurangstatus</h2>
        <button
          onClick={() => setSettings({ ...settings, isOpen: !settings.isOpen })}
          className={`flex items-center gap-6 p-6 rounded-2xl border w-full transition-all ${
            settings.isOpen ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
          }`}
        >
          {settings.isOpen ? (
            <ToggleRight size={48} className="text-green-400 flex-shrink-0" />
          ) : (
            <ToggleLeft size={48} className="text-red-400 flex-shrink-0" />
          )}
          <div className="text-left">
            <div className={`text-2xl font-black uppercase ${settings.isOpen ? "text-green-400" : "text-red-400"}`}>
              {settings.isOpen ? "ÖPPEN FÖR BESTÄLLNING" : "STÄNGD"}
            </div>
            <div className="text-[var(--text-primary)]/40 text-sm mt-1">Klicka för att ändra status</div>
          </div>
        </button>
      </div>

      {/* Delivery settings */}
      <div className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-3xl p-8">
        <h2 className="text-xl font-black uppercase tracking-widest mb-8 text-[var(--text-primary)]/60">Leverans & Tider</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-3">Leveransavgift (kr)</label>
            <input
              type="number"
              value={settings.deliveryFee}
              onChange={(e) => setSettings({ ...settings, deliveryFee: parseFloat(e.target.value) || 0 })}
              className="w-full bg-dark-500 border border-[var(--border-subtle)] rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none text-lg font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-3">Minsta order (kr)</label>
            <input
              type="number"
              value={settings.minOrderAmount}
              onChange={(e) => setSettings({ ...settings, minOrderAmount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-dark-500 border border-[var(--border-subtle)] rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none text-lg font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-3">Leveransradie (km)</label>
            <input
              type="number"
              value={settings.deliveryRadius}
              onChange={(e) => setSettings({ ...settings, deliveryRadius: parseFloat(e.target.value) || 0 })}
              className="w-full bg-dark-500 border border-[var(--border-subtle)] rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none text-lg font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-3">Avhämtningstid (min)</label>
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-gold-500" />
              <input
                type="number"
                value={settings.estimatedPickupTime}
                onChange={(e) => setSettings({ ...settings, estimatedPickupTime: parseInt(e.target.value) || 20 })}
                className="flex-1 bg-dark-500 border border-[var(--border-subtle)] rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none text-lg font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-3">Leveranstid (min)</label>
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-gold-500" />
              <input
                type="number"
                value={settings.estimatedDeliveryTime}
                onChange={(e) => setSettings({ ...settings, estimatedDeliveryTime: parseInt(e.target.value) || 35 })}
                className="flex-1 bg-dark-500 border border-[var(--border-subtle)] rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none text-lg font-bold"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-3xl p-8">
        <h2 className="text-xl font-black uppercase tracking-widest mb-8 text-[var(--text-primary)]/60">Ljudnotiser</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOUND_OPTIONS.map((sound) => (
            <button
              key={sound.id}
              type="button"
              onClick={() => setSettings({ ...settings, notificationSound: sound.id })}
              className={`rounded-2xl border p-5 text-left transition-all ${settings.notificationSound === sound.id ? "border-gold-500 bg-gold-500/10 text-gold-500" : "border-[var(--border-strong)] bg-dark-500 hover:bg-[var(--border-subtle)]"}`}
            >
              <div className="text-sm font-black uppercase tracking-[0.2em]">{sound.label}</div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--text-primary)]/40">Tryck för att välja</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    void playNotificationSound(sound.id);
                  }}
                  className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]"
                >
                  Testa
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-3xl p-8">
        <h2 className="text-xl font-black uppercase tracking-widest mb-8 text-[var(--text-primary)]/60">Butiksammanfattning</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Status</div>
            <div className={`text-lg font-black uppercase ${settings.isOpen ? "text-green-400" : "text-red-400"}`}>
              {settings.isOpen ? "Öppen" : "Stängd"}
            </div>
          </div>
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Leveransavgift</div>
            <div className="text-lg font-black text-gold-500">{settings.deliveryFee} kr</div>
          </div>
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Minimiorder</div>
            <div className="text-lg font-black text-gold-500">{settings.minOrderAmount} kr</div>
          </div>
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Leveransradie</div>
            <div className="text-lg font-black text-gold-500">{settings.deliveryRadius} km</div>
          </div>
        </div>
      </div>

      {/* Opening Hours */}
      <div className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-3xl p-8">
        <h2 className="text-xl font-black uppercase tracking-widest mb-8 text-[var(--text-primary)]/60">Öppettider</h2>
        <div className="space-y-4">
          {DAYS.map((day) => {
            const hours = settings.openingHours[day.key] || defaultHours;
            return (
              <div key={day.key} className={`flex items-center gap-6 p-5 rounded-2xl transition-all ${hours.closed ? "bg-white/2 opacity-50" : "bg-dark-500 border border-[var(--border-subtle)]"}`}>
                <div className="w-28 font-bold uppercase text-sm tracking-widest text-[var(--text-primary)]/60 flex-shrink-0">{day.label}</div>
                <div className="flex items-center gap-4 flex-1">
                  <input
                    type="time"
                    value={hours.open}
                    disabled={hours.closed}
                    onChange={(e) => updateHours(day.key, "open", e.target.value)}
                    className="bg-dark-500 border border-[var(--border-strong)] rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-30 focus:ring-2 focus:ring-gold-500/50 outline-none"
                  />
                  <span className="text-[var(--text-primary)]/20 font-black">–</span>
                  <input
                    type="time"
                    value={hours.close}
                    disabled={hours.closed}
                    onChange={(e) => updateHours(day.key, "close", e.target.value)}
                    className="bg-dark-500 border border-[var(--border-strong)] rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-30 focus:ring-2 focus:ring-gold-500/50 outline-none"
                  />
                </div>
                <button
                  onClick={() => updateHours(day.key, "closed", !hours.closed)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hours.closed ? "bg-red-500/20 text-red-400" : "bg-green-500/10 text-green-500 hover:bg-red-500/10 hover:text-red-400"}`}
                >
                  {hours.closed ? "Stängd" : "Öppen"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
