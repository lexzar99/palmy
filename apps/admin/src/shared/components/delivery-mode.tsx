import { Store, Truck } from "lucide-react";
import { Badge } from "@/shared/components/ui";

/**
 * En sanning för hur leveransmodellen (self vs platform) ser ut i hela admin:
 * grön = restaurangen levererar själv. Plattformsläget hålls neutralt för att
 * inte blanda ihop leveransmodell med en informations- eller varningsstatus.
 * Används av restauranglistan, ekonomisidan och restaurang-redigeringen.
 */
export function deliveryModeMeta(selfDelivery: boolean) {
  return selfDelivery
    ? { label: "Levererar själv", tone: "success" as const, color: "#16A34A", Icon: Store }
    : { label: "Vi levererar", tone: "neutral" as const, color: "var(--text-secondary)", Icon: Truck };
}

export function DeliveryModeBadge({ selfDelivery }: { selfDelivery: boolean }) {
  const m = deliveryModeMeta(selfDelivery);
  return (
    <Badge tone={m.tone}>
      <m.Icon size={12} style={{ marginRight: 4, display: "inline", verticalAlign: "-1px" }} />
      {m.label}
    </Badge>
  );
}
