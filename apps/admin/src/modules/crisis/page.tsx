"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, BellOff, Ban, DollarSign, Loader2, Megaphone, Pause, Play, Power, RotateCcw, Timer, MapPin } from "lucide-react";
import { Button, Field, Input, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import {
  bulkRefundRestaurant,
  deactivateRestaurant,
  emergencyCloseAll,
  emergencyOpenAll,
  getCrisisState,
  getPlatformBanner,
  pauseCity,
  pausePlatform,
  unpauseCity,
  unpausePlatform,
  updatePlatformBanner,
} from "@/modules/crisis/api";
import { getDealRestaurants } from "@/modules/deals/api";

export function CrisisPage() {
  const queryClient = useQueryClient();
  const [closeReason, setCloseReason] = useState("");
  const [bannerMsg, setBannerMsg] = useState("");
  const [bannerSev, setBannerSev] = useState<"info" | "warning" | "critical">("info");
  const [bannerUntil, setBannerUntil] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const banner = useQuery({ queryKey: ["platform-banner"], queryFn: getPlatformBanner });

  useEffect(() => {
    if (banner.data && !hydrated) {
      setBannerMsg((banner.data as { bannerMessage?: string }).bannerMessage || "");
      const sev = (banner.data as { bannerSeverity?: string }).bannerSeverity;
      if (sev === "info" || sev === "warning" || sev === "critical") setBannerSev(sev);
      const expires = (banner.data as { bannerExpiresAt?: string }).bannerExpiresAt;
      if (expires) setBannerUntil(expires.slice(0, 16)); // YYYY-MM-DDTHH:MM
      setHydrated(true);
    }
  }, [banner.data, hydrated]);

  const closeAll = useMutation({
    mutationFn: () => emergencyCloseAll(closeReason || "Manuell kris-stängning"),
    onSuccess: (data) => {
      alert(`✅ ${data.closedCount} restauranger stängdes.`);
      setCloseReason("");
    },
  });

  const openAll = useMutation({
    mutationFn: emergencyOpenAll,
    onSuccess: (data) => {
      alert(`✅ ${data.openedCount} restauranger öppnades igen.`);
    },
  });

  const saveBanner = useMutation({
    mutationFn: () => updatePlatformBanner({
      bannerMessage: bannerMsg || null,
      bannerSeverity: bannerMsg ? bannerSev : null,
      bannerExpiresAt: bannerUntil || null,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-banner"] });
      alert("✅ Banner uppdaterad");
    },
  });

  const clearBanner = useMutation({
    mutationFn: () => updatePlatformBanner({ bannerMessage: null, bannerSeverity: null, bannerExpiresAt: null }),
    onSuccess: () => {
      setBannerMsg("");
      setBannerUntil("");
      void queryClient.invalidateQueries({ queryKey: ["platform-banner"] });
    },
  });

  return (
    <div className="page-stack">
      <PageHeader title="Krisverktyg" />

      <Surface className="px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-rose-500/10 border border-rose-500/30">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-tight">Verktyg för platsstörningar</h2>
          </div>
        </div>
      </Surface>

      {/* Emergency Close All */}
      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Power size={18} className="text-rose-500" />
          <h2 className="text-base font-black uppercase tracking-tight">Stäng ALLA restauranger</h2>
        </div>
        <Field label="Anledning (loggas)">
          <Input value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="t.ex. Misstänkt matförgiftnings-utbrott" />
        </Field>
        <div className="flex gap-3 mt-4">
          <Button
            variant="danger"
            onClick={() => {
              if (!closeReason.trim()) { alert("Ange anledning först."); return; }
              const ok = window.confirm(`🚨 STÄNG ALLA RESTAURANGER NU?\n\nAnledning: ${closeReason}\n\nKan inte ångras automatiskt — du måste klicka "Återöppna alla" sen.`);
              if (ok) closeAll.mutate();
            }}
            disabled={closeAll.isPending}
          >
            {closeAll.isPending ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
            STÄNG ALLA NU
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm("Återöppna alla stängda restauranger?")) openAll.mutate();
            }}
            disabled={openAll.isPending}
          >
            {openAll.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Återöppna alla
          </Button>
        </div>
      </Surface>

      {/* Platform Banner */}
      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Megaphone size={18} className="text-amber-500" />
          <h2 className="text-base font-black uppercase tracking-tight">Plattform-banner</h2>
        </div>
        <div className="grid gap-4">
          <Field label="Meddelande (tom = ingen banner)">
            <Textarea
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              placeholder="Underhåll pågår 13:00–14:00. Beställningar kan dröja."
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Allvarlighetsgrad">
              <Select value={bannerSev} onChange={(e) => setBannerSev(e.target.value as any)}>
                <option value="info">Info (blå)</option>
                <option value="warning">Varning (gul)</option>
                <option value="critical">Kritisk (röd)</option>
              </Select>
            </Field>
            <Field label="Auto-rensa (valfritt)">
              <Input type="datetime-local" value={bannerUntil} onChange={(e) => setBannerUntil(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="primary" onClick={() => saveBanner.mutate()} disabled={saveBanner.isPending}>
            {saveBanner.isPending ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            Publicera
          </Button>
          {bannerMsg && (
            <Button variant="secondary" onClick={() => clearBanner.mutate()} disabled={clearBanner.isPending}>
              <BellOff size={14} /> Ta bort
            </Button>
          )}
        </div>
      </Surface>

      <PlatformPauseControls />
      <CityPauseControls />
      <PerRestaurantCrisis />
    </div>
  );
}

// A11 — Pause the entire platform for X minutes (auto-resumes).
// Use case: payment provider outage, infra incident. Less destructive than
// emergency-close-all because (a) it auto-recovers, (b) restaurants stay open
// once the pause lifts (no need to manually re-open everyone).
function PlatformPauseControls() {
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: ["crisis-state"], queryFn: getCrisisState, refetchInterval: 30_000 });
  const [minutes, setMinutes] = useState<number>(15);
  const [reason, setReason] = useState("");

  const pauseMut = useMutation({
    mutationFn: () => pausePlatform(minutes, reason || undefined),
    onSuccess: (data) => {
      alert(`✅ Plattformen pausad till ${new Date(data.until).toLocaleString("sv-SE")}.`);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["crisis-state"] });
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Pause misslyckades"}`),
  });
  const unpauseMut = useMutation({
    mutationFn: unpausePlatform,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crisis-state"] });
    },
  });

  const paused = state.data?.platformPaused ?? null;

  return (
    <Surface className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Pause size={18} className="text-amber-500" />
        <h2 className="text-base font-black uppercase tracking-tight">Pausa plattformen</h2>
      </div>
      {paused ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
          <div className="flex items-start gap-2 text-sm">
            <Timer size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Plattformen är pausad till {new Date(paused.until).toLocaleString("sv-SE")}</div>
              {paused.reason && <div className="text-xs text-amber-200/80 mt-1">{paused.reason}</div>}
            </div>
          </div>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => unpauseMut.mutate()}
            disabled={unpauseMut.isPending}
          >
            {unpauseMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Lyft pausen nu
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Tid (minuter, 1-360)">
              <Input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Math.min(360, Number(e.target.value) || 1)))}
                min={1}
                max={360}
              />
            </Field>
            <Field label="Anledning (loggas)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stripe outage" />
            </Field>
          </div>
          <Button
            variant="danger"
            className="mt-4"
            onClick={() => {
              if (!window.confirm(`Pausa plattformen i ${minutes} min?\n\nIngen ny order kan skapas under denna tid. Anledning: ${reason || "(ingen)"}.`)) return;
              pauseMut.mutate();
            }}
            disabled={pauseMut.isPending}
          >
            {pauseMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
            Pausa nu
          </Button>
        </>
      )}
    </Surface>
  );
}

// A11 — Close all restaurants in a single city without taking down the whole platform.
function CityPauseControls() {
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: ["crisis-state"], queryFn: getCrisisState });
  const [cityId, setCityId] = useState("");
  const [reason, setReason] = useState("");

  const pauseMut = useMutation({
    mutationFn: () => pauseCity({ cityId, reason: reason || undefined }),
    onSuccess: (data) => {
      alert(`✅ ${data.closedCount} restauranger i staden stängdes.`);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["crisis-state"] });
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Stadspaus misslyckades"}`),
  });
  const unpauseMut = useMutation({
    mutationFn: () => unpauseCity({ cityId }),
    onSuccess: (data) => {
      alert(`✅ ${data.openedCount} restauranger i staden återöppnades.`);
      void queryClient.invalidateQueries({ queryKey: ["crisis-state"] });
    },
  });

  return (
    <Surface className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <MapPin size={18} className="text-rose-500" />
        <h2 className="text-base font-black uppercase tracking-tight">Pausa en stad</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Välj stad">
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">— Välj —</option>
            {(state.data?.cities ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (inaktiv)"}</option>
            ))}
          </Select>
        </Field>
        <Field label="Anledning (loggas)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Snöstorm — leverans stoppad" />
        </Field>
      </div>
      <div className="flex gap-3 mt-4">
        <Button
          variant="danger"
          disabled={!cityId || pauseMut.isPending}
          onClick={() => {
            if (!cityId) { alert("Välj stad först."); return; }
            if (!window.confirm("Stäng alla restauranger i vald stad?")) return;
            pauseMut.mutate();
          }}
        >
          {pauseMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
          Stäng stad
        </Button>
        <Button
          variant="secondary"
          disabled={!cityId || unpauseMut.isPending}
          onClick={() => {
            if (!cityId) return;
            if (!window.confirm("Återöppna alla restauranger i vald stad?")) return;
            unpauseMut.mutate();
          }}
        >
          {unpauseMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Återöppna stad
        </Button>
      </div>
    </Surface>
  );
}

// Bulk-refund + akut deactivate för en vald restaurang
function PerRestaurantCrisis() {
  const restaurants = useQuery({ queryKey: ["restaurants-for-crisis"], queryFn: getDealRestaurants });
  const [selectedId, setSelectedId] = useState("");
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundReason, setRefundReason] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");

  const refundMut = useMutation({
    mutationFn: () => bulkRefundRestaurant(selectedId, { fromDate, toDate, reason: refundReason }),
    onSuccess: (data) => {
      alert(`✅ Bulk-refund klar.\n\nRefunderat: ${data.summary.refunded}\nSkippade: ${data.summary.skipped}\nFailade: ${data.summary.failed}\nTotalt: ${data.summary.total}`);
      setRefundReason("");
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Bulk-refund misslyckades"}`),
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateRestaurant(selectedId, deactivateReason),
    onSuccess: (data) => {
      // Datadumpen kommer i response — visa download
      const blob = new Blob([JSON.stringify(data.datadump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `restaurant-${selectedId}-datadump-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDeactivateReason("");
      alert("✅ Restaurang deaktiverad. Datadump nedladdad.");
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Deactivation misslyckades"}`),
  });

  return (
    <Surface className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Ban size={18} className="text-rose-500" />
        <h2 className="text-base font-black uppercase tracking-tight">Per-restaurang krisåtgärder</h2>
      </div>

      <Field label="Välj restaurang">
        <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={restaurants.isLoading}>
          <option value="">— Välj —</option>
          {(restaurants.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </Field>

      {selectedId && (
        <>
          {/* Bulk-refund */}
          <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--border-muted)" }}>
            <div className="flex items-center gap-3 mb-3">
              <DollarSign size={16} className="text-amber-500" />
              <h3 className="text-sm font-black uppercase tracking-tight">Bulk-refund alla orders</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Från">
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate} />
              </Field>
              <Field label="Till">
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} />
              </Field>
            </div>
            <Field label="Anledning (loggas + visas i Stripe)">
              <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Kvalitetsproblem 2026-05-11" />
            </Field>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => {
                if (!refundReason.trim()) { alert("Anledning krävs."); return; }
                const ok = window.confirm(`Refundera ALLA orders ${fromDate} → ${toDate}?\n\nAnledning: ${refundReason}\n\nKan inte ångras. Stripe-refunder skickas omedelbart.`);
                if (ok) refundMut.mutate();
              }}
              disabled={refundMut.isPending}
            >
              {refundMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
              Bulk-refund nu
            </Button>
          </div>

          {/* Deactivate */}
          <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--border-muted)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Ban size={16} className="text-rose-500" />
              <h3 className="text-sm font-black uppercase tracking-tight">Akut deaktivera restaurang</h3>
            </div>
            <Field label="Anledning (loggas)">
              <Input value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} placeholder="Avtalsbrott, ej betalat 3 månader" />
            </Field>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => {
                if (!deactivateReason.trim()) { alert("Anledning krävs."); return; }
                const ok = window.confirm(`DEAKTIVERA restaurangen permanent?\n\nAnledning: ${deactivateReason}\n\nAlla aktiva deals stängs av. JSON-datadump laddas ner.`);
                if (ok) deactivateMut.mutate();
              }}
              disabled={deactivateMut.isPending}
            >
              {deactivateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Deaktivera + ladda ner datadump
            </Button>
          </div>
        </>
      )}
    </Surface>
  );
}
