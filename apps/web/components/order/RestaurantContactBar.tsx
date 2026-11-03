"use client";

import { Mail, Phone } from "lucide-react";
import "@/components/restaurant/restaurant.css";

// Restaurangens kontaktväg på spårningssidan. Kunder som inte visste hur de
// skulle nå restaurangen har gett dåliga recensioner, så raden visas i alla
// lägen och för alla ordertyper: mottagen till avslutad, nekad, avbruten och
// misslyckad, i den begränsade kioskvyn och i embeddens återställningsvy.
// Numret finns bara här på sidan (kvittots kontaktrad är en egen uppgift).
//
// target="_top" gör att tel:/mailto: öppnas utanför partnerns iframe. I embedden
// ligger EmbeddedNav (64 px + safe-area) längst ned på mobil, så raden lägger sig
// ovanför den där; från md ligger navet överst och raden går ned till kanten.

type Props = {
  phone?: string | null;
  email?: string | null;
  embed?: boolean;
};

const BAR_HEIGHT = 76;

export function restaurantContactHref(phone?: string | null, email?: string | null): string | null {
  const tel = typeof phone === "string" ? phone.replace(/[^\d+]/g, "") : "";
  if (tel) return `tel:${tel}`;
  const mail = typeof email === "string" ? email.trim() : "";
  if (mail && mail.includes("@")) return `mailto:${mail}`;
  return null;
}

export default function RestaurantContactBar({ phone, email, embed = false }: Props) {
  const href = restaurantContactHref(phone, email);
  if (!href) return null;
  const isTel = href.startsWith("tel:");
  const Icon = isTel ? Phone : Mail;
  const detail = isTel ? String(phone).trim() : String(email).trim();

  return (
    <>
      {/* Plats i flödet så att sidans sista kort aldrig hamnar under raden. */}
      <div aria-hidden className="shrink-0" style={{ height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }} />
      <div
        className={`ve-root ve-glass fixed inset-x-0 z-[90] px-4 pt-3 ${embed ? "bottom-[calc(4rem_+_env(safe-area-inset-bottom,0px))] pb-3 md:bottom-0" : "bottom-0 pb-[calc(env(safe-area-inset-bottom,0px)_+_12px)]"}`}
        style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)" }}
      >
        <a
          href={href}
          target="_top"
          data-restaurant-contact
          className="ve-press ve-card mx-auto flex h-[52px] w-full max-w-[680px] items-center gap-3 rounded-full pl-2 pr-5"
          style={{ color: "var(--ve-ink)", borderRadius: 9999 }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)" }}>
            <Icon size={17} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
            Kontakta restaurangen vid fel
          </span>
          <span className="ve-tabular hidden shrink-0 text-[14px] font-medium min-[400px]:inline" style={{ color: "var(--ve-ink-2)" }}>
            {detail}
          </span>
        </a>
      </div>
    </>
  );
}
