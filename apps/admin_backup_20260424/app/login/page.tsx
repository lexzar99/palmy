"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken, setStoredAdminSession } from "@/lib/auth-storage";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(`${API_URL}/api/account/login`, {
        identifier,
        password,
      });

      setStoredAdminSession(response.data.token, response.data.admin);
      router.replace(response.data.admin?.role === "SUPER_ADMIN" ? "/dashboard" : "/orders");
    } catch (err: any) {
      setError(err.response?.data?.error || "Inloggningen misslyckades.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-admin-canvas px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,191,91,0.22),_transparent_26%),radial-gradient(circle_at_85%_15%,_rgba(96,165,250,0.08),_transparent_20%)]" />

      <div className="relative grid w-full max-w-[1180px] gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="panel rounded-[40px] px-8 py-8 sm:px-10 sm:py-10">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-gold-gradient text-[28px] font-black text-[#091018] shadow-[0_25px_80px_rgba(245,191,91,0.2)]">
              M
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[var(--text-muted)]">MatGo Control</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.07em] text-[var(--text-primary)] sm:text-5xl">
                Ny adminpanel.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Kontrollera drift, payouts, restaurangstatus och säkerhetsläge i en renare desktop-upplevelse. Samma kärnlogik, mycket tydligare kontroll.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "En kontrollvy istället för spridda dashboard/stats-sidor",
              "Öppettider flyttade till en separat restauranghub",
              "Hårdad inloggning med rate limits och verifierad socket-scope",
              "Finance HQ med payout-beredskap och provisionsöverblick",
            ].map((item) => (
              <div key={item} className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5 text-sm leading-7 text-[var(--text-secondary)]">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3 rounded-[32px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-6 py-6">
            <div className="flex items-center gap-3 text-emerald-100">
              <ShieldCheck size={18} />
              <span className="text-sm font-black uppercase tracking-[0.22em]">Säker desktop-access</span>
            </div>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              Adminsessioner valideras på servern, inloggning är rate-limitad och realtime-rummen accepterar nu bara verifierade tokens med korrekt restaurangscope.
            </p>
          </div>
        </section>

        <section className="panel rounded-[40px] px-8 py-8 sm:px-10 sm:py-10">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[var(--text-muted)]">Authenticated Access</p>
            <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Logga in till kontrolltornet</h2>
            <p className="max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
              Superadmin hanterar plattformen här. Restaurangkonton fortsätter använda MatGo Business utan ändrad grundlogik.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 grid gap-5">
            <label className="grid gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Credential ID
              <div className="relative">
                <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="control-input pl-12"
                  placeholder="admin"
                />
              </div>
            </label>

            <label className="grid gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Access code
              <div className="relative">
                <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="control-input pl-12 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="rounded-[24px] border border-rose-300/18 bg-rose-300/10 px-5 py-4 text-sm leading-6 text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-3 rounded-[26px] bg-gold-gradient px-6 py-5 text-sm font-black uppercase tracking-[0.24em] text-[#091018] disabled:opacity-60"
            >
              {loading ? "Verifierar" : "Öppna panelen"}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-8 grid gap-3 rounded-[32px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-6 py-6">
            <div className="flex items-center gap-3 text-[var(--text-primary)]">
              <ShieldCheck size={18} className="text-emerald-200" />
              <span className="text-sm font-black uppercase tracking-[0.22em]">Vad som är säkrat nu</span>
            </div>
            <div className="grid gap-2 text-sm leading-7 text-[var(--text-secondary)]">
              <p>Admin-login är rate-limitad per IP och identifier.</p>
              <p>Sessioner verifieras utan cache och ogiltiga tokens rensas direkt.</p>
              <p>Socket-rum kräver numera token + scope-verifiering.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
