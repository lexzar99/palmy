import type { Metadata } from "next";
import BookingClient from "./BookingClient";

export const metadata: Metadata = {
  title: "Boka en genomgång | viaeats",
  description: "Boka 30 minuter med viaeats. Vi visar orderterminalen och hur dina kunder beställer.",
  // Länken går ut via SMS till utvalda restauranger och ska inte indexeras.
  robots: { index: false, follow: false },
};

/**
 * Förifyllning via ?r= i SMS-länken. Okända nycklar ignoreras tyst så att en
 * felskriven länk ändå leder till ett tomt, fungerande formulär.
 */
const PREFILL: Record<string, { restaurant: string; city: string }> = {
  pattaya: { restaurant: "Pattaya Bar & Restaurang", city: "Stockholm" },
  kuben: { restaurant: "Kuben", city: "Umeå" },
  pkh: { restaurant: "Pizza Kebab House", city: "Ängelholm" },
  freds: { restaurant: "Freds Pizzeria", city: "Hässleholm" },
  balkan: { restaurant: "Balkan Grill & Burek", city: "Burlöv" },
  cucco: { restaurant: "Osteria Cucco", city: "Lund" },
};

export default async function BokaPage({ searchParams }: { searchParams: Promise<{ r?: string | string[] }> }) {
  const params = await searchParams;
  const key = String(Array.isArray(params.r) ? params.r[0] : params.r || "").toLowerCase().trim();
  const prefill = PREFILL[key] ?? { restaurant: "", city: "" };
  return <BookingClient initialRestaurant={prefill.restaurant} initialCity={prefill.city} />;
}
