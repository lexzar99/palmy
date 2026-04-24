"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ChefHat,
  Crown,
  Eye,
  Key,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "RESTAURANT_ADMIN" | "STAFF" | "VIEWER" | "ADMIN";
  restaurantName?: string | null;
  restaurantId?: string | null;
  active: boolean;
  createdAt: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  SUPER_ADMIN: { label: "Super Admin", icon: Crown, tone: "bg-amber-300/12 text-amber-100" },
  RESTAURANT_ADMIN: { label: "Restaurangkonto", icon: ChefHat, tone: "bg-emerald-300/12 text-emerald-100" },
  STAFF: { label: "Internal Staff", icon: Users, tone: "bg-sky-300/12 text-sky-100" },
  VIEWER: { label: "Viewer", icon: Eye, tone: "bg-violet-300/12 text-violet-100" },
  ADMIN: { label: "Admin", icon: Shield, tone: "bg-slate-300/12 text-slate-100" },
};

const emptyInvite = {
  name: "",
  email: "",
  role: "SUPER_ADMIN" as "SUPER_ADMIN" | "STAFF" | "VIEWER",
};

export default function StaffPage() {
  const { success, error: toastError } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [inviting, setInviting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);

  const token = getStoredToken();

  const fetchStaff = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/staff`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaff(response.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda teamkonton.");
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [toastError, token]);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  const filtered = useMemo(() => {
    return staff.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query) || (member.restaurantName || "").toLowerCase().includes(query);
    });
  }, [roleFilter, search, staff]);

  const stats = useMemo(() => ({
    total: staff.length,
    superAdmins: staff.filter((member) => member.role === "SUPER_ADMIN").length,
    internal: staff.filter((member) => ["SUPER_ADMIN", "STAFF", "VIEWER"].includes(member.role)).length,
    restaurantAliases: staff.filter((member) => member.role === "RESTAURANT_ADMIN").length,
  }), [staff]);

  const toggleActive = async (member: StaffMember) => {
    if (!token) return;
    try {
      const response = await axios.patch(`${API_URL}/api/admin/staff/${member.id}`, { active: !member.active }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaff((previous) => previous.map((entry) => (entry.id === member.id ? response.data : entry)));
      success(member.active ? "Kontot inaktiverades." : "Kontot aktiverades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera kontot.");
    }
  };

  const resetPassword = async (member: StaffMember) => {
    if (!token) return;
    try {
      const response = await axios.post(`${API_URL}/api/admin/staff/${member.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const temporaryPassword = response.data?.temporaryPassword;
      if (temporaryPassword) {
        await navigator.clipboard.writeText(temporaryPassword);
        success(`Temporärt lösenord kopierat: ${temporaryPassword}`);
      } else {
        success("Lösenordet återställdes.");
      }
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte återställa lösenordet.");
    }
  };

  const inviteAccount = async () => {
    if (!token) return;

    setInviting(true);
    try {
      const response = await axios.post(`${API_URL}/api/admin/staff/invite`, inviteForm, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStaff((previous) => [response.data, ...previous]);
      setInviteModalOpen(false);
      setInviteForm(emptyInvite);

      const temporaryPassword = response.data?.temporaryPassword;
      if (temporaryPassword) {
        await navigator.clipboard.writeText(temporaryPassword);
        success(`Kontot skapades och lösenordet kopierades: ${temporaryPassword}`);
      } else {
        success("Teamkontot skapades.");
      }
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skapa teamkontot.");
    } finally {
      setInviting(false);
    }
  };

  const deleteMember = async () => {
    if (!deleteTarget || !token) return;
    try {
      await axios.delete(`${API_URL}/api/admin/staff/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaff((previous) => previous.filter((entry) => entry.id !== deleteTarget.id));
      setDeleteTarget(null);
      success("Kontot raderades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera kontot.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar teamkonton…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Access registry</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Team och åtkomst i samma register</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Här ser du alla interna adminkonton och restaurangkonton. Själva restaurangernas Flutter-login styrs från restaurangsidan, men du kan aktivera, återställa eller städa konton här.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void fetchStaff()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button type="button" onClick={() => setInviteModalOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Plus size={14} /> Nytt teamkonto
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Totalt", value: stats.total, sub: "Alla adminkonton" },
          { label: "Super Admin", value: stats.superAdmins, sub: "Full access till kontrollcentret" },
          { label: "Interna konton", value: stats.internal, sub: "Core team och support" },
          { label: "Restaurangkonton", value: stats.restaurantAliases, sub: "Konton för Business-appen" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök namn, email eller restaurang" className="control-input pl-10" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "SUPER_ADMIN", "STAFF", "VIEWER", "RESTAURANT_ADMIN"] as const).map((role) => (
                <button key={role} type="button" onClick={() => setRoleFilter(role)} className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${roleFilter === role ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
                  {role === "all" ? "Alla" : ROLE_CONFIG[role]?.label || role}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {filtered.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga konton matchade filtren.
              </div>
            ) : (
              filtered.map((member) => {
                const role = ROLE_CONFIG[member.role] || ROLE_CONFIG.STAFF;
                const Icon = role.icon;

                return (
                  <article key={member.id} className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{member.name}</p>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${role.tone}`}>
                              {role.label}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${member.active ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                              {member.active ? "Aktiv" : "Inaktiv"}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-2"><Mail size={14} /> {member.email}</span>
                            {member.restaurantName ? <span className="inline-flex items-center gap-2"><ChefHat size={14} /> {member.restaurantName}</span> : null}
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">Skapad {new Date(member.createdAt).toLocaleDateString("sv-SE")}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => toggleActive(member)} className="control-chip">
                          <UserCheck size={13} /> {member.active ? "Inaktivera" : "Aktivera"}
                        </button>
                        <button type="button" onClick={() => resetPassword(member)} className="control-chip">
                          <Key size={13} /> Nytt lösenord
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(member)} className="control-chip text-rose-200">
                          <Trash2 size={13} /> Radera
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="panel rounded-[32px] px-6 py-6">
            <div className="flex items-center gap-3 text-sky-100">
              <Shield size={18} />
              <p className="text-sm font-black uppercase tracking-[0.22em]">Hur du använder sidan</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>1. Skapa interna teamkonton här när fler behöver adminaccess.</p>
              <p>2. Återställ lösenord och kopiera det temporära lösenordet direkt till rätt person.</p>
              <p>3. Hantera restaurangens Flutter-login från restaurangsidans Admin-konto-flik när lösenord behöver bytas.</p>
            </div>
          </div>

          <div className="panel rounded-[32px] px-6 py-6">
            <div className="flex items-center gap-3 text-amber-100">
              <InfoCircle />
            </div>
          </div>
        </div>
      </section>

      <Modal open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Skapa teamkonto" maxWidth="max-w-lg">
        <div className="grid gap-4">
          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Namn</span>
            <input value={inviteForm.name} onChange={(event) => setInviteForm((previous) => ({ ...previous, name: event.target.value }))} className="control-input" placeholder="Anna Svensson" />
          </label>
          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Email / login-id</span>
            <input value={inviteForm.email} onChange={(event) => setInviteForm((previous) => ({ ...previous, email: event.target.value }))} className="control-input" placeholder="anna@matgo.se" />
          </label>
          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Roll</span>
            <select value={inviteForm.role} onChange={(event) => setInviteForm((previous) => ({ ...previous, role: event.target.value as typeof inviteForm.role }))} className="control-input">
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="STAFF">Internal Staff</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>

          <div className="rounded-[24px] border border-amber-300/18 bg-amber-300/10 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
            <p className="font-black text-[var(--text-primary)]">Viktigt</p>
            <p className="mt-2">Restaurangernas Flutter-konton skapas inte här längre. De styrs från respektive restaurangsida tillsammans med övrig driftinfo.</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInviteModalOpen(false)} className="control-chip">Avbryt</button>
            <button type="button" onClick={() => void inviteAccount()} disabled={inviting} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018] disabled:opacity-60">
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Skapa konto
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteMember}
        title="Radera konto"
        message={`Radera ${deleteTarget?.name}?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}

function InfoCircle() {
  return (
    <>
      <div className="flex items-center gap-3 text-amber-100">
        <Shield size={18} />
        <p className="text-sm font-black uppercase tracking-[0.22em]">Nuvarande modell</p>
      </div>
      <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
          <p className="font-black text-[var(--text-primary)]">Interna roller</p>
          <p className="mt-2">Superadmin används för full kontroll. Övriga roller finns redo för framtida finare rollstyrning utan att restauranglogiken påverkas.</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
          <p className="font-black text-[var(--text-primary)]">Restaurangkonton</p>
          <p className="mt-2">Konton kopplade till restauranger listas här för översikt, men lösenord och appinloggning underhålls från restaurangsidan.</p>
        </div>
      </div>
    </>
  );
}
