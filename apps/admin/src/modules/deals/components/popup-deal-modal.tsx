"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Trash2, Link2 } from "lucide-react";
import { dealsQueryKey, updateAutomaticDeal, type AutomaticDealRecord } from "@/modules/deals/api";
import { popupDealsQueryKey } from "@/modules/popup-builder/api";
import { apiPost } from "@/shared/api/client";
import { Badge, Button, Field, Input, Modal, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

type PopupOverlay = {
  popupHeadline: string;
  popupBody: string;
  popupCtaLabel: string;
  popupCode: string;
  imageUrl: string;
  popupEnabled: boolean;
  popupOkOnly: boolean;
};

type PushSettings = {
  sendPush: boolean;
  pushTitle: string;
  pushBody: string;
};

const emptyOverlay: PopupOverlay = {
  popupHeadline: "",
  popupBody: "",
  popupCtaLabel: "Spara erbjudande",
  popupCode: "",
  imageUrl: "",
  popupEnabled: true,
  popupOkOnly: false,
};

const emptyPush: PushSettings = {
  sendPush: true,
  pushTitle: "",
  pushBody: "Tryck för att se ditt nya erbjudande →",
};

// Live-preview — exakt vad kunden ser i webb/RN.
function PopupPreview({ deal, overlay }: { deal: AutomaticDealRecord; overlay: PopupOverlay }) {
  const headline = overlay.popupHeadline.trim() || deal.title;
  const body = overlay.popupBody.trim() || deal.description || "";
  const cta = overlay.popupCtaLabel.trim() || "Spara erbjudande";
  const badge = deal.badgeText || (deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%` : "");
  const code = overlay.popupCode.trim();
  const image = overlay.imageUrl || deal.imageUrl;

  return (
    <div className="surface-muted px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Live-preview</p>
        <Sparkles size={14} className="text-[var(--accent-strong)]" />
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Kundens vy första gången appen öppnas:</p>
      <div className="mt-4 flex justify-center">
        <div
          className="w-[340px] max-w-full rounded-[28px] p-6 shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #1a1f29 0%, #11151b 100%)",
            border: "1px solid rgba(243,191,87,0.3)",
            color: "#fff",
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="mb-4 h-40 w-full rounded-2xl object-cover" />
          ) : (
            <div className="mb-4 flex h-40 w-full items-center justify-center rounded-2xl bg-[rgba(243,191,87,0.1)] text-4xl">🎁</div>
          )}
          {badge ? (
            <div className="mb-3 inline-block rounded-full bg-[#f3bf57] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11151b]">
              {badge}
            </div>
          ) : null}
          <h3 className="text-2xl font-black tracking-[-0.04em]">{headline}</h3>
          {body ? <p className="mt-3 text-sm leading-6 text-white/80">{body}</p> : null}
          {deal.minOrder > 0 ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/50">Minsta order {deal.minOrder} kr</p>
          ) : null}
          {deal.validUntil ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/50">Gäller t.o.m. {String(deal.validUntil).slice(0, 10)}</p>
          ) : null}
          {code ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#f3bf57]/40 bg-[#f3bf57]/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3bf57]">Använd kod</p>
              <p className="mt-1 text-lg font-black tracking-wider text-white">{code}</p>
            </div>
          ) : null}
          <button type="button" disabled tabIndex={-1} style={{ pointerEvents: "none" }} className="mt-5 w-full rounded-2xl bg-[#f3bf57] py-4 text-sm font-black uppercase tracking-[0.2em] text-[#11151b]">{overlay.popupOkOnly ? "OK" : cta}</button>
          {!overlay.popupOkOnly ? (
            <button type="button" disabled tabIndex={-1} style={{ pointerEvents: "none" }} className="mt-2 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Inte just nu</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Popup-modal: tar en BEFINTLIG deal och lägger på popup-presentation.
 * Inget nytt deal-objekt skapas — vi sparar bara popupHeadline, popupBody,
 * popupCtaLabel, popupCode, popupEnabled och imageUrl på samma deal-rad.
 *
 * För att radera popupen sätter vi popupEnabled=false och nollar
 * popup-fälten. Själva dealen lämnas orörd och syns kvar i Restaurant/
 * Product/Category-fliken.
 */
export function PopupDealModal({
  open,
  onClose,
  deal,
}: {
  open: boolean;
  onClose: () => void;
  deal: AutomaticDealRecord | null;
}) {
  const queryClient = useQueryClient();
  const [overlay, setOverlay] = useState<PopupOverlay>(emptyOverlay);
  const [push, setPush] = useState<PushSettings>(emptyPush);
  const [pushSent, setPushSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !deal) return;
    setOverlay({
      popupHeadline: (deal as any).popupHeadline || "",
      popupBody: (deal as any).popupBody || "",
      popupCtaLabel: (deal as any).popupCtaLabel || "Spara erbjudande",
      popupCode: (deal as any).popupCode || "",
      imageUrl: deal.imageUrl || "",
      popupEnabled: deal.popupEnabled !== false,
      popupOkOnly: Boolean((deal as any).popupOkOnly),
    });
    setPush({
      sendPush: true,
      pushTitle: (deal as any).popupHeadline || deal.title,
      pushBody: emptyPush.pushBody,
    });
    setError(null);
    setPushSent(null);
  }, [open, deal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (patch: Partial<PopupOverlay>) => setOverlay((current) => ({ ...current, ...patch }));
  const updatePush = (patch: Partial<PushSettings>) => setPush((current) => ({ ...current, ...patch }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!deal) return null as any;
      const updated = await updateAutomaticDeal(deal.id, {
        popupHeadline: overlay.popupHeadline.trim() || null,
        popupBody: overlay.popupBody.trim() || null,
        popupCtaLabel: overlay.popupCtaLabel.trim() || null,
        popupCode: overlay.popupCode.trim() || null,
        imageUrl: overlay.imageUrl.trim() || null,
        popupEnabled: overlay.popupEnabled,
        popupOkOnly: overlay.popupOkOnly,
      });

      // Skicka push-notis till alla aktiva users om admin valt det.
      // Skickas bara om dealen sparas som aktiv popup — inte vid pause/remove.
      if (push.sendPush && overlay.popupEnabled && push.pushTitle.trim() && push.pushBody.trim()) {
        try {
          const result = await apiPost<{ count: number; success: boolean }>(
            "/notifications/admin/send-all",
            {
              title: push.pushTitle.trim(),
              body: push.pushBody.trim(),
              data: { dealId: deal.id, kind: "popup-claim" },
            },
          );
          setPushSent(`Notis skickad till ${result.count} enheter.`);
        } catch (e: any) {
          setPushSent(`Notis kunde inte skickas: ${e?.response?.data?.error || e?.message || "okänt fel"}`);
        }
      }
      return updated;
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
      // Stäng inte direkt om push-status visas — låt admin se kvittensen.
      if (!push.sendPush) onClose();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error || "Kunde inte spara popupen.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!deal) return Promise.resolve(null as any);
      // "Radera popup" = ta bort popup-overlay men lämna dealen kvar.
      return updateAutomaticDeal(deal.id, {
        popupHeadline: null,
        popupBody: null,
        popupCtaLabel: null,
        popupCode: null,
        popupEnabled: false,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
      onClose();
    },
  });

  if (!deal) return null;

  const hasPopupContent = Boolean(
    (deal as any).popupHeadline?.trim() || (deal as any).popupBody?.trim() || (deal as any).popupCode?.trim(),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hasPopupContent ? `Redigera popup för ${deal.title}` : `Skicka popup för ${deal.title}`}
      widthClassName="max-w-[1200px]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {hasPopupContent ? (
              <Button variant="danger" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
                <Trash2 size={16} /> Ta bort popup
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onClose}>Stäng</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {hasPopupContent ? "Uppdatera popup" : "Skicka popup"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          <div className="surface-muted px-5 py-4">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-[var(--accent-strong)]" />
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Kopplad deal</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-base font-black tracking-[-0.02em]">{deal.title}</p>
              <Badge tone="info">{deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}</Badge>
              {deal.minOrder > 0 ? <Badge tone="neutral">min {deal.minOrder} kr</Badge> : null}
              {deal.isGlobal ? <Badge tone="neutral">Alla restauranger</Badge> : <Badge tone="neutral">{deal.restaurant?.name || "1 restaurang"}</Badge>}
              {deal.validUntil ? <Badge tone="neutral">t.o.m. {String(deal.validUntil).slice(0, 10)}</Badge> : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Popup-rubrik (det stora som syns)">
              <Input value={overlay.popupHeadline} onChange={(e) => update({ popupHeadline: e.target.value })} placeholder={deal.title} />
            </Field>
            <Field label="CTA-knappens text">
              <Input value={overlay.popupCtaLabel} onChange={(e) => update({ popupCtaLabel: e.target.value })} placeholder="Spara erbjudande" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Brödtext">
                <Textarea value={overlay.popupBody} onChange={(e) => update({ popupBody: e.target.value })} placeholder={deal.description || "Beskriv villkoren och varför kunden ska klämma."} />
              </Field>
            </div>
            <Field label="Kod kunden ser (valfri)">
              <Input value={overlay.popupCode} onChange={(e) => update({ popupCode: e.target.value })} placeholder="HÖST20" />
            </Field>
            <Field label="Aktiv popup">
              <select className="select" value={overlay.popupEnabled ? "yes" : "no"} onChange={(e) => update({ popupEnabled: e.target.value === "yes" })}>
                <option value="yes">Visa för kunder</option>
                <option value="no">Pausa popup</option>
              </select>
            </Field>
            <Field label="Popup-typ">
              <select className="select" value={overlay.popupOkOnly ? "ok" : "claim"} onChange={(e) => update({ popupOkOnly: e.target.value === "ok" })}>
                <option value="claim">Spara erbjudande + Inte nu (för deals med kod/rabatt)</option>
                <option value="ok">Bara OK-knapp (informativ — ingen kod att spara)</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <ImageUploadField label="Hero-bild i popupen" value={overlay.imageUrl} onChange={(url) => update({ imageUrl: url })} />
            </div>
          </div>

          {/* Push-notis vid spara — uppmuntrar kunder att öppna appen och
              se popupen. Skickas till alla användare med registrerad
              push-token (RN iOS via APNs, RN Android via Expo). */}
          <div className="surface-muted px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Push-notis vid spara</p>
              <Button
                variant={push.sendPush ? "primary" : "secondary"}
                onClick={() => updatePush({ sendPush: !push.sendPush })}
              >
                {push.sendPush ? "Skicka push" : "Hoppa över push"}
              </Button>
            </div>
            {push.sendPush ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Notis-rubrik">
                  <Input value={push.pushTitle} onChange={(e) => updatePush({ pushTitle: e.target.value })} placeholder={(deal as any).popupHeadline || deal.title} />
                </Field>
                <Field label="Notis-text">
                  <Input value={push.pushBody} onChange={(e) => updatePush({ pushBody: e.target.value })} placeholder="Tryck för att se ditt nya erbjudande →" />
                </Field>
              </div>
            ) : null}
            {pushSent ? (
              <p className="mt-3 text-sm text-emerald-300">{pushSent}</p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </div>

        <PopupPreview deal={deal} overlay={overlay} />
      </div>
    </Modal>
  );
}
