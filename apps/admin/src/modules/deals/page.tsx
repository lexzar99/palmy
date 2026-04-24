"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, RefreshCw } from "lucide-react";
import {
  createCustomerDeal,
  createRestaurantDeal,
  customerDealsQueryKey,
  dealCustomersQueryKey,
  dealRestaurantsQueryKey,
  dealsQueryKey,
  deleteCustomerDeal,
  deleteRestaurantDeal,
  getCustomerDeals,
  getDealCustomers,
  getDealRestaurants,
  getRestaurantDeals,
  updateCustomerDeal,
  updateRestaurantDeal,
  type CustomerDeal,
  type DealCustomerRef,
  type RestaurantDeal,
} from "@/modules/deals/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, SectionHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";

type DealTab = "restaurant" | "customer";

function RestaurantDealModal({ open, deal, restaurants, onClose }: { open: boolean; deal: RestaurantDeal | null; restaurants: Array<{ id: string; name: string }>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minOrder, setMinOrder] = useState<number>(0);
  const [isGlobal, setIsGlobal] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [showOnSite, setShowOnSite] = useState(true);
  const [maxUsages, setMaxUsages] = useState<string>("");
  const [validUntil, setValidUntil] = useState("");
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setTitle(deal?.title || "");
    setDescription(deal?.description || "");
    setDiscountType(deal?.discountType || "PERCENTAGE");
    setDiscountValue(deal?.discountValue || 10);
    setMinOrder(deal?.minOrder || 0);
    setIsGlobal(deal?.isGlobal ?? true);
    setIsActive(deal?.isActive ?? true);
    setShowOnSite(deal?.showOnSite ?? true);
    setMaxUsages(deal?.maxUsages ? String(deal.maxUsages) : "");
    setValidUntil(deal?.validUntil ? deal.validUntil.slice(0, 10) : "");
    setSelectedRestaurantIds(deal?.applicableRestaurantIds || (deal?.restaurant?.id ? [deal.restaurant.id] : []));
  }, [deal, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description || null,
        discountType,
        discountValue,
        minOrder,
        isGlobal,
        isActive,
        showOnSite,
        maxUsages: maxUsages ? Number(maxUsages) : null,
        validUntil: validUntil || null,
        applicableRestaurantIds: isGlobal ? [] : selectedRestaurantIds,
        restaurantId: !isGlobal && selectedRestaurantIds.length === 1 ? selectedRestaurantIds[0] : null,
      };
      return deal ? updateRestaurantDeal(deal.id, payload) : createRestaurantDeal(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deal) return { success: true };
      return deleteRestaurantDeal(deal.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
  });

  const toggleRestaurant = (restaurantId: string) => setSelectedRestaurantIds((current) => current.includes(restaurantId) ? current.filter((id) => id !== restaurantId) : [...current, restaurantId]);

  return (
    <Modal open={open} onClose={onClose} title={deal ? deal.title : "New restaurant deal"} footer={<div className="flex items-center justify-between gap-2"><div>{deal ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Delete</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save</Button></div></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Discount type"><Select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="PERCENTAGE">PERCENTAGE</option><option value="FIXED">FIXED</option></Select></Field>
        <Field label="Discount value"><Input type="number" value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} /></Field>
        <Field label="Minimum order"><Input type="number" value={minOrder} onChange={(event) => setMinOrder(Number(event.target.value))} /></Field>
        <Field label="Active"><Select value={isActive ? "yes" : "no"} onChange={(event) => setIsActive(event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Visible on site"><Select value={showOnSite ? "yes" : "no"} onChange={(event) => setShowOnSite(event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Global"><Select value={isGlobal ? "yes" : "no"} onChange={(event) => setIsGlobal(event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Max usages"><Input value={maxUsages} onChange={(event) => setMaxUsages(event.target.value)} /></Field>
        <Field label="Valid until"><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div>
        {!isGlobal ? <div className="md:col-span-2 surface-muted px-4 py-4"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Restaurants</p><div className="mt-3 flex flex-wrap gap-2">{restaurants.map((restaurant) => <button key={restaurant.id} type="button" onClick={() => toggleRestaurant(restaurant.id)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${selectedRestaurantIds.includes(restaurant.id) ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{restaurant.name}</button>)}</div></div> : null}
      </div>
    </Modal>
  );
}

function CustomerDealModal({ open, customers, onClose }: { open: boolean; customers: DealCustomerRef[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("FIXED");
  const [discountValue, setDiscountValue] = useState(30);
  const [maxUsages, setMaxUsages] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCode("");
    setDiscountType("FIXED");
    setDiscountValue(30);
    setMaxUsages(1);
    setValidUntil("");
    setSelectedCustomerIds([]);
    setSendToAll(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const recipients = sendToAll ? customers.map((customer) => customer.id) : selectedCustomerIds;
      await Promise.all(recipients.map((customerId, index) => createCustomerDeal(customerId, { title, code: sendToAll ? `${code}-${String(index + 1).padStart(3, "0")}` : code, discountType, discountValue, maxUsages, validUntil: validUntil || null })));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerDealsQueryKey });
      onClose();
    },
  });

  const toggleCustomer = (customerId: string) => setSelectedCustomerIds((current) => current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]);

  return (
    <Modal open={open} onClose={onClose} title="Create customer deal" footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!sendToAll && selectedCustomerIds.length === 0)}>Send deal</Button></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Code"><Input value={code} onChange={(event) => setCode(event.target.value)} /></Field>
        <Field label="Discount type"><Select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="FIXED">FIXED</option><option value="PERCENTAGE">PERCENTAGE</option></Select></Field>
        <Field label="Discount value"><Input type="number" value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} /></Field>
        <Field label="Max usages"><Input type="number" value={maxUsages} onChange={(event) => setMaxUsages(Number(event.target.value))} /></Field>
        <Field label="Valid until"><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Recipients</p>
            <Button variant="secondary" onClick={() => setSendToAll((current) => !current)}>{sendToAll ? "Target selected" : "Send to all"}</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {customers.map((customer) => <button key={customer.id} type="button" disabled={sendToAll} onClick={() => toggleCustomer(customer.id)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${selectedCustomerIds.includes(customer.id) || sendToAll ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{customer.name} • {customer.phone}</button>)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function DealsPage() {
  const [tab, setTab] = useState<DealTab>("restaurant");
  const [query, setQuery] = useState("");
  const [activeDeal, setActiveDeal] = useState<RestaurantDeal | null>(null);
  const [restaurantModalOpen, setRestaurantModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  const restaurantDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getRestaurantDeals });
  const customerDeals = useQuery({ queryKey: customerDealsQueryKey, queryFn: getCustomerDeals });
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const customers = useQuery({ queryKey: dealCustomersQueryKey, queryFn: getDealCustomers });
  const queryClient = useQueryClient();

  const toggleRestaurantMutation = useMutation({
    mutationFn: (deal: RestaurantDeal) => updateRestaurantDeal(deal.id, { isActive: !deal.isActive }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: dealsQueryKey }); },
  });

  const toggleCustomerMutation = useMutation({
    mutationFn: (deal: CustomerDeal) => updateCustomerDeal(deal.id, { isUsed: !deal.isUsed }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: customerDealsQueryKey }); },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (dealId: string) => deleteCustomerDeal(dealId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: customerDealsQueryKey }); },
  });

  const filteredRestaurantDeals = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (restaurantDeals.data || []).filter((deal) => !lowerQuery || `${deal.title} ${deal.description || ""} ${deal.restaurant?.name || ""}`.toLowerCase().includes(lowerQuery));
  }, [query, restaurantDeals.data]);

  const filteredCustomerDeals = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (customerDeals.data || []).filter((deal) => !lowerQuery || `${deal.code} ${deal.user?.name || ""} ${deal.user?.phone || ""} ${deal.campaign?.title || ""}`.toLowerCase().includes(lowerQuery));
  }, [customerDeals.data, query]);

  if (restaurantDeals.isLoading || customerDeals.isLoading || restaurants.isLoading || customers.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading deals workspace...</Surface>;
  }

  if (restaurantDeals.isError || customerDeals.isError || restaurants.isError || customers.isError) {
    return <ErrorPanel title="Deals module could not be loaded" description="One or more deal endpoints failed to respond." action={<Button onClick={() => { void restaurantDeals.refetch(); void customerDeals.refetch(); }}>Retry</Button>} />;
  }

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader eyebrow="Deals" title="Restaurant and customer deals" description="Use the existing deal APIs for platform-wide offers or targeted customer incentives." actions={<><Button variant="secondary" onClick={() => { void restaurantDeals.refetch(); void customerDeals.refetch(); }}><RefreshCw size={16} /> Refresh</Button><Button variant="primary" onClick={() => tab === "restaurant" ? setRestaurantModalOpen(true) : setCustomerModalOpen(true)}><Plus size={16} /> New deal</Button></>} />
      </Surface>

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current deal view" /></Field>
          <Tabs value={tab} onChange={setTab} options={[{ value: "restaurant", label: "Restaurant deals" }, { value: "customer", label: "Customer deals" }]} />
        </div>

        {tab === "restaurant" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredRestaurantDeals.length === 0 ? <EmptyState title="No restaurant deals" /> : filteredRestaurantDeals.map((deal) => (
              <div key={deal.id} className="surface-muted px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{deal.title}</p>
                      <Badge tone={deal.isActive ? "success" : "danger"}>{deal.isActive ? "Active" : "Paused"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.description || "No description"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="info">{deal.discountType === "FIXED" ? `${deal.discountValue} kr` : `${deal.discountValue}%`}</Badge>
                      <Badge tone="neutral">Min order {deal.minOrder} kr</Badge>
                      <Badge tone="neutral">{deal.isGlobal ? "Global" : deal.restaurant?.name || `${deal.applicableRestaurantIds?.length || 0} restaurants`}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => { setActiveDeal(deal); setRestaurantModalOpen(true); }}><Gift size={16} /> Open</Button>
                  <Button variant="secondary" onClick={() => toggleRestaurantMutation.mutate(deal)}>{deal.isActive ? "Pause" : "Activate"}</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "customer" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredCustomerDeals.length === 0 ? <EmptyState title="No customer deals" /> : filteredCustomerDeals.map((deal) => (
              <div key={deal.id} className="surface-muted px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{deal.code}</p>
                      <Badge tone={deal.isUsed ? "danger" : "success"}>{deal.isUsed ? "Used" : "Available"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.user?.name || "Unknown customer"} • {deal.user?.phone || "No phone"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="info">{deal.campaign?.title || "Campaign"}</Badge>
                      <Badge tone="neutral">{deal.campaign?.discountType === "FIXED" ? `${(deal.campaign.discountValue || 0) / 100} kr` : `${deal.campaign?.discountValue || 0}%`}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => toggleCustomerMutation.mutate(deal)}>{deal.isUsed ? "Restore" : "Mark used"}</Button>
                  <Button variant="danger" onClick={() => deleteCustomerMutation.mutate(deal.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Surface>

      <RestaurantDealModal open={restaurantModalOpen} deal={activeDeal} restaurants={restaurants.data || []} onClose={() => { setRestaurantModalOpen(false); setActiveDeal(null); }} />
      <CustomerDealModal open={customerModalOpen} customers={customers.data || []} onClose={() => setCustomerModalOpen(false)} />
    </div>
  );
}
