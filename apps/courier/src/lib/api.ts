import { MAX_ACTIVE, type ActiveDelivery, type CourierProfile, type DropoffProof, type HistoryOrder, type Job, type LatLng } from "./types";

/**
 * API-lager. Kör mot mock-data när VITE_API_URL saknas (default) så hela appen
 * är klickbar utan backend. Sätt VITE_API_URL för att slå på riktiga anrop —
 * endpoint-formerna nedan matchar den planerade kurir-backenden (Fas 3c).
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";
const USE_MOCK = API_URL === "";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- mock store
let mockCourier: CourierProfile = {
  id: "cour_demo",
  name: "Test Kurir",
  email: "kurir@delivera.se",
  city: "Lund",
  vehicle: "BIKE",
  phone: "070-000 00 00",
};

let mockJobs: Job[] = [
  {
    id: "job_1",
    orderNumber: "1234",
    city: "Lund",
    restaurantName: "Sushi Yama",
    pickupAddress: "Vikingavägen 2B, 224 71 Lund",
    pickup: { lat: 55.7126, lng: 13.1972 },
    dropoffName: "Jarar Alshaher",
    dropoffAddress: "Trollebergsvägen 5, 222 29 Lund",
    dropoff: { lat: 55.7008, lng: 13.18 },
    distanceKm: 2.4,
    etaMin: 11,
    vehicle: "BIKE",
    payout: 120,
    tip: 15,
    expiresAt: 0,
    items: [
      { qty: 1, name: "Lax Sushi" },
      { qty: 1, name: "Spicy Tuna Roll" },
      { qty: 1, name: "Miso Soppa" },
    ],
  },
  {
    id: "job_2",
    orderNumber: "1235",
    city: "Lund",
    restaurantName: "Burger House",
    pickupAddress: "Stora Gråbrödersgatan 22, 222 22 Lund",
    pickup: { lat: 55.7038, lng: 13.1925 },
    dropoffName: "Emma Andersson",
    dropoffAddress: "Långgatan 8, 222 21 Lund",
    dropoff: { lat: 55.6985, lng: 13.196 },
    distanceKm: 3.1,
    etaMin: 13,
    vehicle: "CAR",
    payout: 98,
    tip: 0,
    expiresAt: 0,
    items: [
      { qty: 2, name: "Cheeseburgare" },
      { qty: 1, name: "Pommes" },
    ],
  },
  {
    id: "job_3",
    orderNumber: "1236",
    city: "Lund",
    restaurantName: "Napoli Pizza",
    pickupAddress: "Bredgatan 10, 222 21 Lund",
    pickup: { lat: 55.7059, lng: 13.1936 },
    dropoffName: "Sofia Berg",
    dropoffAddress: "Kävlingevägen 14, 222 40 Lund",
    dropoff: { lat: 55.7102, lng: 13.1825 },
    distanceKm: 1.6,
    etaMin: 8,
    vehicle: "BIKE",
    payout: 85,
    tip: 10,
    expiresAt: 0,
    items: [
      { qty: 1, name: "Margherita" },
      { qty: 1, name: "Vitlöksbröd" },
    ],
  },
];

let mockActiveList: ActiveDelivery[] = [];

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
      // Stad-koppling: bara ordrar i kurirens stad, och inte de man redan tagit.
      // Färsk nedräkning vid varje hämtning (annars hinner mock-ordrarna gå ut).
      return mockJobs
        .filter((j) => j.city === mockCourier.city && !mockActiveList.some((a) => a.id === j.id))
        .map((j, i) => ({ ...j, expiresAt: Date.now() + (50 - i * 7) * 1000 }));
    }
    return http("/api/courier/jobs");
  },

  async getJobById(id: string): Promise<Job | null> {
    if (USE_MOCK) {
      await wait(150);
      const j = mockJobs.find((x) => x.id === id && !mockActiveList.some((a) => a.id === id));
      return j ? { ...j, expiresAt: Date.now() + 45_000 } : null;
    }
    return http(`/api/courier/jobs/${id}`);
  },

  async getActiveList(): Promise<ActiveDelivery[]> {
    if (USE_MOCK) return mockActiveList;
    return http("/api/courier/active");
  },

  async getActiveById(id: string): Promise<ActiveDelivery | null> {
    if (USE_MOCK) return mockActiveList.find((a) => a.id === id) ?? null;
    return http(`/api/courier/deliveries/${id}`);
  },

  async acceptJob(id: string): Promise<ActiveDelivery> {
    if (USE_MOCK) {
      await wait(300);
      if (mockActiveList.length >= MAX_ACTIVE) throw new Error(`Du kan ha max ${MAX_ACTIVE} ordrar samtidigt`);
      const job = mockJobs.find((j) => j.id === id);
      if (!job) throw new Error("Ordern är inte längre tillgänglig");
      const active: ActiveDelivery = { ...job, status: "EN_ROUTE_PICKUP", acceptedAt: Date.now() };
      mockActiveList = [...mockActiveList, active];
      return active;
    }
    return http(`/api/courier/jobs/${id}/accept`, { method: "POST" });
  },

  async markPickedUp(id: string): Promise<ActiveDelivery> {
    if (USE_MOCK) {
      await wait(250);
      mockActiveList = mockActiveList.map((a) => (a.id === id ? { ...a, status: "PICKED_UP" } : a));
      return mockActiveList.find((a) => a.id === id)!;
    }
    return http(`/api/courier/deliveries/${id}/picked-up`, { method: "POST" });
  },

  async completeDelivery(id: string, proof: DropoffProof): Promise<void> {
    if (USE_MOCK) {
      await wait(300);
      const a = mockActiveList.find((x) => x.id === id);
      if (a) {
        mockHistory = [
          { id: `h_${id}`, orderNumber: a.orderNumber, restaurantName: a.restaurantName, deliveredAt: new Date().toISOString(), distanceKm: a.distanceKm, payout: a.payout },
          ...mockHistory,
        ];
        mockActiveList = mockActiveList.filter((x) => x.id !== id);
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

  async sendLocation(coords: LatLng): Promise<void> {
    if (USE_MOCK) return;
    await http("/api/courier/location", { method: "POST", body: JSON.stringify(coords) });
  },
};

export const isMockMode = USE_MOCK;
