"use client";

import { DoorOpen, PhoneOff, RotateCw, Users } from "lucide-react";

/**
 * Besked från restaurangen när kunden inte gick att nå ("Kunden gick inte att
 * nå" i plattan). Visas överst bland korten på spårningssidan, både på
 * viaeats.se och i embedden. Samma texter som API:ts mejl
 * (packages/api/src/lib/deliveryOutcome.ts). RESOLVED skickas aldrig hit.
 */

export type DeliveryOutcome = {
  code: "AT_RESTAURANT" | "LEFT_AT_DOOR" | "LEFT_WITH_NEIGHBOUR" | "REDELIVERING";
  note?: string | null;
  markedAt?: string | null;
};

export function deliveryOutcomeCopy(outcome: DeliveryOutcome, restaurantName: string, phone: string) {
  const name = restaurantName || "Restaurangen";
  switch (outcome.code) {
    case "AT_RESTAURANT":
      return {
        title: "Vi kunde inte nå dig",
        body: `Restaurangen har försökt ringa dig utan svar. Din mat finns kvar hos ${name}. Ring dem${phone ? ` på ${phone}` : ""} så löser ni det.`,
        Icon: PhoneOff,
      };
    case "LEFT_AT_DOOR":
      return {
        title: "Maten står utanför din dörr",
        body: "Restaurangen kunde inte nå dig och har lämnat maten utanför porten eller dörren.",
        Icon: DoorOpen,
      };
    case "LEFT_WITH_NEIGHBOUR":
      return {
        title: "Maten är lämnad hos en granne",
        body: outcome.note
          ? `Restaurangen kunde inte nå dig. Var maten finns: "${outcome.note}".`
          : "Restaurangen kunde inte nå dig och har lämnat maten hos en granne.",
        Icon: Users,
      };
    case "REDELIVERING":
      return {
        title: "Restaurangen försöker igen",
        body: `De kunde inte nå dig nyss och kör ut igen. Ha telefonen nära${phone ? `, de ringer från ${phone}` : ""}.`,
        Icon: RotateCw,
      };
    default:
      return null;
  }
}

export default function DeliveryOutcomeBanner({
  outcome,
  restaurantName,
  phone,
}: {
  outcome: DeliveryOutcome | null | undefined;
  restaurantName: string;
  phone?: string | null;
}) {
  if (!outcome) return null;
  const copy = deliveryOutcomeCopy(outcome, restaurantName, String(phone || "").trim());
  if (!copy) return null;
  const { Icon } = copy;
  return (
    <section
      className="ve-card flex items-start gap-3.5 px-4 py-4"
      role="status"
      aria-live="polite"
      style={{ boxShadow: "inset 0 0 0 1.5px #C77800" }}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "#FFF4DF", color: "#C77800" }}>
        <Icon size={19} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{copy.title}</span>
        <span className="block mt-1 text-[14px] leading-snug" style={{ color: "var(--ve-ink-2)" }}>{copy.body}</span>
      </span>
    </section>
  );
}
