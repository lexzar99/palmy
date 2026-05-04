"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button, Input } from "@/shared/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Bildfält som låter admin antingen ladda upp en bild från enheten
 * (POST /api/admin/upload → Cloudinary, returnerar URL) eller klistra in
 * en URL manuellt. Fungerar för alla bildfält i panelen — hero, profil,
 * sponsor, restaurang etc.
 *
 * Backend: packages/api/src/routes/upload.ts. Maxstorlek 5 MB,
 * format jpg/jpeg/png/gif/webp (validering på server). Vi gör en
 * snabb klient-side check för storlek så användaren får direkt feedback.
 */
export function ImageUploadField({
  value,
  onChange,
  label = "Bild",
  placeholder = "https://...",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Filen är för stor (max 5 MB).");
      return;
    }
    setUploading(true);
    try {
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
