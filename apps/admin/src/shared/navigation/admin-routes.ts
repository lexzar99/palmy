import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Bike,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Code2,
  ContactRound,
  Gauge,
  Gift,
  History,
  House,
  LayoutDashboard,
  Map,
  MenuSquare,
  Network,
  ReceiptText,
  Shield,
  Star,
  Store,
  Tablet,
  TicketPercent,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminSectionId =
  | "live"
  | "partners"
  | "customers-support"
  | "growth"
  | "finance"
  | "system";

export type AdminRouteDefinition = {
  id: string;
  href: string;
  label: string;
  shortLabel?: string;
  description?: string;
  icon: LucideIcon;
  section: AdminSectionId;
  keywords?: string;
  requiredRole: "SUPER_ADMIN";
};

export type AdminSectionDefinition = {
  id: AdminSectionId;
  label: string;
  routes: AdminRouteDefinition[];
};

const route = (
  definition: Omit<AdminRouteDefinition, "requiredRole">,
): AdminRouteDefinition => ({ ...definition, requiredRole: "SUPER_ADMIN" });

export const ADMIN_ROUTES: AdminRouteDefinition[] = [
  route({ id: "dashboard", href: "/dashboard", label: "Operationsöversikt", shortLabel: "Översikt", icon: LayoutDashboard, section: "live", keywords: "dashboard start hem drift sla" }),
  route({ id: "orders", href: "/orders", label: "Liveordrar", shortLabel: "Ordrar", icon: ClipboardList, section: "live", keywords: "live aktiva nya order kö" }),
  route({ id: "order-history", href: "/order-history", label: "Orderhistorik", shortLabel: "Historik", icon: History, section: "live", keywords: "historik gamla export" }),
  route({ id: "couriers", href: "/couriers", label: "Kurirer & dispatch", shortLabel: "Kurirer", icon: Bike, section: "live", keywords: "bud leverans dispatch" }),
  route({ id: "crisis", href: "/crisis", label: "Incidenter", icon: AlertTriangle, section: "live", keywords: "kris emergency stäng refund akut" }),

  route({ id: "restaurants", href: "/restaurants", label: "Restauranger", icon: Store, section: "partners", keywords: "partner restaurang" }),
  route({ id: "brands", href: "/brands", label: "Kedjor", icon: Network, section: "partners", keywords: "brand kedja chain nätverk" }),
  route({ id: "menu", href: "/menu", label: "Menyer", icon: MenuSquare, section: "partners", keywords: "rätter produkter items katalog" }),
  route({ id: "zones", href: "/zones", label: "Leveransområden", shortLabel: "Zoner", icon: Map, section: "partners", keywords: "leverans zone stad city karta" }),
  route({ id: "restaurant-devices", href: "/restaurant-devices", label: "Restaurangenheter", shortLabel: "Enheter", icon: Tablet, section: "partners", keywords: "terminal pos surfplatta pairing" }),
  route({ id: "embeds", href: "/embeds", label: "Partner-embeds", shortLabel: "Embeds", icon: Code2, section: "partners", keywords: "embed partner meny kiosk hemsida" }),
  route({ id: "receipts", href: "/receipts", label: "Kvitto & utskrift", icon: ReceiptText, section: "partners", keywords: "restaurangkvitto skrivare print mall" }),

  route({ id: "customers", href: "/customers", label: "Kunder", icon: ContactRound, section: "customers-support", keywords: "kund sök lookup gdpr support" }),
  route({ id: "reviews", href: "/reviews", label: "Recensioner", icon: Star, section: "customers-support", keywords: "stjärnor betyg svar" }),

  route({ id: "homepage", href: "/homepage", label: "Hemskärm", icon: House, section: "growth", keywords: "hero startsida sektioner kategorier rails showcase sponsor annons placement" }),
  route({ id: "deals", href: "/deals", label: "Deals & kampanjer", shortLabel: "Deals", icon: Gift, section: "growth", keywords: "kampanj rabatt app" }),
  route({ id: "coupons", href: "/coupons", label: "Kuponger", icon: TicketPercent, section: "growth", keywords: "kupong rabattkod kod" }),
  route({ id: "referrals", href: "/referrals", label: "Värva vän", icon: UserPlus, section: "growth", keywords: "referral värva vän välkomst" }),
  route({ id: "launch-campaign", href: "/launch-campaign", label: "Launch-kampanj", shortLabel: "Launch", icon: BarChart3, section: "growth", keywords: "launch intresse leads rabatt kampanj statistik funnel" }),
  route({ id: "push", href: "/push", label: "Push-notiser", shortLabel: "Push", icon: BellRing, section: "growth", keywords: "notification meddelande" }),

  route({ id: "finance", href: "/finance", label: "Ekonomi", shortLabel: "Ekonomi", icon: CircleDollarSign, section: "finance", keywords: "finance payout intäkt reconciliation utbetalningar tiers provision moms" }),

  route({ id: "users", href: "/users", label: "Personal", icon: Users, section: "system", keywords: "admin användare säkerhet personal team konton" }),
  route({ id: "api-health", href: "/api-health", label: "API-status", icon: Gauge, section: "system", keywords: "uptime hälsa status" }),
  route({ id: "audit-log", href: "/audit-log", label: "Audit-logg", icon: History, section: "system", keywords: "logg compliance revision" }),
  route({ id: "platform-settings", href: "/platform-settings", label: "Plattformsinställningar", shortLabel: "Plattform", icon: Building2, section: "system", keywords: "företag company settings integrationer" }),
  route({ id: "two-factor", href: "/users?tab=sakerhet", label: "2FA & enheter", icon: Shield, section: "system", keywords: "totp säkerhet trusted devices" }),
];

const SECTION_LABELS: Record<AdminSectionId, string> = {
  live: "Live",
  partners: "Partners",
  "customers-support": "Kunder & support",
  growth: "Tillväxt",
  finance: "Ekonomi",
  system: "System",
};

const SECTION_ORDER: AdminSectionId[] = [
  "live",
  "partners",
  "customers-support",
  "growth",
  "finance",
  "system",
];

export const ADMIN_SECTIONS: AdminSectionDefinition[] = SECTION_ORDER.map((id) => ({
  id,
  label: SECTION_LABELS[id],
  routes: ADMIN_ROUTES.filter((item) => item.section === id),
}));

export const ADMIN_SECTION_LABELS = SECTION_LABELS;

export function isActiveAdminHref(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getAdminRoute(id: string): AdminRouteDefinition | undefined {
  return ADMIN_ROUTES.find((item) => item.id === id);
}
