"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { writeActiveUserDeal } from "@/lib/appDeal";

type ReferralDeal = {
  id: string;
  userDealId: string;
  code?: string | null;
  title: string;
  discountPercent?: number | null;
  amountKr?: number | null;
  freeDelivery?: boolean;
  minOrderKr?: number;
};

type ReferralProfile = {
  enabled: boolean;
  locked: boolean;
  code?: string | null;
  shareUrl?: string | null;
  inviterRewardLabel?: string | null;
  inviteeRewardLabel?: string | null;
  deals?: ReferralDeal[];
};

function readGuestPhone() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("guest_phone") || localStorage.getItem("viaeats.cart.guestPhone") || "";
}

export default function ReferralProfileCard({ phone }: { phone?: string | null }) {
  const [data, setData] = useState<ReferralProfile | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resolvedPhone = useMemo(() => phone?.trim() || readGuestPhone(), [phone]);

  useEffect(() => {
    const controller = new AbortController();
    const query = resolvedPhone ? `?phone=${encodeURIComponent(resolvedPhone)}` : "";
    fetch(`/api/platform/public/referral-profile${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setData(payload))
      .catch(() => null);
    return () => controller.abort();
  }, [resolvedPhone]);

  if (!data?.enabled) return null;

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1600);
  };
  const share = async () => {
    const value = data.shareUrl || data.code || "";
    if (!value) return;
    if (navigator.share) {
      await navigator.share({ title: "Värva en vän", text: `Använd min kod ${data.code}`, url: data.shareUrl || undefined }).catch(() => null);
    } else {
      await copy(value);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-[#f1d6c8] bg-[#fff7ee] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Image src="/viaeats-launch-icon.png" width={54} height={54} alt="ViaEats" className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold text-[#0b2748]">Värva en vän</p>
          <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-[#5d6672]">
            Din vän får {data.inviteeRewardLabel || "rabatt"}. Du får {data.inviterRewardLabel || "rabatt"} efter vänens slutförda order.
          </p>
        </div>
      </div>

      {data.locked ? (
        <div className="mt-3 rounded-2xl bg-white/80 px-3.5 py-3 text-[12.5px] font-semibold text-[#0b2748]">
          Beställ en gång så skapas din personliga kod automatiskt på telefonnumret.
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white p-2.5">
          <span className="min-w-0 flex-1 pl-1 font-mono text-[17px] font-black tracking-wider text-[#0b2748]">{data.code}</span>
          <button type="button" onClick={() => void copy(data.code || "")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#0b2748]" aria-label="Kopiera kod">
            {copied === data.code ? <Check size={17} /> : <Copy size={17} />}
          </button>
          <button type="button" onClick={() => void share()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fb4b16] text-white" aria-label="Dela kod"><Share2 size={17} /></button>
        </div>
      )}

      {!!data.deals?.length && (
        <div className="mt-3 space-y-2">
          {data.deals.map((deal) => (
            <div key={deal.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
              <Gift size={17} className="shrink-0 text-[#fb4b16]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-[#0b2748]">{deal.title}</p>
                {deal.code && <p className="font-mono text-[11px] font-bold tracking-wide text-[#6b7280]">{deal.code}</p>}
              </div>
              <Link href="/cart" onClick={() => writeActiveUserDeal(deal.userDealId, deal)} className="rounded-xl bg-[#0b2748] px-3 py-2 text-[11px] font-bold text-white">Använd</Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
