"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine, Plus, Search, Store, Trash2 } from "lucide-react";
import { createRestaurant, deleteRestaurant, getRestaurantDetail, getRestaurantOrders, getRestaurantOverview, patchRestaurant, restaurantsQueryKey, type ControlCenterRestaurantSnapshot, type RestaurantDetail, type RestaurantFormPayload } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, SectionHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, restaurantTierLabel } from "@/shared/utils/format";

type RestaurantTab = "info" | "menu" | "orders" | "settings";

type RestaurantFormState = {
  name: string;
  slug: string;
  description: string;
  cuisine: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  adminEmail: string;
  imageUrl: string;
  heroImageUrl: string;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
  featuredClass: number;
  isOpen: boolean;
  rating: number;
  ratingCount: number;
  adminPassword: string;
  internalInfo: string;
  tags: string;
  latitude: string;
  longitude: string;
  freeDeliveryAbove: number;
};

const emptyForm: RestaurantFormState = {
  name: "",
  slug: "",
  description: "",
  cuisine: "",
  address: "",
  city: "",
  zip: "",
  phone: "",
  adminEmail: "",
  imageUrl: "",
  heroImageUrl: "",
  deliveryFee: 0,
  minOrderAmount: 0,
  etaMinutes: 30,
  featuredClass: 3,
  isOpen: true,
  rating: 4.6,
  ratingCount: 0,
  adminPassword: "",
  internalInfo: "",
  tags: "",
  latitude: "",
  longitude: "",
  freeDeliveryAbove: 0,
};

const detailQueryKey = (restaurantId: string | null) => ["restaurants", "detail", restaurantId] as const;
const ordersQueryKey = (restaurantId: string | null) => ["restaurants", "orders", restaurantId] as const;

const mapDetailToForm = (detail: RestaurantDetail): RestaurantFormState => ({
  name: detail.name,
  slug: detail.slug,
  description: detail.description || "",
  cuisine: detail.cuisine || "",
  address: detail.address || "",
  city: detail.city || "",
  zip: detail.zip || "",
  phone: detail.phone || "",
  adminEmail: detail.adminEmail || "",
  imageUrl: detail.imageUrl || "",
  heroImageUrl: detail.heroImageUrl || "",
  deliveryFee: detail.deliveryFee || 0,
  minOrderAmount: detail.minOrderAmount || 0,
  etaMinutes: detail.baseEtaMinutes || detail.etaMinutes || 30,
  featuredClass: detail.featuredClass || 3,
  isOpen: detail.manualIsOpen,
  rating: detail.rating || 0,
  ratingCount: detail.ratingCount || 0,
  adminPassword: "",
  internalInfo: detail.internalInfo || "",
  tags: (detail.tags || []).join(", "),
  latitude: detail.latitude != null ? String(detail.latitude) : "",
  longitude: detail.longitude != null ? String(detail.longitude) : "",
  freeDeliveryAbove: detail.freeDeliveryAbove || 0,
});

const mapFormToPayload = (form: RestaurantFormState): RestaurantFormPayload => ({
  name: form.name,
  slug: form.slug || undefined,
  description: form.description || null,
  cuisine: form.cuisine || undefined,
  address: form.address || undefined,
  city: form.city || undefined,
  zip: form.zip || undefined,
  phone: form.phone || undefined,
  adminEmail: form.adminEmail || undefined,
  imageUrl: form.imageUrl || null,
  heroImageUrl: form.heroImageUrl || null,
  deliveryFee: Number(form.deliveryFee || 0),
  minOrderAmount: Number(form.minOrderAmount || 0),
  etaMinutes: Number(form.etaMinutes || 0),
  featuredClass: Number(form.featuredClass || 3),
  isOpen: form.isOpen,
  rating: Number(form.rating || 0),
  ratingCount: Number(form.ratingCount || 0),
  adminPassword: form.adminPassword || undefined,
  internalInfo: form.internalInfo || null,
  tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  latitude: form.latitude.trim() ? Number(form.latitude) : null,
  longitude: form.longitude.trim() ? Number(form.longitude) : null,
  freeDeliveryAbove: Number(form.freeDeliveryAbove || 0),
});

function RestaurantEditorModal({
  open,
  restaurant,
  onClose,
}: {
  open: boolean;
  restaurant: ControlCenterRestaurantSnapshot | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isCreate = !restaurant;
  const [tab, setTab] = useState<RestaurantTab>("info");
  const [form, setForm] = useState<RestaurantFormState>(emptyForm);

  const detail = useQuery({
    queryKey: detailQueryKey(restaurant?.id || null),
    queryFn: () => getRestaurantDetail(restaurant!.id),
    enabled: open && Boolean(restaurant?.id),
  });

  const recentOrders = useQuery({
    queryKey: ordersQueryKey(restaurant?.id || null),
    queryFn: () => getRestaurantOrders(restaurant!.id),
    enabled: open && Boolean(restaurant?.id),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setForm(emptyForm);
      setTab("info");
      return;
    }

    if (detail.data) {
      setForm(mapDetailToForm(detail.data));
    }
  }, [detail.data, isCreate, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = mapFormToPayload(form);
      if (restaurant?.id) {
        return patchRestaurant(restaurant.id, payload);
      }

      return createRestaurant(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id) return;
      await deleteRestaurant(restaurant.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      onClose();
    },
  });

  const detailData = detail.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={restaurant ? restaurant.name : "Create restaurant"}
      description={restaurant ? "Info, menu, recent orders and operational settings in one focused modal." : "Create a new partner restaurant."}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {restaurant ? (
              <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 size={16} /> Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <PencilLine size={16} />} Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "info", label: "Info" },
            { value: "menu", label: "Menu" },
            { value: "orders", label: "Orders" },
            { value: "settings", label: "Settings" },
          ]}
        />

        {tab === "info" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Slug"><Input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} /></Field>
            <Field label="Cuisine"><Input value={form.cuisine} onChange={(event) => setForm((current) => ({ ...current, cuisine: event.target.value }))} /></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></Field>
            <Field label="Address"><Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></Field>
            <Field label="Zip"><Input value={form.zip} onChange={(event) => setForm((current) => ({ ...current, zip: event.target.value }))} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
            <Field label="Admin email"><Input value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} /></Field>
            <Field label="Image URL"><Input value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} /></Field>
            <Field label="Hero image URL"><Input value={form.heroImageUrl} onChange={(event) => setForm((current) => ({ ...current, heroImageUrl: event.target.value }))} /></Field>
            <div className="md:col-span-2">
              <Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            </div>
          </div>
        ) : null}

        {tab === "menu" ? (
          detail.isLoading ? (
            <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading menu snapshot...</div>
          ) : detailData?.menu?.length ? (
            <div className="grid gap-3">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard label="Categories" value={formatNumber(detailData.menu.length)} />
                <MetricCard label="Products" value={formatNumber(detailData.menu.reduce((sum, category) => sum + category.items.length, 0))} />
                <MetricCard label="Live orders" value={formatNumber(restaurant?.liveOrders || 0)} />
              </div>
              {detailData.menu.map((category) => (
                <div key={category.id} className="surface-muted px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-black tracking-[-0.02em]">{category.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{category.description || "No description"}</p>
                    </div>
                    <Badge tone="info">{category.items.length} items</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {category.items.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
                        <p className="font-black">{item.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatCurrency(item.price)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No menu data" description="This restaurant has no categories or products yet." />
          )
        ) : null}

        {tab === "orders" ? (
          recentOrders.isLoading ? (
            <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading recent orders...</div>
          ) : recentOrders.data?.length ? (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.data.map((order) => (
                    <tr key={order.id}>
                      <td className="font-black">{order.orderNumber}</td>
                      <td>{order.customerName}</td>
                      <td><Badge tone={order.status === "PENDING" ? "warning" : order.status === "DELIVERED" ? "success" : "info"}>{orderStatusLabel(order.status)}</Badge></td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No recent orders" description="Recent restaurant order activity will appear here." />
          )
        ) : null}

        {tab === "settings" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Delivery fee"><Input type="number" value={form.deliveryFee} onChange={(event) => setForm((current) => ({ ...current, deliveryFee: Number(event.target.value) }))} /></Field>
            <Field label="Minimum order"><Input type="number" value={form.minOrderAmount} onChange={(event) => setForm((current) => ({ ...current, minOrderAmount: Number(event.target.value) }))} /></Field>
            <Field label="ETA minutes"><Input type="number" value={form.etaMinutes} onChange={(event) => setForm((current) => ({ ...current, etaMinutes: Number(event.target.value) }))} /></Field>
            <Field label="Tier class"><Select value={String(form.featuredClass)} onChange={(event) => setForm((current) => ({ ...current, featuredClass: Number(event.target.value) }))}><option value="1">Gold</option><option value="2">Silver</option><option value="3">Standard</option><option value="0">Hidden</option></Select></Field>
            <Field label="Rating"><Input type="number" step="0.1" value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: Number(event.target.value) }))} /></Field>
            <Field label="Rating count"><Input type="number" value={form.ratingCount} onChange={(event) => setForm((current) => ({ ...current, ratingCount: Number(event.target.value) }))} /></Field>
            <Field label="Free delivery above"><Input type="number" value={form.freeDeliveryAbove} onChange={(event) => setForm((current) => ({ ...current, freeDeliveryAbove: Number(event.target.value) }))} /></Field>
            <Field label="Admin password"><Input type="password" value={form.adminPassword} onChange={(event) => setForm((current) => ({ ...current, adminPassword: event.target.value }))} /></Field>
            <Field label="Latitude"><Input value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} /></Field>
            <Field label="Longitude"><Input value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} /></Field>
            <Field label="Tags"><Input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="pizza, halal, lunch" /></Field>
            <Field label="Operational status">
              <Select value={form.isOpen ? "open" : "closed"} onChange={(event) => setForm((current) => ({ ...current, isOpen: event.target.value === "open" }))}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Internal info"><Textarea value={form.internalInfo} onChange={(event) => setForm((current) => ({ ...current, internalInfo: event.target.value }))} /></Field>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function RestaurantsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention">("all");
  const [activeRestaurant, setActiveRestaurant] = useState<ControlCenterRestaurantSnapshot | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  const filteredRestaurants = useMemo(() => {
    const items = overview.data || [];
    return items.filter((restaurant) => {
      const query = search.trim().toLowerCase();
      const matchesQuery =
        !query ||
        restaurant.name.toLowerCase().includes(query) ||
        restaurant.slug.toLowerCase().includes(query) ||
        (restaurant.city || "").toLowerCase().includes(query);

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "open"
            ? restaurant.isOpen
            : restaurant.pendingOrders > 0 || !restaurant.hasHours || restaurant.reviewScore < 4.2;

      return matchesQuery && matchesFilter;
    });
  }, [filter, overview.data, search]);

  if (overview.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading restaurant operations...</Surface>;
  }

  if (overview.isError || !overview.data) {
    return (
      <ErrorPanel
        title="Restaurants could not be loaded"
        description="The overview endpoint failed to return restaurant snapshots."
        action={<Button onClick={() => void overview.refetch()}>Retry</Button>}
      />
    );
  }

  const stats = {
    total: overview.data.length,
    open: overview.data.filter((restaurant) => restaurant.isOpen).length,
    attention: overview.data.filter((restaurant) => restaurant.pendingOrders > 0 || !restaurant.hasHours || restaurant.reviewScore < 4.2).length,
    live: overview.data.reduce((sum, restaurant) => sum + restaurant.liveOrders, 0),
  };

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Restaurants"
          title="Restaurant control"
          description="Every restaurant opens in a focused modal with separate tabs for info, menu, orders and settings."
          actions={
            <>
              <Button variant="secondary" onClick={() => void overview.refetch()}>
                Refresh
              </Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={16} /> New restaurant
              </Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Restaurants" value={formatNumber(stats.total)} />
        <MetricCard label="Open now" value={formatNumber(stats.open)} />
        <MetricCard label="Need attention" value={formatNumber(stats.attention)} />
        <MetricCard label="Live orders" value={formatNumber(stats.live)} />
      </div>

      <Surface className="px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by restaurant, city or slug" />
          </div>
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Open" },
              { value: "attention", label: "Attention" },
            ]}
          />
        </div>

        {filteredRestaurants.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No restaurants match the current filters" />
          </div>
        ) : (
          <div className="mt-6 table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Revenue today</th>
                  <th>Tier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.map((restaurant) => (
                  <tr key={restaurant.id}>
                    <td>
                      <div>
                        <p className="font-black text-[var(--text-primary)]">{restaurant.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"} • {restaurant.slug}</p>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={restaurant.isOpen ? "success" : "neutral"}>{restaurant.isOpen ? "Open" : "Closed"}</Badge>
                        {restaurant.pendingOrders > 0 ? <Badge tone="warning">{restaurant.pendingOrders} pending</Badge> : null}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-[var(--text-secondary)]">
                        <div>{formatNumber(restaurant.todayOrders)} today</div>
                        <div>{formatNumber(restaurant.liveOrders)} live</div>
                      </div>
                    </td>
                    <td>{formatCurrency(restaurant.todayRevenue)}</td>
                    <td>{restaurantTierLabel(restaurant.featuredClass)}</td>
                    <td>
                      <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setActiveRestaurant(restaurant)}>
                          <Store size={16} /> Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <RestaurantEditorModal open={Boolean(activeRestaurant)} restaurant={activeRestaurant} onClose={() => setActiveRestaurant(null)} />
      <RestaurantEditorModal open={createOpen} restaurant={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
