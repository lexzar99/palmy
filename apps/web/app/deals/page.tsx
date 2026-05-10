"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Tag, Zap, ArrowRight, Clock, Store } from "lucide-react";
import axios from "axios";
import { API_URL } from "@/lib/api";

interface PublicDeal {
  id: string;
  title: string;
  description: string | null;
  badgeText: string | null;
  imageUrl: string | null;
  discountType: string;
  discountValue: number;
  minOrder: number;
  validUntil: string | null;
  isGlobal: boolean;
  triggerType: string;
  scopeType: string;
  restaurantId: string | null;
  restaurant?: { id: string; name: string; slug: string } | null;
}

interface PersonalDeal {
  id: string;
  code: string | null;
  campaign?: {
    id: string;
    title: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    minOrder: number;
    validUntil: string | null;
  } | null;
}

function formatReward(deal: PublicDeal) {
  if (deal.triggerType === "BOGO_CATEGORY") return "1 gratis";
  if (deal.discountType === "FIXED") return `-${deal.discountValue} kr`;
  if (deal.discountType === "FIXED_PRICE") return `Fast pris`;
  return `-${deal.discountValue}%`;
}

const TONES = [
  { accent: "#EAB545", bg: "rgba(234,181,69,0.08)", border: "rgba(234,181,69,0.2)" },
  { accent: "#F07A13", bg: "rgba(240,122,19,0.08)", border: "rgba(240,122,19,0.2)" },
  { accent: "#A855F7", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.2)" },
  { accent: "#63CA84", bg: "rgba(99,202,132,0.08)", border: "rgba(99,202,132,0.2)" },
];

function PublicDealCard({ deal, index }: { deal: PublicDeal; index: number }) {
  const tone = TONES[index % TONES.length];
  const isBogo = deal.triggerType === "BOGO_CATEGORY";

  return (
    <Link href={`/deals/${deal.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.25 }}
        className="rounded-[20px] border overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: tone.bg, borderColor: tone.border }}
      >
        {deal.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.imageUrl} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className="h-16 w-full flex items-center justify-center" style={{ background: `${tone.accent}18` }}>
            {isBogo ? <Zap size={22} style={{ color: tone.accent }} /> : <Tag size={22} style={{ color: tone.accent }} />}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
              style={{ background: `${tone.accent}22`, color: tone.accent }}
            >
              {deal.badgeText || formatReward(deal)}
            </span>
            <ArrowRight size={13} style={{ color: tone.accent }} />
          </div>
          <p className="mt-2 text-sm font-black leading-tight" style={{ color: "var(--text-primary)" }}>
            {deal.title}
          </p>
          {deal.description ? (
            <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
              {deal.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
            {deal.restaurant ? (
              <span className="inline-flex items-center gap-1">
                <Store size={10} /> {deal.restaurant.name}
              </span>
            ) : deal.isGlobal ? (
              <span className="inline-flex items-center gap-1">
                <Store size={10} /> Alla restauranger
              </span>
            ) : null}
            {deal.minOrder > 0 ? <span>• Min {deal.minOrder} kr</span> : null}
            {deal.validUntil ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} /> t.o.m. {new Date(deal.validUntil).toLocaleDateString("sv-SE")}
              </span>
            ) : null}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function PersonalDealCard({ pd, index }: { pd: PersonalDeal; index: number }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!pd.code) return;
    navigator.clipboard.writeText(pd.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const cam = pd.campaign;
  const rewardLabel = cam
    ? cam.discountType === "PERCENTAGE"
      ? `-${cam.discountValue}%`
      : `-${cam.discountValue} kr`
    : "Rabatt";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-[20px] border p-4"
      style={{ background: "rgba(168,85,247,0.07)", borderColor: "rgba(168,85,247,0.22)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest" style={{ background: "rgba(168,85,247,0.2)", color: "#A855F7" }}>
            Personligt
          </span>
          <p className="mt-2 text-sm font-black" style={{ color: "var(--text-primary)" }}>
            {cam?.title || "Erbjudande"}
          </p>
          {cam?.description ? (
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {cam.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "#A855F7" }}>{rewardLabel}</span>
            {cam?.minOrder ? <span>• Min {cam.minOrder} kr</span> : null}
            {cam?.validUntil ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} /> t.o.m. {new Date(cam.validUntil).toLocaleDateString("sv-SE")}
              </span>
            ) : null}
          </div>
        </div>
        {pd.code ? (
          <button
            onClick={copy}
            className="shrink-0 rounded-[12px] px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors"
            style={{ background: copied ? "rgba(99,202,132,0.2)" : "rgba(168,85,247,0.15)", color: copied ? "#63CA84" : "#A855F7" }}
          >
            {copied ? "Kopierad!" : pd.code}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

export default function DealsPage() {
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<PersonalDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/deals`),
      axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
    ]).then(([resDeals, resPersonal]) => {
      const pub = Array.isArray(resDeals.data) ? resDeals.data : [];
      setDeals(pub);
      setPersonalDeals(Array.isArray(resPersonal.data) ? resPersonal.data : []);
    }).finally(() => setLoading(false));
  }, []);

  const bogoDeals = useMemo(() => deals.filter(d => d.triggerType === "BOGO_CATEGORY"), [deals]);
  const regularDeals = useMemo(() => deals.filter(d => d.triggerType !== "BOGO_CATEGORY"), [deals]);

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(234,181,69,0.12)" }}>
            <Sparkles size={18} style={{ color: "#EAB545" }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em]" style={{ color: "var(--text-primary)" }}>
              Erbjudanden
            </h1>
            <p className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
              Aktuella deals & rabatter
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 rounded-[20px] animate-pulse" style={{ background: "var(--surface-secondary)" }} />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Personliga erbjudanden */}
            {personalDeals.length > 0 ? (
              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
                  Dina erbjudanden
                </p>
                <div className="space-y-3">
                  {personalDeals.map((pd, i) => (
                    <PersonalDealCard key={pd.id} pd={pd} index={i} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* BOGO deals */}
            {bogoDeals.length > 0 ? (
              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
                  Köp &amp; få gratis
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {bogoDeals.map((d, i) => (
                    <PublicDealCard key={d.id} deal={d} index={i} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Övriga deals */}
            {regularDeals.length > 0 ? (
              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
                  Rabatter &amp; kampanjer
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {regularDeals.map((d, i) => (
                    <PublicDealCard key={d.id} deal={d} index={bogoDeals.length + i} />
                  ))}
                </div>
              </section>
            ) : null}

            {!loading && deals.length === 0 && personalDeals.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-4xl mb-4">🎫</p>
                <p className="font-black text-lg" style={{ color: "var(--text-primary)" }}>Inga aktiva erbjudanden just nu</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Kom tillbaka snart!</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
