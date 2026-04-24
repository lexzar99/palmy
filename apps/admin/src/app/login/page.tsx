"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { apiPost } from "@/shared/api/client";
import { getStoredToken, setStoredAdminSession } from "@/shared/auth/storage";
import { Button, Field, Input, Surface } from "@/shared/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await apiPost<{ token: string; admin: { id: string; email: string; name?: string; role: string; restaurantId?: string | null; restaurantSlug?: string | null; restaurantName?: string | null } }>(
        "/account/login",
        { identifier, password },
      );
      setStoredAdminSession(response.token, response.admin);
      router.replace("/dashboard");
    } catch (caught: any) {
      setError(caught?.response?.data?.error || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Surface className="px-8 py-8 lg:px-10 lg:py-10">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-2xl font-black text-[#11151b]">
              M
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">MatGo Control</p>
              <h1 className="section-title mt-3">Admin rebuilt for focused operations</h1>
              <p className="section-subtitle">Restaurants, orders, menu, finance and zones now run inside a modular control surface with strict API-driven state.</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Dashboard and health on one clear overview",
              "Restaurant management split from delivery zoning",
              "React Query for all server state",
              "Realtime order invalidation via sockets",
            ].map((item) => (
              <div key={item} className="surface-muted px-5 py-5 text-sm leading-7 text-[var(--text-secondary)]">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 surface-muted px-5 py-5">
            <div className="flex items-center gap-3 text-[var(--accent-strong)]">
              <ShieldCheck size={18} />
              <span className="text-sm font-black uppercase tracking-[0.18em]">Secure admin access</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">The panel validates the existing admin token on load and keeps backend logic authoritative.</p>
          </div>
        </Surface>

        <Surface className="px-8 py-8 lg:px-10 lg:py-10">
          <p className="eyebrow">Authentication</p>
          <h2 className="section-title mt-4">Log into the control system</h2>
          <p className="section-subtitle">Super admins manage platform-wide operations here.</p>

          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            <Field label="Credential ID">
              <div className="relative">
                <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="pl-11" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              </div>
            </Field>

            <Field label="Access code">
              <div className="relative">
                <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-11" required />
              </div>
            </Field>

            {error ? <div className="rounded-2xl border border-[rgba(239,107,115,0.2)] bg-[rgba(239,107,115,0.08)] px-4 py-3 text-sm text-[#ffd2d5]">{error}</div> : null}

            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Verifying" : "Open admin"} <ArrowRight size={16} />
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  );
}
