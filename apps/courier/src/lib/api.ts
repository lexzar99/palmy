import type { ActiveDelivery, CourierProfile, DropoffProof, HistoryOrder, Job, LatLng } from "./types";

/**
 * API-lager. Kör mot mock-data när VITE_API_URL saknas (default) så hela appen
 * är klickbar utan backend. Sätt VITE_API_URL för att slå på riktiga anrop —
 * endpoint-formerna nedan matchar den planerade kurir-backenden (Fas 3c).
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";
const USE_MOCK = API_URL === "";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- mock store
const LUND: LatLng = { lat: 55.7047, lng: 13.191 };

let mockCourier: CourierProfile = {
  id: "cour_demo",
  name: "Test Kurir",
  email: "kurir@delivera.se",
  vehicle: "BIKE",
  phone: "070-000 00 00",
};

let mockJobs: Job[] = [
  {
    id: "job_1",
    orderNumber: "1234",
    restaurantName: "Sushi Yama",
    pickupAddress: "Vikingavägen 2B, 224 71 Lund",
    pickup: { lat: 55.7126, lng: 13.1972 },
    dropoffName: "Jarar Alshaher",
    dropoffAddress: "Trollebergsvägen 5, 222 29 Lund",
    dropoff: { lat: 55.7008, lng: 13.18 },
    distanceKm: 2.4,
    vehicle: "BIKE",
    payout: 120,
    tip: 15,
    expiresAt: Date.now() + 32_000,
    items: [
      { qty: 1, name: "Lax Sushi" },
      { qty: 1, name: "Spicy Tuna Roll" },
      { qty: 1, name: "Miso Soppa" },
    ],
  },
  {
    id: "job_2",
    orderNumber: "1235",
    restaurantName: "Burger House",
    pickupAddress: "Stora Gråbrödersgatan 22, 222 22 Lund",
    pickup: { lat: 55.7038, lng: 13.1925 },
    dropoffName: "Emma Andersson",
    dropoffAddress: "Långgatan 8, 222 21 Lund",
    dropoff: { lat: 55.6985, lng: 13.196 },
    distanceKm: 3.1,
    vehicle: "CAR",
    payout: 98,
    tip: 0,
    expiresAt: Date.now() + 25_000,
    items: [
      { qty: 2, name: "Cheeseburgare" },
      { qty: 1, name: "Pommes" },
    ],
  },
];

let mockActive: ActiveDelivery | null = null;

const isoToday = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const isoYesterday = (h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

let mockHistory: HistoryOrder[] = [
  { id: "h1", orderNumber: "1228", restaurantName: "Pizzeria Roma", deliveredAt: isoToday(12, 18), distanceKm: 1.8, payout: 92 },
  { id: "h2", orderNumber: "1230", restaurantName: "Thai Corner", deliveredAt: isoToday(13, 41), distanceKm: 3.2, payout: 134 },
  { id: "h3", orderNumber: "1219", restaurantName: "Sushi Yama", deliveredAt: isoYesterday(18, 9), distanceKm: 2.1, payout: 108 },
  { id: "h4", orderNumber: "1221", restaurantName: "Burger House", deliveredAt: isoYesterday(19, 27), distanceKm: 4.0, payout: 156 },
];

// --------------------------------------------------------------- real helpers
function authHeaders(): HeadersInit {
  const token = localStorage.getItem("delivera_courier_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

// ----------------------------------------------------------------------- api
export const api = {
  async login(email: string, password: string): Promise<{ token: string; courier: CourierProfile }> {
    if (USE_MOCK) {
      await wait(400);
      if (!email.trim() || !password.trim()) throw new Error("Fyll i e-post och lösenord");
      mockCourier = { ...mockCourier, email: email.trim() };
      return { token: "mock-token", courier: mockCourier };
    }
    return http("/api/courier/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },

  async profile(_token: string): Promise<CourierProfile> {
    if (USE_MOCK) return mockCourier;
    return http("/api/courier/me");
  },

  async listJobs(): Promise<Job[]> {
    if (USE_MOCK) {
      await wait(250);
      // Färsk nedräkning vid varje hämtning (annars hinner mock-ordrarna gå ut).
      return mockJobs.map((j, i) => ({ ...j, expiresAt: Date.now() + (45 - i * 8) * 1000 }));
    }
    return http("/api/courier/jobs");
  },

  async getActive(): Promise<ActiveDelivery | null> {
    if (USE_MOCK) return mockActive;
    return http("/api/courier/active");
  },

  async acceptJob(id: string): Promise<ActiveDelivery> {
    if (USE_MOCK) {
      await wait(300);
      const job = mockJobs.find((j) => j.id === id);
      if (!job) throw new Error("Ordern är inte längre tillgänglig");
      mockJobs = mockJobs.filter((j) => j.id !== id);
      mockActive = { ...job, status: "EN_ROUTE_PICKUP", acceptedAt: Date.now() };
      return mockActive;
    }
    return http(`/api/courier/jobs/${id}/accept`, { method: "POST" });
  },

  async markPickedUp(id: string): Promise<ActiveDelivery> {
    if (USE_MOCK) {
      await wait(250);
      if (mockActive && mockActive.id === id) mockActive = { ...mockActive, status: "PICKED_UP" };
      return mockActive!;
    }
    return http(`/api/courier/deliveries/${id}/picked-up`, { method: "POST" });
  },

  async completeDelivery(id: string, proof: DropoffProof): Promise<void> {
    if (USE_MOCK) {
      await wait(300);
      if (mockActive && mockActive.id === id) {
        mockHistory = [
          {
            id: `h_${id}`,
            orderNumber: mockActive.orderNumber,
            restaurantName: mockActive.restaurantName,
            deliveredAt: new Date().toISOString(),
            distanceKm: mockActive.distanceKm,
            payout: mockActive.payout,
          },
          ...mockHistory,
        ];
        mockActive = null;
      }
      return;
    }
    await http(`/api/courier/deliveries/${id}/complete`, { method: "POST", body: JSON.stringify(proof) });
  },

  async getHistory(): Promise<HistoryOrder[]> {
    if (USE_MOCK) {
      await wait(250);
      return mockHistory;
    }
    return http("/api/courier/history");
  },

  async setOnline(online: boolean): Promise<void> {
    if (USE_MOCK) return;
    await http("/api/courier/status", { method: "POST", body: JSON.stringify({ online }) });
  },

  async sendLocation(coords: LatLng): Promise<void> {
    if (USE_MOCK) return;
    await http("/api/courier/location", { method: "POST", body: JSON.stringify(coords) });
  },
};

export const isMockMode = USE_MOCK;
