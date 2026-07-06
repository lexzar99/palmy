import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { isMockMode } from "../lib/api";
import { GoldButton, Spinner } from "../ui";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(isMockMode ? "kurir@viaeats.se" : "");
  const [password, setPassword] = useState(isMockMode ? "demo" : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setErr((e as Error).message || "Inloggningen misslyckades");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-6 pb-10" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink">
            <span className="text-3xl font-black text-gold">D</span>
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight">ViaEats Kurir</h1>
          <p className="mt-1 text-sm text-muted">Logga in för att börja köra</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post"
            autoComplete="username"
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3.5 text-[15px] outline-none focus:border-gold"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lösenord"
            autoComplete="current-password"
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3.5 text-[15px] outline-none focus:border-gold"
          />
          {err && <p className="px-1 text-sm font-medium text-red-500">{err}</p>}
          <GoldButton type="submit" disabled={busy}>
            {busy ? <Spinner /> : "Logga in"}
          </GoldButton>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Konton skapas av ViaEats. Vill du köra åt oss?
          <br />
          Ansök på <span className="font-semibold text-ink">viaeats.se/bli-kurir</span>.
        </p>
      </div>
    </div>
  );
}
