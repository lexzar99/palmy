"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Plus,
} from "lucide-react";
import {
  changeOwnPassword,
  deleteStaff,
  getStaff,
  inviteStaff,
  resetStaffPassword,
  staffQueryKey,
  updateStaff,
  type InviteStaffPayload,
  type StaffRecord,
} from "@/modules/users/api";
import { logoutAdminSession } from "@/shared/auth/storage";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Tabs } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { TwoFAPage } from "@/modules/two-fa/page";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format";

const TEAM_ROLES = ["STAFF", "VIEWER", "SUPER_ADMIN"] as const;

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Superadmin",
  STAFF: "Medarbetare",
  VIEWER: "Läsläge",
  ADMIN: "Restaurang",
  RESTAURANT_ADMIN: "Restaurang",
  // Hermes-agentroller (sätts i API/DB, inte via panelen)
  MENU_AGENT: "Menyagent",
  GROWTH_AGENT: "Tillväxtagent",
  GLOBAL_VIEWER: "Driftvakt",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function StaffAvatar({ member, size = 40 }: { member: Pick<StaffRecord, "name" | "avatarUrl">; size?: number }) {
  if (member.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy-soft)] font-extrabold text-[var(--brand-navy-ink)]"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials(member.name)}
    </span>
  );
}

/* ─────────────────────────────────────────────
   Kontoskapare — 3 steg: Profil → Inloggning → Klart.
   Endast teamkonton: restaurangers inloggningar skapas i
   Restaurangenheter, inte här.
   ───────────────────────────────────────────── */

const WIZARD_STEPS = ["Profil", "Inloggning", "Klart"] as const;

function CreateAccountWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("STAFF");
  const [ownPassword, setOwnPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setAvatarUrl("");
    setName("");
    setUsername("");
    setUsernameTouched(false);
    setEmail("");
    setRole("STAFF");
    setOwnPassword(true);
    setPassword("");
    setPasswordConfirm("");
    setTempPassword(null);
    setCopied(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Föreslå handle från namnet tills användaren rört fältet själv.
  const suggestedUsername = useMemo(
    () => name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").slice(0, 30),
    [name],
  );
  const effectiveUsername = usernameTouched ? username : suggestedUsername;

  const usernameValid = !effectiveUsername || /^[a-z0-9._-]{3,30}$/.test(effectiveUsername);
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordValid = !ownPassword || (password.length >= 8 && password === passwordConfirm);
  const passwordStrength = password.length >= 14 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0;

  const canNext =
    step === 0 ? name.trim().length >= 2 && usernameValid :
    step === 1 ? emailValid && passwordValid :
    true;

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: InviteStaffPayload = {
        name: name.trim(),
        email: email.trim(),
        role,
        ...(effectiveUsername ? { username: effectiveUsername } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(ownPassword ? { password } : {}),
      };
      return inviteStaff(payload);
    },
    onSuccess: async (response) => {
      setTempPassword(response.temporaryPassword ?? null);
      setStep(2);
      await queryClient.invalidateQueries({ queryKey: staffQueryKey });
    },
  });

  const copyTemp = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const createError = (createMutation.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nytt konto"
      size="md"
      footer={
        step === 2 ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>Klart</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
              {step === 0 ? "Avbryt" : <><ArrowLeft size={14} /> Tillbaka</>}
            </Button>
            {step < 1 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Nästa <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canNext || createMutation.isPending}
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Skapa konto
              </Button>
            )}
          </div>
        )
      }
    >
      {/* Stegindikator */}
      <div className="wizard-steps" aria-hidden>
        {WIZARD_STEPS.map((label, i) => (
          <div key={label} className={cn("wizard-step", i === step && "is-active", i < step && "is-done")}>
            <span className="wizard-step-dot">{i < step ? <Check size={11} /> : i + 1}</span>
            <span className="wizard-step-label">{label}</span>
            {i < WIZARD_STEPS.length - 1 && <span className="wizard-step-line" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="mt-6 grid gap-5">
          <ImageUploadField label="Profilbild" value={avatarUrl} onChange={setAvatarUrl} kind="misc" fileBaseName={effectiveUsername || "avatar"} />
          <Field label="Namn" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="För- och efternamn" autoFocus />
          </Field>
          <Field
            label="Användarnamn"
            optional
            error={!usernameValid ? "3–30 tecken: a–z, 0–9, . _ -" : undefined}
          >
            <Input
              value={effectiveUsername}
              onChange={(e) => {
                setUsernameTouched(true);
                setUsername(e.target.value.toLowerCase());
              }}
              placeholder="t.ex. jarir.alshaher"
            />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 grid gap-5">
          <Field label="E-post" required hint="Används för inloggning. Unik.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@viaeats.se" autoFocus />
          </Field>
          <Field label="Roll">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3">
            <div className="segmented self-start">
              <button type="button" className={ownPassword ? "is-active" : ""} onClick={() => setOwnPassword(true)}>Eget lösenord</button>
              <button type="button" className={!ownPassword ? "is-active" : ""} onClick={() => setOwnPassword(false)}>Generera</button>
            </div>
            {ownPassword ? (
              <>
                <Field label="Lösenord" required error={password && password.length < 8 ? "Minst 8 tecken" : undefined}>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                {password && (
                  <div className="pw-meter" aria-hidden>
                    {[1, 2, 3].map((level) => (
                      <span key={level} className={cn("pw-meter-bar", passwordStrength >= level && `is-on-${passwordStrength}`)} />
                    ))}
                  </div>
                )}
                <Field label="Bekräfta lösenord" required error={passwordConfirm && password !== passwordConfirm ? "Matchar inte" : undefined}>
                  <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" />
                </Field>
              </>
            ) : (
              <p className="field-hint">Ett tillfälligt lösenord visas när kontot skapats.</p>
            )}
          </div>
          {createError ? <p className="field-message" role="alert">{createError}</p> : null}
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 grid justify-items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-text)]">
            <Check size={26} />
          </span>
          <div>
            <p className="section-title">Kontot är skapat</p>
            <p className="section-subtitle mt-1">{name} · {email}</p>
          </div>
          {tempPassword ? (
            <button type="button" onClick={copyTemp} className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-panel-soft)] px-4 py-2.5 font-mono text-sm font-bold">
              {tempPassword}
              {copied ? <Check size={14} className="text-[var(--success-text)]" /> : <Copy size={14} />}
            </button>
          ) : (
            <p className="field-hint">Lösenordet du valde gäller direkt.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Redigera befintligt konto
   ───────────────────────────────────────────── */

function apiError(error: unknown): string | null {
  return (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? null;
}

function StaffModal({ open, member, onClose }: { open: boolean; member: StaffRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const session = useAdminSession();
  const router = useRouter();
  const isSelf = Boolean(member && session.data?.id === member.id);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [role, setRole] = useState("STAFF");
  const [active, setActive] = useState(true);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !member) return;
    setName(member.name);
    setUsername(member.username ?? "");
    setEmail(member.email);
    setAvatarUrl(member.avatarUrl ?? "");
    setRole(member.role === "RESTAURANT_ADMIN" ? "ADMIN" : member.role);
    setActive(member.active);
    setPasswordMessage(null);
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
  }, [member, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const emailChanged = member ? email.trim().toLowerCase() !== member.email.toLowerCase() : false;
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  const saveMutation = useMutation({
    mutationFn: () =>
      updateStaff(member!.id, {
        name,
        role,
        active,
        username: username || null,
        avatarUrl: avatarUrl || null,
        // Skickas bara vid faktisk ändring — gamla "admin"-värdet är ingen
        // giltig e-post och ska inte trigga validering i onödan.
        ...(emailChanged ? { email: email.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: staffQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStaff(member!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: staffQueryKey });
      onClose();
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetStaffPassword(member!.id),
    onSuccess: (response) => {
      setPasswordMessage(response.temporaryPassword);
    },
  });

  const changePasswordValid = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === newPasswordConfirm;
  const changePasswordMutation = useMutation({
    mutationFn: () => changeOwnPassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      // Servern har dödat alla tokens — ta användaren till login direkt.
      await logoutAdminSession();
      router.replace("/login");
    },
  });

  const saveError = apiError(saveMutation.error);
  const passwordError = apiError(changePasswordMutation.error);

  return (
    <Modal open={open} onClose={onClose} title={member ? member.name : "Konto"} footer={<div className="flex items-center justify-between gap-2"><div>{member && !isSelf ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Radera</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" disabled={emailChanged && !emailValid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Spara</Button></div></div>}>
      {member ? (
        <div className="space-y-5">
          {passwordMessage ? <div className="rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-4 text-sm text-[var(--accent)]">Tillfälligt lösenord: <strong>{passwordMessage}</strong></div> : null}
          <ImageUploadField label="Profilbild" value={avatarUrl} onChange={setAvatarUrl} kind="misc" fileBaseName={username || "avatar"} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Namn"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Användarnamn" hint="Kan användas för inloggning. Unikt."><Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="valfritt" /></Field>
            <Field label="Roll"><Select value={role} onChange={(event) => setRole(event.target.value)} disabled={isSelf}><option value="SUPER_ADMIN">Superadmin</option><option value="STAFF">Medarbetare</option><option value="VIEWER">Läsläge</option><option value="ADMIN">Restaurang</option></Select></Field>
            <Field label="Status"><Select value={active ? "active" : "inactive"} onChange={(event) => setActive(event.target.value === "active")} disabled={isSelf}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></Select></Field>
            <Field
              label="E-post"
              className="md:col-span-2"
              hint="Används för inloggning. Unik."
              error={emailChanged && !emailValid ? "Ogiltig e-postadress" : undefined}
            >
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
          </div>
          {saveError ? <p className="field-message" role="alert">{saveError}</p> : null}

          {isSelf ? (
            <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-4">
              <p className="text-[13px] font-bold text-[var(--text-primary)]">Byt lösenord</p>
              <p className="field-hint mt-1">Du loggas ut överallt och loggar in igen med det nya.</p>
              <div className="mt-3 grid gap-3">
                <Field label="Nuvarande lösenord"><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
                <Field label="Nytt lösenord" error={newPassword && newPassword.length < 8 ? "Minst 8 tecken" : undefined}><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Bekräfta nytt lösenord" error={newPasswordConfirm && newPassword !== newPasswordConfirm ? "Matchar inte" : undefined}><Input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} autoComplete="new-password" /></Field>
                {passwordError ? <p className="field-message" role="alert">{passwordError}</p> : null}
                <Button
                  variant="primary"
                  className="justify-self-start"
                  disabled={!changePasswordValid}
                  loading={changePasswordMutation.isPending}
                  onClick={() => changePasswordMutation.mutate()}
                >
                  <KeyRound size={15} /> Byt lösenord
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => resetMutation.mutate()}><KeyRound size={16} /> Återställ lösenord</Button>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Kontokort — team & restauranger separerat
   ───────────────────────────────────────────── */

function StaffCard({ member, onOpen }: { member: StaffRecord; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="staff-card">
      <StaffAvatar member={member} size={44} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-bold text-[var(--text-primary)]">{member.name}</span>
        <span className="block truncate text-[12px] text-[var(--text-muted)]">
          {member.username ? `@${member.username}` : member.email}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1.5">
        <Badge tone={member.active ? "success" : "danger"}>{member.active ? "Aktiv" : "Inaktiv"}</Badge>
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
          {member.restaurantName ?? ROLE_LABEL[member.role] ?? member.role}
        </span>
      </span>
    </button>
  );
}

type UsersTab = "anvandare" | "sakerhet";

export function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: UsersTab = tabParam === "sakerhet" ? "sakerhet" : "anvandare";
  const changeTab = (t: UsersTab) => {
    router.replace(`/users?tab=${t}`, { scroll: false });
  };
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeMember, setActiveMember] = useState<StaffRecord | null>(null);

  const staff = useQuery({ queryKey: staffQueryKey, queryFn: getStaff });

  if (staff.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar användare…</Surface>;
  }

  if (staff.isError || !staff.data) {
    return <ErrorPanel title="Användarmodulen kunde inte laddas" action={<Button onClick={() => void staff.refetch()}>Försök igen</Button>} />;
  }

  const teamAccounts = staff.data.filter((m) => !m.restaurantId && m.role !== "ADMIN" && m.role !== "RESTAURANT_ADMIN");
  const restaurantAccounts = staff.data.filter((m) => m.restaurantId || m.role === "ADMIN" || m.role === "RESTAURANT_ADMIN");

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="System"
        title="Användare"
        actions={tab === "anvandare" ? <Button variant="primary" onClick={() => setWizardOpen(true)}><Plus size={13} /> Nytt konto</Button> : undefined}
      />

      <Tabs<UsersTab>
        value={tab}
        onChange={changeTab}
        options={[
          { value: "anvandare", label: "Användare" },
          { value: "sakerhet", label: "Säkerhet (2FA)" },
        ]}
      />

      {tab === "sakerhet" && <TwoFAPage embedded />}

      {tab === "anvandare" && (<>

      <Surface className="px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="section-title">Vårt team</h2>
            <p className="section-subtitle">Konton som jobbar i panelen</p>
          </div>
          <span className="sidebar-section-count">{teamAccounts.length}</span>
        </div>
        {teamAccounts.length === 0 ? (
          <EmptyState title="Inga teamkonton" />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {teamAccounts.map((member) => (
              <StaffCard key={member.id} member={member} onOpen={() => setActiveMember(member)} />
            ))}
          </div>
        )}
      </Surface>

      <Surface className="px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="section-title">Restaurangkonton</h2>
            <p className="section-subtitle">Skapas via Restaurangenheter — inte här</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push("/restaurant-devices")} className="text-[12.5px] font-bold text-[var(--brand-navy-ink)] hover:underline">
              Enheter
            </button>
            <span className="sidebar-section-count">{restaurantAccounts.length}</span>
          </div>
        </div>
        {restaurantAccounts.length === 0 ? (
          <EmptyState title="Inga restaurangkonton" />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {restaurantAccounts.map((member) => (
              <StaffCard key={member.id} member={member} onOpen={() => setActiveMember(member)} />
            ))}
          </div>
        )}
      </Surface>

      <CreateAccountWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <StaffModal open={Boolean(activeMember)} member={activeMember} onClose={() => setActiveMember(null)} />
      </>)}
    </div>
  );
}
