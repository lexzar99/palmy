"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, UsersRound } from "lucide-react";
import { deleteStaff, getStaff, inviteStaff, resetStaffPassword, staffQueryKey, updateStaff, type StaffRecord } from "@/modules/users/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Tabs } from "@/shared/components/ui";
import { TwoFAPage } from "@/modules/two-fa/page";
import { formatDate, formatNumber } from "@/shared/utils/format";

function StaffModal({ open, member, onClose }: { open: boolean; member: StaffRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [active, setActive] = useState(true);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !member) return;
    setName(member.name);
    setRole(member.role === "RESTAURANT_ADMIN" ? "ADMIN" : member.role);
    setActive(member.active);
    setPasswordMessage(null);
  }, [member, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => updateStaff(member!.id, { name, role, active }),
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

  return (
    <Modal open={open} onClose={onClose} title={member ? member.name : "Teammedlem"} footer={<div className="flex items-center justify-between gap-2"><div>{member ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Radera</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Spara</Button></div></div>}>
      {member ? (
        <div className="space-y-5">
          {passwordMessage ? <div className="rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-4 text-sm text-[var(--accent)]">Tillfälligt lösenord: <strong>{passwordMessage}</strong></div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Namn"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Roll"><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="SUPER_ADMIN">SUPER_ADMIN</option><option value="STAFF">STAFF</option><option value="VIEWER">VIEWER</option><option value="ADMIN">ADMIN</option></Select></Field>
            <Field label="E-post"><Input value={member.email} disabled /></Field>
            <Field label="Status"><Select value={active ? "active" : "inactive"} onChange={(event) => setActive(event.target.value === "active")}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></Select></Field>
          </div>
          <Button variant="secondary" onClick={() => resetMutation.mutate()}><KeyRound size={16} /> Återställ lösenord</Button>
        </div>
      ) : null}
    </Modal>
  );
}

type UsersTab = "anvandare" | "sakerhet";

export function UsersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<UsersTab>(tabParam === "sakerhet" ? "sakerhet" : "anvandare");
  useEffect(() => {
    const next: UsersTab = tabParam === "sakerhet" ? "sakerhet" : "anvandare";
    if (next !== tab) setTab(next);
  }, [tabParam]);
  const changeTab = (t: UsersTab) => {
    setTab(t);
    router.replace(`/users?tab=${t}`, { scroll: false });
  };
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeMember, setActiveMember] = useState<StaffRecord | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const staff = useQuery({ queryKey: staffQueryKey, queryFn: getStaff });

  const inviteMutation = useMutation({
    mutationFn: () => inviteStaff({ name, email, role }),
    onSuccess: async (response) => {
      setTemporaryPassword(response.temporaryPassword);
      setInviteOpen(false);
      setName("");
      setEmail("");
      setRole("STAFF");
      await queryClient.invalidateQueries({ queryKey: staffQueryKey });
    },
  });

  if (staff.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar användare och roller...</Surface>;
  }

  if (staff.isError || !staff.data) {
    return <ErrorPanel title="Användarmodulen kunde inte laddas" description="Staff-endpointen svarar inte." action={<Button onClick={() => void staff.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="System"
        title="Användare"
        actions={tab === "anvandare" ? <Button variant="primary" onClick={() => setInviteOpen(true)}><Plus size={13} /> Bjud in användare</Button> : undefined}
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

      {temporaryPassword ? <Surface className="px-6 py-5 text-sm text-[#ffe6bf]">Tillfälligt lösenord för senaste inbjudan: <strong>{temporaryPassword}</strong></Surface> : null}

      <Surface className="px-6 py-6">
        {staff.data.length === 0 ? (
          <EmptyState title="Inga admin-användare" />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Roll</th>
                  <th>Omfattning</th>
                  <th>Status</th>
                  <th>Skapad</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.data.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div>
                        <p className="font-black">{member.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{member.email}</p>
                      </div>
                    </td>
                    <td><Badge tone="info">{member.role}</Badge></td>
                    <td>{member.restaurantName || "Plattform"}</td>
                    <td><Badge tone={member.active ? "success" : "danger"}>{member.active ? "Aktiv" : "Inaktiv"}</Badge></td>
                    <td>{formatDate(member.createdAt)}</td>
                    <td><div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveMember(member)}><UsersRound size={16} /> Öppna</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Bjud in teammedlem" footer={<div className="flex justify-end gap-2"><Button onClick={() => setInviteOpen(false)}>Stäng</Button><Button variant="primary" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending || !name.trim() || !email.trim()}>Skapa konto</Button></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="E-post / inloggning"><Input value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Roll"><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="SUPER_ADMIN">SUPER_ADMIN</option><option value="STAFF">STAFF</option><option value="VIEWER">VIEWER</option><option value="ADMIN">ADMIN</option></Select></Field>
        </div>
      </Modal>

      <StaffModal open={Boolean(activeMember)} member={activeMember} onClose={() => setActiveMember(null)} />
      </>)}
    </div>
  );
}
