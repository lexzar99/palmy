"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
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
      <Surface className="w-full max-w-md px-8 py-10">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-2xl font-black text-[#11151b]">
            M
          </div>
        </div>

        <h1 className="mt-6 text-center text-2xl font-black tracking-[-0.04em]">MatGo Admin</h1>

        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <Field label="Användarnamn">
            <div className="relative">
              <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="pl-11" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            </div>
          </Field>

          <Field label="Lösenord">
            <div className="relative">
              <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-11" required />
            </div>
          </Field>

          {error ? <div className="rounded-2xl border border-[rgba(239,107,115,0.2)] bg-[rgba(239,107,115,0.08)] px-4 py-3 text-sm text-[#ffd2d5]">{error}</div> : null}

          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Verifierar" : "Logga in"} <ArrowRight size={16} />
          </Button>
        </form>
      </Surface>
    </div>
  );
}
