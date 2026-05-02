"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Plus, UserRound } from "lucide-react";
import {
  createCustomerDeal,
  customerDetailQueryKey,
  customersQueryKey,
  deleteCustomer,
  deleteCustomerDeal,
  getCustomer,
  getCustomers,
  updateCustomer,
  updateCustomerDeal,
  type CustomerDetail,
  type CustomerRecord,
} from "@/modules/customers/api";
import { getPushHistoryForCustomer, type PushLogRecord } from "@/modules/push/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, SectionHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatDateTime, formatNumber, orderStatusLabel } from "@/shared/utils/format";

type CustomerTab = "info" | "orders" | "deals" | "push";

function CustomerPushHistory({ customerId }: { customerId: string }) {
  const history = useQuery({
    queryKey: ["customers", "push-history", customerId],
    queryFn: () => getPushHistoryForCustomer(customerId),
    enabled: Boolean(customerId),
  });

  if (history.isLoading) return <p className="text-sm text-[var(--text-secondary)]">Laddar push-historik…</p>;

  const logs: PushLogRecord[] = history.data?.logs ?? [];

  if (logs.length === 0) return <EmptyState title="Inga push-notiser skickade till denna kund" />;

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr><th>Tid</th><th>Rubrik</th><th>Meddelande</th><th>Status</th></tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="whitespace-nowrap text-sm">{formatDateTime(log.createdAt)}</td>
              <td className="font-black text-sm">{log.title}</td>
              <td className="max-w-[260px] truncate text-sm text-[var(--text-secondary)]">{log.body}</td>
              <td>
                {log.success
                  ? <Badge tone="success"><CheckCircle2 size={11} /> Skickad</Badge>
                  : <Badge tone="danger"><AlertCircle size={11} /> Fel</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerModal({ customerId, open, onClose }: { customerId: string | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CustomerTab>("info");
  const [profile, setProfile] = useState({ name: "", phone: "", email: "", address: "", city: "", zip: "", isActive: true, isVerified: false, internalInfo: "" });
  const [dealForm, setDealForm] = useState({ title: "", code: "", discountType: "FIXED", discountValue: 30, maxUsages: 1, validUntil: "" });

  const customer = useQuery({
    queryKey: customerDetailQueryKey(customerId),
    queryFn: () => getCustomer(customerId!),
    enabled: open && Boolean(customerId),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !customer.data) return;
    setProfile({
      name: customer.data.name,
      phone: customer.data.phone || "",
      email: customer.data.email || "",
      address: customer.data.address || "",
      city: customer.data.city || "",
      zip: customer.data.zip || "",
      isActive: customer.data.isActive,
      isVerified: customer.data.isVerified,
      internalInfo: customer.data.internalInfo || "",
    });
    setDealForm({ title: "", code: "", discountType: "FIXED", discountValue: 30, maxUsages: 1, validUntil: "" });
    setTab("info");
  }, [customer.data, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => updateCustomer(customerId!, profile),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customersQueryKey });
      if (customerId) await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(customerId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customersQueryKey });
      onClose();
    },
  });

  const createDealMutation = useMutation({
    mutationFn: () => createCustomerDeal(customerId!, dealForm),
    onSuccess: async () => {
      if (customerId) await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) });
      setDealForm({ title: "", code: "", discountType: "FIXED", discountValue: 30, maxUsages: 1, validUntil: "" });
    },
  });

  const toggleDealMutation = useMutation({
    mutationFn: ({ dealId, isUsed, usageCount }: { dealId: string; isUsed: boolean; usageCount: number }) => updateCustomerDeal(customerId!, dealId, { isUsed, usageCount }),
    onSuccess: async () => {
      if (customerId) await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) });
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: (dealId: string) => deleteCustomerDeal(customerId!, dealId),
    onSuccess: async () => {
      if (customerId) await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) });
    },
  });

  const data = customer.data;

  return (
    <Modal open={open} onClose={onClose} title={data ? data.name : "Customer"} description={data ? `${data.phone || "No phone"} • ${data.email || "No email"}` : undefined} widthClassName="max-w-[1160px]" footer={<div className="flex items-center justify-between gap-3"><div>{data ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Delete customer</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save profile</Button></div></div>}>
      {customer.isLoading || !data ? (
        <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading customer...</div>
      ) : (
        <div className="space-y-5">
          <Tabs value={tab} onChange={setTab} options={[{ value: "info", label: "Info" }, { value: "orders", label: "Orders" }, { value: "deals", label: "Deals" }, { value: "push", label: "Push" }]} />

          {tab === "info" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name"><Input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="Phone"><Input value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></Field>
              <Field label="Email"><Input value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} /></Field>
              <Field label="Address"><Input value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} /></Field>
              <Field label="City"><Input value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="Zip"><Input value={profile.zip} onChange={(event) => setProfile((current) => ({ ...current, zip: event.target.value }))} /></Field>
              <Field label="Active"><Select value={profile.isActive ? "yes" : "no"} onChange={(event) => setProfile((current) => ({ ...current, isActive: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
              <Field label="Verified"><Select value={profile.isVerified ? "yes" : "no"} onChange={(event) => setProfile((current) => ({ ...current, isVerified: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
              <div className="md:col-span-2"><Field label="Internal info"><Textarea value={profile.internalInfo} onChange={(event) => setProfile((current) => ({ ...current, internalInfo: event.target.value }))} /></Field></div>
            </div>
          ) : null}

          {tab === "orders" ? (
            data.orders.length === 0 ? <EmptyState title="No orders" /> : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr><th>Order</th><th>Restaurant</th><th>Status</th><th>Total</th><th>Created</th></tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-black">{order.orderNumber}</td>
                        <td>{order.restaurant?.name || "MatGo"}</td>
                        <td><Badge tone="info">{orderStatusLabel(order.status)}</Badge></td>
                        <td>{formatCurrency(order.total / 100)}</td>
                        <td>{formatDateTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === "push" ? <CustomerPushHistory customerId={customerId!} /> : null}

          {tab === "deals" ? (
            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <Surface className="px-5 py-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">New personal deal</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Title"><Input value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                    <Field label="Code"><Input value={dealForm.code} onChange={(event) => setDealForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></Field>
                    <Field label="Discount type"><Select value={dealForm.discountType} onChange={(event) => setDealForm((current) => ({ ...current, discountType: event.target.value }))}><option value="FIXED">FIXED</option><option value="PERCENTAGE">PERCENTAGE</option></Select></Field>
                    <Field label="Discount value"><Input type="number" value={dealForm.discountValue} onChange={(event) => setDealForm((current) => ({ ...current, discountValue: Number(event.target.value) }))} /></Field>
                    <Field label="Max usages"><Input type="number" value={dealForm.maxUsages} onChange={(event) => setDealForm((current) => ({ ...current, maxUsages: Number(event.target.value) }))} /></Field>
                    <Field label="Valid until"><Input type="date" value={dealForm.validUntil} onChange={(event) => setDealForm((current) => ({ ...current, validUntil: event.target.value }))} /></Field>
                  </div>
                  <div className="mt-4"><Button variant="primary" onClick={() => createDealMutation.mutate()} disabled={createDealMutation.isPending || !dealForm.title.trim() || !dealForm.code.trim()}>{createDealMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create personal deal</Button></div>
                </Surface>
              </div>
              <div className="space-y-3">
                {data.deals.length === 0 ? <EmptyState title="No personal deals" /> : data.deals.map((deal) => (
                  <Surface key={deal.id} className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-black tracking-[-0.02em]">{deal.code}</p>
                          <Badge tone={deal.isUsed ? "danger" : "success"}>{deal.isUsed ? "Used" : "Available"}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.campaign.title} • {deal.campaign.discountType === "FIXED" ? `${deal.campaign.discountValue / 100} kr` : `${deal.campaign.discountValue}%`}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">Created {formatDate(deal.createdAt)}</p>
                      </div>
                      <div className="text-right text-sm text-[var(--text-secondary)]">
                        <div>{deal.usageCount}/{deal.maxUsages}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => toggleDealMutation.mutate({ dealId: deal.id, isUsed: !deal.isUsed, usageCount: deal.isUsed ? 0 : Math.max(1, deal.usageCount) })}>{deal.isUsed ? "Restore" : "Mark used"}</Button>
                      <Button variant="danger" onClick={() => deleteDealMutation.mutate(deal.id)}>Delete</Button>
                    </div>
                  </Surface>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [activeCustomer, setActiveCustomer] = useState<CustomerRecord | null>(null);

  const customers = useQuery({ queryKey: customersQueryKey, queryFn: getCustomers });

  const filteredCustomers = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (customers.data || []).filter((customer) => !lowerQuery || `${customer.name} ${customer.phone || ""} ${customer.email || ""} ${customer.city || ""}`.toLowerCase().includes(lowerQuery));
  }, [customers.data, query]);

  if (customers.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading customers...</Surface>;
  }

  if (customers.isError || !customers.data) {
    return <ErrorPanel title="Customers could not be loaded" description="The customer endpoints are unavailable." action={<Button onClick={() => void customers.refetch()}>Retry</Button>} />;
  }

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader eyebrow="Customers" title="Customer support and deal history" description="Open a customer profile to edit core data, review orders and manage personal offers." />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Customers</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(customers.data.length)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Verified</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(customers.data.filter((customer) => customer.isVerified).length)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(customers.data.filter((customer) => customer.isActive).length)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Orders</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(customers.data.reduce((sum, customer) => sum + (customer._count?.orders || 0), 0))}</p></Surface>
      </div>

      <Surface className="px-6 py-6">
        <Field label="Search customers"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, phone, email or city" /></Field>

        {filteredCustomers.length === 0 ? (
          <div className="mt-6"><EmptyState title="No customers found" /></div>
        ) : (
          <div className="mt-6 table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Phone</th><th>City</th><th>Orders</th><th>Status</th><th /> </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div>
                        <p className="font-black">{customer.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{customer.email || "No email"}</p>
                      </div>
                    </td>
                    <td>{customer.phone || "-"}</td>
                    <td>{customer.city || "-"}</td>
                    <td>{formatNumber(customer._count?.orders || 0)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={customer.isActive ? "success" : "danger"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
                        {customer.isVerified ? <Badge tone="info">Verified</Badge> : null}
                      </div>
                    </td>
                    <td><div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveCustomer(customer)}><UserRound size={16} /> Open</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <CustomerModal customerId={activeCustomer?.id || null} open={Boolean(activeCustomer)} onClose={() => setActiveCustomer(null)} />
    </div>
  );
}
