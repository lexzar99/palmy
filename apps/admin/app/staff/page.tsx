 
"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Shield,
  Loader2,
  Plus,
  X,
  Trash2,
  Search,
  Users,
  Crown,
  ChefHat,
  Eye,
  UserCheck,
  Clock,
  Mail,
  Phone,
  Key,
  Copy,
  RefreshCw,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { motion, AnimatePresence } from "framer-motion";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "SUPER_ADMIN" | "RESTAURANT_ADMIN" | "STAFF" | "VIEWER";
  restaurantName?: string;
  restaurantId?: string;
  lastLogin?: string;
  active: boolean;
  createdAt: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  SUPER_ADMIN: { label: "Super Admin", color: "text-gold-500", bg: "bg-gold-500/10", icon: Crown },
  RESTAURANT_ADMIN: { label: "Restaurang Admin", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: ChefHat },
  STAFF: { label: "Personal", color: "text-sky-400", bg: "bg-sky-500/10", icon: Users },
  VIEWER: { label: "Granskare", color: "text-violet-400", bg: "bg-violet-500/10", icon: Eye },
};

export default function StaffPage() {
  const { success, error: toastError } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "STAFF" as string,
    restaurantId: "",
  });
  const [restaurants, setRestaurants] = useState<any[]>([]);

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/staff`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setStaff(res.data || []);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRestaurants = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/restaurants`);
      setRestaurants(res.data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchRestaurants();
  }, [fetchStaff, fetchRestaurants]);

  const handleInvite = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toastError("Fyll i namn och email");
      return;
    }
    setInviting(true);
    try {
      await axios.post(
        `${API_URL}/api/admin/staff/invite`,
        form,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      success("Inbjudan skickad!");
      setForm({ name: "", email: "", phone: "", role: "STAFF", restaurantId: "" });
      setShowInvite(false);
      fetchStaff();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte bjuda in");
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/admin/staff/${id}`,
        { active: !active },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active: !active } : s))
      );
      success(active ? "Konto inaktiverat" : "Konto aktiverat");
    } catch {
      toastError("Kunde inte uppdatera");
    }
  };

  const removeStaff = async (id: string) => {
    if (!confirm("Ta bort denna personal?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/staff/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setStaff((prev) => prev.filter((s) => s.id !== id));
      success("Personal borttagen");
    } catch {
      toastError("Kunde inte ta bort");
    }
  };

  const resetPassword = async (id: string) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/admin/staff/${id}/reset-password`,
        {},
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      const tempPw = res.data?.temporaryPassword;
      if (tempPw) {
        navigator.clipboard.writeText(tempPw);
        success(`Temporärt lösenord kopierat: ${tempPw}`);
      } else {
        success("Återställningslänk skickad via email");
      }
    } catch {
      toastError("Kunde inte återställa lösenord");
    }
  };

  const filtered = staff.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && s.role !== roleFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
          Laddar personal…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Personal & Roller
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            Teamhantering & behörigheter
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-5 py-3 bg-gold-gradient text-[#0d0d0d] rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all glow-gold-sm"
        >
          <Plus size={14} /> Bjud in
        </button>
      </div>

      {/* Role overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(ROLE_CONFIG).map(([roleKey, config]) => {
          const Icon = config.icon;
          const count = staff.filter((s) => s.role === roleKey).length;
          return (
            <button
              key={roleKey}
              onClick={() => setRoleFilter(roleFilter === roleKey ? null : roleKey)}
              className={`p-4 rounded-2xl border bg-[var(--bg-secondary)] transition-all text-left ${
                roleFilter === roleKey ? "border-gold-500/20" : "border-[var(--border-subtle)] hover:border-gold-500/10"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center`}>
                  <Icon size={15} className={config.color} />
                </div>
                {roleFilter === roleKey && (
                  <span className="text-[7px] font-black uppercase text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded">
                    Filter
                  </span>
                )}
              </div>
              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
                {config.label}
              </div>
              <div className={`text-xl font-black ${config.color}`}>{count}</div>
            </button>
          );
        })}
      </div>

      {/* Search & filter */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök personal…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-gold-500/30"
          />
        </div>
        {roleFilter && (
          <button
            onClick={() => setRoleFilter(null)}
            className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-[8px] font-black uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Rensa filter
          </button>
        )}
      </div>

      {/* Staff list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Users size={40} className="mx-auto mb-4 text-[var(--text-secondary)] opacity-20" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
              {search || roleFilter ? "Inga matchningar" : "Ingen personal ännu"}
            </p>
          </div>
        ) : (
          filtered.map((member) => {
            const roleConf = ROLE_CONFIG[member.role] || ROLE_CONFIG.STAFF;
            const RoleIcon = roleConf.icon;
            return (
              <div
                key={member.id}
                className={`p-4 rounded-2xl border bg-[var(--bg-secondary)] transition-all ${
                  !member.active
                    ? "border-[var(--border-subtle)] opacity-40"
                    : "border-[var(--border-subtle)] hover:border-gold-500/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl ${roleConf.bg} flex items-center justify-center shrink-0 text-base font-black ${roleConf.color}`}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-black uppercase tracking-wide text-[var(--text-primary)]">
                        {member.name}
                      </span>
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-black ${roleConf.bg} ${roleConf.color} border border-current/20 uppercase`}>
                        <RoleIcon size={9} /> {roleConf.label}
                      </span>
                      {!member.active && (
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                          Inaktiv
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[9px] font-bold text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Mail size={10} /> {member.email}
                      </span>
                      {member.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={10} /> {member.phone}
                        </span>
                      )}
                      {member.restaurantName && (
                        <span className="flex items-center gap-1">
                          <ChefHat size={10} /> {member.restaurantName}
                        </span>
                      )}
                      {member.lastLogin && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {new Date(member.lastLogin).toLocaleDateString("sv-SE")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(member.id, member.active)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        member.active
                          ? "text-emerald-400 hover:bg-emerald-500/10"
                          : "text-[var(--text-secondary)] hover:bg-white/[0.04]"
                      }`}
                      title={member.active ? "Inaktivera" : "Aktivera"}
                    >
                      <UserCheck size={14} />
                    </button>
                    <button
                      onClick={() => resetPassword(member.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-sky-400 hover:bg-sky-500/10 transition-all"
                      title="Återställ lösenord"
                    >
                      <Key size={14} />
                    </button>
                    <button
                      onClick={() => removeStaff(member.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Ta bort"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 cmd-overlay"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md rounded-2xl p-6 border border-[var(--border-subtle)] shadow-2xl"
              style={{ background: "var(--bg-secondary)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                  Bjud In Personal
                </h2>
                <button onClick={() => setShowInvite(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Namn
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Anna Svensson"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="anna@matgo.se"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Telefon (valfritt)
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="07xxxx"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Roll
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setForm({ ...form, role: key })}
                          className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                            form.role === key
                              ? `border-gold-500/30 ${config.bg}`
                              : "border-[var(--border-subtle)] hover:border-gold-500/10"
                          }`}
                        >
                          <Icon size={14} className={config.color} />
                          <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-primary)]">
                            {config.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(form.role === "RESTAURANT_ADMIN" || form.role === "STAFF") && restaurants.length > 0 && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                      Restaurang
                    </label>
                    <select
                      value={form.restaurantId}
                      onChange={(e) => setForm({ ...form, restaurantId: e.target.value })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[10px] font-bold text-[var(--text-primary)] outline-none"
                    >
                      <option value="">Välj restaurang…</option>
                      {restaurants.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                onClick={handleInvite}
                disabled={inviting}
                className="w-full mt-6 flex items-center justify-center gap-2 px-5 py-3 bg-gold-gradient text-[#0d0d0d] rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 glow-gold-sm"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Skicka Inbjudan
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
