import { apiDelete, apiGet } from "@/shared/api/client";

/** Bokade genomgångar från /boka på kundwebben. Lagras som EngineEvent i API:t. */
export type PartnerMeeting = {
  id: string;
  createdAt: string;
  status: string;
  mode: "onsite" | "video";
  slotStart: string | null;
  slotEnd: string | null;
  name: string;
  email: string;
  phone: string;
  restaurant: string;
  city: string;
  isPast: boolean;
};

export type PartnerMeetingList = { bookings: PartnerMeeting[]; upcomingCount: number };

export const partnerMeetingsKey = ["partner-meetings"] as const;

export const fetchPartnerMeetings = () => apiGet<PartnerMeetingList>("/admin/partner-meetings");
export const cancelPartnerMeeting = (id: string) => apiDelete<{ ok: true }>(`/admin/partner-meetings/${encodeURIComponent(id)}`);

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
export const isNewBooking = (m: PartnerMeeting, now = Date.now()) => now - new Date(m.createdAt).getTime() < NEW_WINDOW_MS;

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });

/** "tors 29 okt · 13:45–14:15" i svensk tid. */
export function meetingWhen(m: PartnerMeeting): string {
  if (!m.slotStart) return "Okänd tid";
  const start = new Date(m.slotStart);
  const end = m.slotEnd ? new Date(m.slotEnd) : null;
  return `${dayFormat.format(start).replace(/\.$/, "")} · ${timeFormat.format(start)}${end ? `–${timeFormat.format(end)}` : ""}`;
}

export const meetingModeLabel = (mode: PartnerMeeting["mode"]) => (mode === "onsite" ? "På plats" : "Videomöte");
