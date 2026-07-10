"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/components/ui";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Bildfält som ALLTID laddar upp till R2 (Cloudflare). Filen konverteras till
 * WebP på servern (sharp) och hamnar på en kanonisk path:
 *   {city}/{restaurant}/hero.webp
 *   {city}/{restaurant}/logo.webp
 *   {city}/{restaurant}/category/{category}.webp
 *   {city}/{restaurant}/menu/{category}/{product}.webp
 *   global/misc/{filnamn}-{ts}.webp   ← plattform-bilder (deals, sponsorer, hero)
 *
 * Cloudinary är borttaget. Saknar ett anropsställe `kind` defaultar vi till
 * "misc" så bilden ändå hamnar i R2 (aldrig Cloudinary). Tekniska URL:er
 * exponeras inte i admin; användaren arbetar enbart med preview och upload.
 *
 * Backend: packages/api/src/routes/upload.ts (POST /api/admin/upload-r2).
 * Max raw-storlek 15 MB, komprimeras till ~250 KB WebP.
 */
export type ImageUploadKind = 'hero' | 'logo' | 'category' | 'product' | 'extra' | 'misc';

export function ImageUploadField({
  value,
  onChange,
  label = "Bild",
  // R2-context. Saknas `kind` defaultar uppladdningen till "misc" (R2).
  kind,
  restaurantId,
  categoryId,
  categorySlug,
  productId,
  fileBaseName,
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
  // Basnamn för filen i R2-path:en (t.ex. tillvalsnamnet för kind="extra").
  fileBaseName?: string;
  // Behålls för bakåtkompatibilitet. URL-fält visas aldrig i admin längre.
  uploadOnly?: boolean;
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
      // Allt går till R2. Saknas `kind` (vissa plattform-fält) → "misc", som
      // är restaurang-löst och hamnar i global/misc/. Övriga kinds bär
      // restaurang-kontext för den kanoniska path:en.
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind || "misc");
      if (restaurantId) fd.append("restaurantId", restaurantId);
      if (categoryId) fd.append("categoryId", categoryId);
      if (categorySlug) fd.append("categorySlug", categorySlug);
      if (productId) fd.append("productId", productId);
      if (fileBaseName) fd.append("fileBaseName", fileBaseName);
      const response = await api.post<{ url: string; key: string }>(
        "/api/admin/upload-r2",
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

  const isHero = kind === "hero";

  return (
    <div className="grid gap-2.5">
      <span className="field-label">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className={isHero ? "h-20 w-32 shrink-0 rounded-[8px] object-cover" : "h-16 w-16 shrink-0 rounded-[8px] object-cover"} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" className="h-9 min-h-9 px-3 text-xs" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Byt bild
              </Button>
              <Button variant="danger" className="h-9 min-h-9 px-3 text-xs" type="button" onClick={() => onChange("")} disabled={uploading}>
                <Trash2 size={14} /> Ta bort
              </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-20 items-center justify-center rounded-[10px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-panel-soft)] p-3">
          <Button variant="secondary" className="h-9 min-h-9 px-3 text-xs" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {uploading ? "Laddar upp..." : "Ladda upp bild"}
          </Button>
        </div>
      )}
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
