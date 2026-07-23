"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { apiPost } from "@/shared/api/client";
import { setStoredAdminSession } from "@/shared/auth/storage";
import { Button, Field, Input } from "@/shared/components/ui";
import viaeatsSymbol from "../../../../../Logotyp/exports/smiley-navy-transparent.png";
import creamSmiley from "../../../../../Logotyp/exports/smiley-cream-transparent.png";
import brandPattern from "../../../../../Logotyp/exports/background-pattern-navy-wide.png";

// Brandtypografi för ordmärket (Baloo 2 ExtraBold enligt brand-guiden).
const baloo = localFont({
  src: "./fonts/Baloo2.ttf",
  weight: "400 800",
  display: "swap",
});

type LoginResponse =
  | {
      totpRequired: true;
    }
  | {
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

type LoginProfile = { name: string | null; avatarUrl: string | null };

type LoginStep = "user" | "password" | "totp";

function initials(text: string) {
  return text
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("user");
  const [identifier, setIdentifier] = useState("");
  const [profile, setProfile] = useState<LoginProfile | null>(null);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Räknare i stället för boolean så skakningen kan triggas om vid nytt fel.
  const [shakeKey, setShakeKey] = useState(0);

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

  const fail = (message: string) => {
    setError(message);
    setShakeKey((k) => k + 1);
  };

  const submitIdentifier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiPost<LoginProfile>("/account/login-profile", { identifier: identifier.trim() });
      setProfile(response);
    } catch {
      // Teasern är kosmetisk — gå vidare med generisk avatar om den fallerar.
      setProfile({ name: null, avatarUrl: null });
    } finally {
      setLoading(false);
      setStep("password");
    }
  };

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, string> = { identifier: identifier.trim(), password };
      if (step === "totp") {
        if (usingRecoveryCode && recoveryCode.trim()) {
          payload.recoveryCode = recoveryCode.trim();
        } else if (totp.trim()) {
          payload.totp = totp.trim();
        } else {
          fail("Ange en kod från appen eller en recovery code");
          setLoading(false);
          return;
        }
      }

      const response = await apiPost<LoginResponse>("/account/login", payload);

      if ("totpRequired" in response && response.totpRequired) {
        setStep("totp");
        setError("");
        setLoading(false);
        return;
      }

      if ("admin" in response) {
        setStoredAdminSession(response.admin);
        router.replace(getRedirectTarget());
        return;
      }

      fail("Okänt svar från servern");
    } catch (caught: any) {
      fail(caught?.response?.data?.error || "Inloggningen misslyckades");
    } finally {
      setLoading(false);
    }
  };

  const resetToStart = () => {
    setStep("user");
    setProfile(null);
    setPassword("");
    setTotp("");
    setRecoveryCode("");
    setUsingRecoveryCode(false);
    setError("");
  };

  const displayName = profile?.name || identifier.trim();

  return (
    <div className="auth-split">
      {/* ── Brandpanel ── */}
      <aside className="auth-brand" style={{ backgroundImage: `url(${brandPattern.src})` }} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={creamSmiley.src} alt="" className="auth-brand-smiley" />
        <p className={`auth-wordmark ${baloo.className}`} style={{ fontWeight: 800 }}>
          via<span style={{ color: "var(--brand-orange)" }}>eats</span>
        </p>
        <p className="auth-tagline">Mat från stan.</p>
      </aside>

      {/* ── Formulärsida ── */}
      <div className="auth-form-side">
        <div key={shakeKey} className={`auth-card${shakeKey > 0 ? " auth-shake" : ""}`}>
        {/* ── Steg 1: vem loggar in? ── */}
        {step === "user" && (
          <div className="auth-step">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viaeatsSymbol.src} alt="" className="h-11 w-11 object-contain" />
              </div>
            </div>
            <h1 className="mt-5 text-center text-[26px] font-bold tracking-[-0.03em]">Välkommen tillbaka</h1>
            <p className="mt-1.5 text-center text-[13.5px] text-[var(--text-secondary)]">Logga in för att fortsätta till panelen</p>

            <form className="mt-7 grid gap-5" onSubmit={submitIdentifier}>
              <Field label="Användarnamn eller e-post" htmlFor="login-identifier">
                <div className="relative">
                  <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    id="login-identifier"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="input-with-leading-icon"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    spellCheck={false}
                    autoFocus
                    required
                  />
                </div>
              </Field>
              <Button variant="primary" type="submit" disabled={loading || !identifier.trim()} loading={loading}>
                Fortsätt <ArrowRight size={16} />
              </Button>
            </form>
          </div>
        )}

        {/* ── Steg 2: profil + lösenord ── */}
        {step === "password" && (
          <div className="auth-step">
            <div className="auth-avatar">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" />
              ) : (
                initials(displayName)
              )}
            </div>
            <h1 className="mt-4 text-center text-[19px] font-bold tracking-[-0.02em]">{displayName}</h1>
            <p className="mt-1 text-center text-[12.5px] text-[var(--text-muted)]">Ange ditt lösenord</p>

            <form className="mt-6 grid gap-5" onSubmit={submitLogin}>
              <Field label="Lösenord" htmlFor="login-password">
                <div className="relative">
                  <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="input-with-leading-icon"
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                </div>
              </Field>

              {error ? (
                <div className="rounded-lg border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]" role="alert">
                  {error}
                </div>
              ) : null}

              <Button variant="primary" type="submit" disabled={loading || !password} loading={loading}>
                Logga in <ArrowRight size={16} />
              </Button>
              <div className="text-center">
                <button type="button" className="auth-back" onClick={resetToStart}>
                  <ArrowLeft size={13} /> Byt konto
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Steg 3: authenticator ── */}
        {step === "totp" && (
          <div className="auth-step">
            <div className="auth-avatar">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" />
              ) : (
                <ShieldCheck size={30} />
              )}
            </div>
            <h1 className="mt-4 text-center text-[19px] font-bold tracking-[-0.02em]">{displayName}</h1>
            <p className="mt-1 text-center text-[12.5px] text-[var(--text-muted)]">
              {usingRecoveryCode ? "Ange en av dina sparade recovery codes" : "Ange koden från din authenticator-app"}
            </p>

            <form className="mt-6 grid gap-5" onSubmit={submitLogin}>
              {!usingRecoveryCode ? (
                <Field label="6-siffrig kod" htmlFor="login-totp">
                  <div className="relative">
                    <ShieldCheck size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input
                      id="login-totp"
                      value={totp}
                      onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="input-with-leading-icon text-center text-lg tracking-[0.35em]"
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      required
                    />
                  </div>
                </Field>
              ) : (
                <Field label="Recovery code" htmlFor="login-recovery-code">
                  <div className="relative">
                    <KeyRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input
                      id="login-recovery-code"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                      className="input-with-leading-icon text-center tracking-widest"
                      placeholder="ABCD-1234"
                      autoCapitalize="characters"
                      autoFocus
                      required
                    />
                  </div>
                </Field>
              )}

              {error ? (
                <div className="rounded-lg border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]" role="alert">
                  {error}
                </div>
              ) : null}

              <Button variant="primary" type="submit" disabled={loading} loading={loading}>
                Slutför inloggning <ArrowRight size={16} />
              </Button>

              <div className="text-center text-xs text-[var(--text-secondary)]">
                {!usingRecoveryCode ? (
                  <button
                    type="button"
                    onClick={() => { setUsingRecoveryCode(true); setTotp(""); setError(""); }}
                    className="underline hover:text-[var(--text-primary)]"
                  >
                    Tappat telefonen? Använd recovery code
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setUsingRecoveryCode(false); setRecoveryCode(""); setError(""); }}
                    className="underline hover:text-[var(--text-primary)]"
                  >
                    Tillbaka till authenticator-kod
                  </button>
                )}
                <span className="mx-2">·</span>
                <button type="button" onClick={resetToStart} className="underline hover:text-[var(--text-primary)]">
                  Byt konto
                </button>
              </div>
            </form>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
