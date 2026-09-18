import type { AdminOrder } from "./api";

export function customerDisplayName(name: string) {
  return name.replace(/\s+[–—-]\s+(viaeats|privat)$/i, "");
}

/** Visas enbart i admin. Direkt betyder att ingen extern källa kunde identifieras. */
export function OrderSource({ order }: { order: Pick<AdminOrder, "channel" | "attribution"> }) {
  const data = order.attribution;
  const source = data?.source || "unknown";
  const labels: Record<string, string> = { fb: "Meta · Facebook", ig: "Meta · Instagram", meta: "Meta", palmyra: "Palmyra", direct: "direkt", google: "Google", email: "mejl", tiktok: "TikTok", bing: "Bing", youtube: "YouTube", snapchat: "Snapchat", unknown: "okänd källa" };
  const label = order.channel === "PARTNER_EMBED" ? `Privat · ${labels[source] || data?.sourceLabel || "okänd källa"}`
    : order.channel === "VIAEATS_APP" ? "viaeats app"
    : `viaeats ${labels[source] || data?.sourceName || data?.referrer || data?.sourceLabel || "okänd källa"}`;
  const detail = [data?.surfaceLabel, source === "direct" ? "Ingen extern källa identifierad; kan även vara en omärkt länk." : data?.sourceLabel,
    data?.referrer, data?.medium, data?.campaign && `Kampanj: ${data.campaign}`, data?.adId && `Annons: ${data.adId}`,
    data?.marketingSource && data.marketingSource !== source && `Tidigare marknadsföringskälla: ${labels[data.marketingSource] || data.marketingSource}${data.marketingCampaign ? ` · ${data.marketingCampaign}` : ""}`,
    !data && "Historisk order utan sparad trafikkälla."].filter(Boolean).join(" · ");
  return <span title={detail} className="ml-1 inline-block rounded-md bg-[var(--bg-muted)] px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-normal text-[var(--text-muted)]">{label}</span>;
}
