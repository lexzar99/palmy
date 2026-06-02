"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button, Input } from "@/shared/components/ui";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Bildfält som laddar upp till R2 (Cloudflare) som default. Filen
 * konverteras till WebP på servern (sharp) och hamnar på en kanonisk path:
 *   {city}/{restaurant}/hero.webp
 *   {city}/{restaurant}/logo.webp
 *   {city}/{restaurant}/main/{category}.webp
 *   {city}/{restaurant}/menu/{category}/{product}.webp
 *
 * Falls back till POST /admin/upload (Cloudinary) bara om R2 inte är
 * konfigurerat på servern (503). Admin kan också klistra in en URL manuellt
 * — det fältet är kvar och fungerar oberoende.
 *
 * Backend: packages/api/src/routes/upload.ts. Max raw-storlek 15 MB,
 * komprimeras till ~250 KB WebP.
 */
export type ImageUploadKind = 'hero' | 'logo' | 'main-category' | 'product' | 'misc';

export function ImageUploadField({
  value,
  onChange,
  label = "Bild",
  placeholder = "https://...",
  // R2-context. Om allt detta saknas faller upload tillbaka på Cloudinary.
  kind,
  restaurantId,
  categoryId,
  categorySlug,
  productId,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  kind?: ImageUploadKind;
  restaurantId?: string | null;
  // Explicit slug för virtuella kategorier utan DB-rad (t.ex. "Erbjudanden"-tilen).
  categoryId?: string | null;
  categorySlug?: string | null;
  productId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Filen är för stor (max 15 MB raw).");
      return;
    }
    setUploading(true);
    try {
      // misc-bilder (t.ex. sponsorkort) är plattform-nivå och saknar restaurang
      // → tillåt R2 ändå. Övriga kinds kräver restaurang-kontext för path:en.
      const useR2 = Boolean(kind) && (kind === "misc" || Boolean(restaurantId));
      if (useR2) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", kind!);
        if (restaurantId) fd.append("restaurantId", restaurantId);
        if (categoryId) fd.append("categoryId", categoryId);
        if (categorySlug) fd.append("categorySlug", categorySlug);
        if (productId) fd.append("productId", productId);
        try {
          const response = await api.post<{ url: string; key: string }>(
            "/api/admin/upload-r2",
            fd,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          onChange(response.data.url);
          return;
        } catch (err: any) {
          // 503 = R2 inte konfigurerat → fall genom till Cloudinary
          if (err?.response?.status !== 503) {
            setError(err?.response?.data?.error || "R2-uppladdning misslyckades.");
            return;
          }
        }
      }
      // Fallback: Cloudinary
      const fd = new FormData();
      fd.append("file", file);
      const response = await api.post<{ url: string; filename: string }>(
        "/api/admin/upload",
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      onChange(response.data.url);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Uppladdning misslyckades.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Förkorta visning av base64-strängar och långa URLs så modalerna inte
  // fylls med 100k+ tecken text. Cloudinary-URLer är OK att visa direkt.
  const isBase64 = value.startsWith("data:");
  const showShortened = isBase64 || value.length > 80;
  const displayLabel = isBase64 ? "Inline-bild (base64)" : value.length > 80 ? `${value.slice(0, 60)}…${value.slice(-12)}` : value;

  return (
    <div className="grid gap-2">
      <span className="field-label">{label}</span>
      {value ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-20 w-20 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="break-all text-xs text-[var(--text-secondary)]">{displayLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Byt bild
              </Button>
              <Button variant="danger" type="button" onClick={() => onChange("")} disabled={uploading}>
                <Trash2 size={14} /> Ta bort
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {uploading ? "Laddar upp..." : "Ladda upp bild"}
          </Button>
          <span className="text-xs text-[var(--text-secondary)]">eller klistra in URL nedan (max 5 MB)</span>
        </div>
      )}
      {/* URL-fältet visas bara när vi inte har en base64/lång inline-bild,
          så användaren inte tappar bort sig i ett ändlöst textfält. För
          base64 finns Byt/Ta bort-knapparna ovan. */}
      {!showShortened || !value ? (
        <Input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
