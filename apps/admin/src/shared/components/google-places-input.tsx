"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { MapPin, Check, Loader2 } from "lucide-react";

/**
 * GooglePlacesInput — adress-input med Google Places autocomplete via vårt
 * backend-proxy på /api/places (samma som RN/web använder; nycklar stannar
 * server-side).
 *
 * Vid val av förslag hämtas place-details (lat/lng + postnummer + ort) och
 * resultatet skickas tillbaka via onSelect så caller kan auto-fylla alla
 * relaterade fält på en gång.
 *
 * Designad för att matcha admin-temat (mörk surface + accent-gold) och
 * fungera som drop-in-replacement för en vanlig `<Input>` med samma value.
 */

export interface PlaceSelection {
  address: string;     // Full formatted address (description från autocomplete)
  placeId: string;
  lat: number;
  lng: number;
  postalCode?: string;
  city?: string;
}

interface Props extends Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "disabled" | "required" | "autoComplete" | "aria-invalid" | "aria-describedby" | "aria-required"
> {
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: PlaceSelection) => void;
  placeholder?: string;
  /** Aktuell place_id om redan satt — visar bekräftelse-bock. */
  currentPlaceId?: string | null;
}

type Prediction = { description: string; place_id: string };

// Stable session-token per komponent-instans → Google fakturerar autocomplete
// + details som ett "session" istället för separata calls. Slipper omgenerera
// vid varje render.
function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function GooglePlacesInput({
  value,
  onChange,
  onSelect,
  placeholder,
  currentPlaceId,
  id,
  name,
  disabled,
  required,
  autoComplete,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stäng dropdown vid klick utanför
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const fetchPredictions = (input: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      if (input.trim().length < 3) {
        setPredictions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, sessiontoken: sessionTokenRef.current }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta förslag");
          setPredictions([]);
          return;
        }
        setPredictions(data.predictions || []);
        setActiveIndex(-1);
        setOpen((data.predictions || []).length > 0);
      } catch {
        setError("Nätverksfel");
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 220);
  };

  const handleSelect = async (prediction: Prediction) => {
    setOpen(false);
    setActiveIndex(-1);
    setResolving(true);
    setError(null);
    onChange(prediction.description);
    try {
      const response = await fetch("/api/places/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: prediction.place_id, sessiontoken: sessionTokenRef.current }),
      });
      const data = await response.json();
      if (!response.ok || !data.location) {
        setError(data.error || "Kunde inte hämta koordinater");
        return;
      }
      onSelect({
        address: prediction.description,
        placeId: prediction.place_id,
        lat: data.location.lat,
        lng: data.location.lng,
        postalCode: data.postalCode,
        city: data.city,
      });
      // Ny session-token efter committed val → Google rekommendation
      sessionTokenRef.current = generateSessionToken();
    } catch {
      setError("Kunde inte hämta koordinater");
    } finally {
      setResolving(false);
    }
  };

  const showCheck = Boolean(currentPlaceId) && !resolving;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
            fetchPredictions(v);
          }}
          onFocus={() => {
            if (predictions.length > 0 && value.trim().length >= 3) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (!open || predictions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(predictions.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              void handleSelect(predictions[activeIndex]);
            }
          }}
          placeholder={placeholder || "Sök adress…"}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] py-2.5 pl-9 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {resolving || loading ? (
            <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
          ) : showCheck ? (
            <Check size={14} className="text-emerald-500" />
          ) : null}
        </div>
      </div>

      {error && (
        <p className="mt-1.5 text-[11px] font-semibold text-rose-400">{error}</p>
      )}

      {open && predictions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-72 overflow-y-auto rounded-xl border shadow-2xl py-1"
          style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
        >
          {predictions.map((p, index) => (
            <button
              key={p.place_id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(p)}
              className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors hover:bg-[rgba(231,178,75,0.08)]"
            >
              <MapPin size={13} className="text-[rgba(231,178,75,0.6)] mt-0.5 shrink-0" />
              <span className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                {p.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
