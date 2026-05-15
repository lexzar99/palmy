"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  ShieldOff,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Surface,
  Textarea,
} from "@/shared/components/ui";
import { formatDateTime } from "@/shared/utils/format";
import {
  getReferral,
  getReferrals,
  referralDetailQueryKey,
  referralsListQueryKey,
  revertReferral,
  type ReferralRecord,
  type ReferralStatus,
} from "@/modules/marketing-referrals/api";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Alla statusar" },
  { value: "PENDING", label: "Pending" },
  { value: "REGISTERED", label: "Registered" },
  { value: "ORDERED", label: "Ordered" },
  { value: "REWARDED", label: "Rewarded" },
  { value: "REVERTED", label: "Reverted" },
  { value: "EXPIRED", label: "Expired" },
];

// ────────────────────────────────────────────────────────────────────────────
// Status → badge-tone mapping. REWARDED = success, REVERTED/EXPIRED = danger,
// PENDING/REGISTERED = neutral/info, ORDERED = info.
// ────────────────────────────────────────────────────────────────────────────
function statusTone(status: ReferralStatus): "neutral" | "success" | "danger" | "warning" | "info" {
  switch (status) {
    case "REWARDED":
      return "success";
    case "REVERTED":
    case "EXPIRED":
      return "danger";
    case "ORDERED":
      return "info";
    case "REGISTERED":
      return "info";
    case "PENDING":
    default:
      return "neutral";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Detalj-modal med revert-möjlighet
// ────────────────────────────────────────────────────────────────────────────
function ReferralDetailModal({
  referralId,
  open,
  onClose,
}: {
  referralId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [revertOpen, setRevertOpen] = useState(false);
  const [reason, setReason] = useState("");

  const detail = useQuery({
    queryKey: referralDetailQueryKey(referralId),
    queryFn: () => getReferral(referralId!),
    enabled: open && Boolean(referralId),
  });

  const revertMutation = useMutation({
    mutationFn: () => revertReferral(referralId!, reason.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["marketing-referrals"] });
      setRevertOpen(false);
      setReason("");
      onClose();
    },
  });

  const data = detail.data;
  const canRevert = data && data.status !== "REVERTED" && data.status !== "EXPIRED";

  return (
    <Modal
      open={open}
      onClose={() => {
        setRevertOpen(false);
        setReason("");
        onClose();
      }}
      title={data ? `Referral ${data.code}` : "Referral"}
      description={data ? `Skapad ${formatDateTime(data.createdAt)}` : undefined}
      widthClassName="max-w-[760px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {canRevert ? (
              <Button variant="danger" onClick={() => setRevertOpen(true)}>
                <ShieldOff size={14} /> Revert
              </Button>
            ) : null}
          </div>
          <Button onClick={onClose}>Stäng</Button>
        </div>
      }
    >
      {detail.isLoading || !data ? (
        <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">
          Laddar referral…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                Status
              </p>
              <Badge tone={statusTone(data.status)}>{data.status}</Badge>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                Kod
              </p>
              <p className="text-lg font-black tracking-[-0.02em]">{data.code}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Surface className="px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
                Inviter
              </p>
              <p className="font-black text-sm">{data.inviterName || "—"}</p>
              <p className="text-sm text-[var(--text-secondary)]">{data.inviterEmail || "—"}</p>
              {data.inviterUserId ? (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">ID: {data.inviterUserId}</p>
              ) : null}
            </Surface>

            <Surface className="px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
                Invitee
              </p>
              <p className="font-black text-sm">{data.inviteeName || "—"}</p>
              <p className="text-sm text-[var(--text-secondary)]">{data.inviteeEmail || "—"}</p>
              {data.inviteeUserId ? (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">ID: {data.inviteeUserId}</p>
              ) : null}
            </Surface>
          </div>

          <Surface className="px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">
              Tidsstämplar
            </p>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <span className="text-[var(--text-secondary)]">Skapad:</span>{" "}
                {formatDateTime(data.createdAt)}
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Registrerad:</span>{" "}
                {data.registeredAt ? formatDateTime(data.registeredAt) : "—"}
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Belönad:</span>{" "}
                {data.rewardedAt ? formatDateTime(data.rewardedAt) : "—"}
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Reverterad:</span>{" "}
                {data.revertedAt ? formatDateTime(data.revertedAt) : "—"}
              </div>
            </div>
          </Surface>

          {data.fraudFlags.length > 0 ? (
            <Surface className="px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">
                Fraud-flags
              </p>
              <div className="flex flex-wrap gap-2">
                {data.fraudFlags.map((f) => (
                  <Badge key={f} tone="warning">
                    {f}
                  </Badge>
                ))}
              </div>
            </Surface>
          ) : null}

          {data.inviteeOrderId ? (
            <Surface className="px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                Kvalificerande order
              </p>
              <p className="text-sm font-black">{data.inviteeOrderId}</p>
            </Surface>
          ) : null}

          {data.revertReason ? (
            <Surface className="px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                Revert-anledning
              </p>
              <p className="text-sm">{data.revertReason}</p>
            </Surface>
          ) : null}

          {revertOpen ? (
            <Surface className="px-5 py-5">
              <p className="font-black text-sm mb-2">Bekräfta revert</p>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Revert markerar referralen som REVERTED och återkallar alla relaterade UserDeals.
                Detta går inte att ångra.
              </p>
              <Field label="Anledning (intern)">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="T.ex. Misstänkt självreferral, duplicerade enheter, …"
                  rows={3}
                />
              </Field>
              {revertMutation.isError ? (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-500">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {(revertMutation.error as { response?: { data?: { error?: string } } } | undefined)
                      ?.response?.data?.error
                      || "Kunde inte revertera"}
                  </span>
                </div>
              ) : null}
              <div className="mt-4 flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setRevertOpen(false);
                    setReason("");
                  }}
                  disabled={revertMutation.isPending}
                >
                  Avbryt
                </Button>
                <Button
                  variant="danger"
                  onClick={() => revertMutation.mutate()}
                  disabled={revertMutation.isPending || !reason.trim()}
                >
                  {revertMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShieldOff size={14} />
                  )}{" "}
                  Bekräfta revert
                </Button>
              </div>
            </Surface>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Lista-sida — search, status-filter, paginering
// ────────────────────────────────────────────────────────────────────────────
export function ReferralsListPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);

  const referrals = useQuery({
    queryKey: referralsListQueryKey({ status, search, page }),
    queryFn: () => getReferrals({ status, search, page }),
  });

  const data = referrals.data;
  const rows: ReferralRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page-stack">
      <PageHeader
        title="Referrals"
        actions={
          <div className="flex gap-2">
            <Link href="/marketing-referrals">
              <Button variant="secondary">
                <ArrowLeft size={14} /> Tillbaka
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => void referrals.refetch()}>
              <RefreshCw size={14} /> Uppdatera
            </Button>
          </div>
        }
      />

      <Surface className="px-6 py-5">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              className="pl-10"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Sök på namn, e-post eller kod…"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </Surface>

      <Surface className="px-6 py-6">
        {referrals.isLoading ? (
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" /> Laddar referrals…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Inga referrals hittades" />
        ) : (
          <>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Inviter</th>
                    <th>Invitee</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Fraud-flags</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setActiveId(r.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="whitespace-nowrap text-sm text-[var(--text-secondary)]">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="font-black">{r.inviterName || "—"}</td>
                      <td>{r.inviteeName || "—"}</td>
                      <td className="text-[var(--text-secondary)]">
                        {r.inviteeEmail || r.inviterEmail || "—"}
                      </td>
                      <td>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </td>
                      <td>
                        {r.fraudFlags.length === 0 ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.fraudFlags.map((f) => (
                              <Badge key={f} tone="warning">
                                {f}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveId(r.id);
                          }}
                        >
                          Öppna
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                <span>
                  {total} referrals • sida {page} av {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ‹ Föregående
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Nästa ›
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Surface>

      <ReferralDetailModal
        referralId={activeId}
        open={Boolean(activeId)}
        onClose={() => setActiveId(null)}
      />
    </div>
  );
}
