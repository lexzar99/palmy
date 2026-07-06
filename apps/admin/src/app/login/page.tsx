"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { apiPost } from "@/shared/api/client";
import { getStoredToken, setStoredAdminSession } from "@/shared/auth/storage";
import { Button, Field, Input, Surface } from "@/shared/components/ui";

type LoginResponse =
  | {
      totpRequired: true;
    }
  | {
      token: string;
      admin: {
        id: string;
        email: string;
        name?: string;
        role: string;
        restaurantId?: string | null;
        restaurantSlug?: string | null;
        restaurantName?: string | null;
      };
    };

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Where to send the user after a successful login. The middleware sets
  // ?next= when it bounces an unauthenticated request to /login.
  const getRedirectTarget = (): string => {
    if (typeof window === "undefined") return "/dashboard";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    // Only allow same-origin paths (avoid open-redirects)
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/dashboard";
  };

  useEffect(() => {
    if (getStoredToken()) {
      router.replace(getRedirectTarget());
    }
  }, [router]);

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, string> = { identifier, password };
      if (needsTotp) {
        if (usingRecoveryCode && recoveryCode.trim()) {
          payload.recoveryCode = recoveryCode.trim();
        } else if (totp.trim()) {
          payload.totp = totp.trim();
        } else {
          setError("Ange en TOTP-kod eller recovery code");
          setLoading(false);
          return;
        }
      }

      const response = await apiPost<LoginResponse>("/account/login", payload);

      if ("totpRequired" in response && response.totpRequired) {
        setNeedsTotp(true);
        setError("");
        setLoading(false);
        return;
      }

      if ("token" in response) {
        setStoredAdminSession(response.token, response.admin);
        router.replace(getRedirectTarget());
        return;
      }

      setError("Okänt svar från servern");
    } catch (caught: any) {
      setError(caught?.response?.data?.error || "Login misslyckades");
    } finally {
      setLoading(false);
    }
  };

  const resetToCredentials = () => {
    setNeedsTotp(false);
    setUsingRecoveryCode(false);
    setTotp("");
    setRecoveryCode("");
    setError("");
  };

  return (
    <div className="auth-shell">
      <Surface className="w-full max-w-md px-8 py-10">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl font-semibold text-[var(--accent-fg)]">
            D
          </div>
        </div>

        <h1 className="mt-6 text-center text-[26px] font-semibold tracking-[-0.025em]">ViaEats Admin</h1>
        {needsTotp && (
          <p className="mt-2 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Ny enhet upptäckt — verifiera med din authenticator-app eller recovery code.
          </p>
        )}

        <form className="mt-8 grid gap-5" onSubmit={submitLogin}>
          {!needsTotp && (
            <>
              <Field label="Användarnamn">
                <div className="relative">
                  <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="pl-11"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
              </Field>

              <Field label="Lösenord">
                <div className="relative">
                  <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-11"
                    required
                  />
                </div>
              </Field>
            </>
          )}

          {needsTotp && !usingRecoveryCode && (
            <Field label="6-siffrig kod från authenticator-app">
              <div className="relative">
                <ShieldCheck size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={totp}
                  onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="pl-11 tracking-widest text-center text-lg"
                  placeholder="123456"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  required
                />
              </div>
            </Field>
          )}

          {needsTotp && usingRecoveryCode && (
            <Field label="Recovery code (en av dina 10 sparade)">
              <div className="relative">
                <KeyRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                  className="pl-11 tracking-widest text-center"
                  placeholder="ABCD-1234"
                  autoCapitalize="characters"
                  autoFocus
                  required
                />
              </div>
            </Field>
          )}

          {error ? (
            <div className="rounded-lg border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Verifierar" : needsTotp ? "Slutför inloggning" : "Logga in"} <ArrowRight size={16} />
          </Button>

          {needsTotp && (
            <div className="text-center text-xs" style={{ color: "var(--text-secondary)" }}>
              {!usingRecoveryCode ? (
                <button
                  type="button"
                  onClick={() => { setUsingRecoveryCode(true); setTotp(""); }}
                  className="underline hover:text-[var(--accent)]"
                >
                  Tappat telefonen? Använd recovery code istället
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setUsingRecoveryCode(false); setRecoveryCode(""); }}
                  className="underline hover:text-[var(--accent)]"
                >
                  Tillbaka till authenticator-kod
                </button>
              )}
              <span className="mx-2">·</span>
              <button
                type="button"
                onClick={resetToCredentials}
                className="underline hover:text-[var(--text-primary)]"
              >
                Byt konto
              </button>
            </div>
          )}
        </form>
      </Surface>
    </div>
  );
}
