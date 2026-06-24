"use client";

import { useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  dpointsKeys,
  getCustomers,
  getCustomer,
  adjustCustomer,
  getRedemptions,
} from "../api";
import { Surface, Button, Badge, Field, Input, Modal, LoadingPanel } from "@/shared/components/ui";

export default function ActivityTab() {
  const qc = useQueryClient();

  // (A) Kunder
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");

  const customers = useQuery({ queryKey: dpointsKeys.customers(query), queryFn: () => getCustomers(query) });
  const detail = useQuery({
    queryKey: dpointsKeys.customer(adjustId ?? ""),
    queryFn: () => getCustomer(adjustId as string),
    enabled: !!adjustId,
  });

  const adjustMut = useMutation({
    mutationFn: () => adjustCustomer(adjustId as string, amount, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dpointsKeys.customers(query) });
      qc.invalidateQueries({ queryKey: dpointsKeys.customer(adjustId ?? "") });
      setAdjustId(null);
      setAmount(0);
      setReason("");
    },
  });

  const adjustErr = (adjustMut.error as { response?: { data?: { error?: string } } } | undefined)?.response?.data?.error;

  // (B) Senaste inlösen
  const redemptions = useQuery({ queryKey: dpointsKeys.redemptions, queryFn: getRedemptions });
  const [filter, setFilter] = useState("");

  const all = redemptions.data ?? [];
  const recent = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const matched = f
      ? all.filter(
          (r) =>
            (r.code ?? "").toLowerCase().includes(f) ||
            (r.userName ?? "").toLowerCase().includes(f) ||
            (r.userPhone ?? "").toLowerCase().includes(f),
        )
      : all;
    return matched.slice(0, 15);
  }, [all, filter]);

  return (
    <div className="flex flex-col gap-6">
      {/* (A) Kunder */}
      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Kunder</h2>
          <div className="flex items-center gap-2">
            <Search size={16} className="text-[var(--text-secondary)]" />
            <Input
              placeholder="Sök kund (namn, e-post, telefon)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())}
            />
            <Button onClick={() => setQuery(search.trim())}>Sök</Button>
          </div>
          {customers.isLoading ? (
            <LoadingPanel />
          ) : (customers.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{query ? "Inga träffar." : "Inga kunder med poäng ännu."}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(customers.data ?? []).map((u) => (
                <div key={u.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{u.name || u.phone || u.email || u.id}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{[u.phone, u.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="info">{u.pointsBalance.toLocaleString("sv-SE")} p</Badge>
                    <Button onClick={() => { setAdjustId(u.id); setAmount(0); setReason(""); }}>Ge / dra</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>

      {/* (B) Senaste inlösen */}
      <Surface>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Senaste inlösen ({all.length} totalt)</h2>
            <Input
              className="max-w-[220px]"
              placeholder="Filtrera kod eller kund"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {redemptions.isLoading ? (
            <LoadingPanel />
          ) : recent.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{filter ? "Inga träffar." : "Inga koder utfärdade ännu."}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-strong)] text-left text-xs uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-bold">Kod</th>
                  <th className="py-2 pr-3 font-bold">Kund</th>
                  <th className="py-2 pr-3 text-right font-bold">Poäng</th>
                  <th className="py-2 text-right font-bold">Datum</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-3 font-mono font-semibold">{r.code ?? "saknas"}</td>
                    <td className="py-2 pr-3">{r.userName || r.userPhone || "saknas"}</td>
                    <td className="py-2 pr-3 text-right text-[var(--text-secondary)]">-{r.pointsSpent} p</td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">
                      {new Date(r.createdAt).toLocaleDateString("sv-SE")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Surface>

      {/* Ge / dra poäng */}
      <Modal
        open={!!adjustId}
        title="Ge eller dra poäng"
        onClose={() => setAdjustId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdjustId(null)}>Avbryt</Button>
            <Button variant="primary" disabled={adjustMut.isPending} onClick={() => adjustMut.mutate()}>
              {adjustMut.isPending ? <Loader2 className="animate-spin" size={16} /> : "Bekräfta"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {detail.data && (
            <p className="text-sm text-[var(--text-secondary)]">
              {detail.data.customer.name || detail.data.customer.phone} har just nu{" "}
              <strong>{detail.data.customer.pointsBalance.toLocaleString("sv-SE")} p</strong>.
            </p>
          )}
          <Field label="Antal poäng (plus eller minus)">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Anledning">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="t.ex. kompensation för försenad order" />
          </Field>
          {adjustErr && <p className="text-sm text-[var(--text-primary)]">{adjustErr}</p>}
        </div>
      </Modal>
    </div>
  );
}
