"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, StickyNote } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/shared/api/client";
import { getStoredAdmin } from "@/shared/auth/storage";
import { Button, Textarea } from "@/shared/components/ui";

/**
 * Delade support-anteckningar, inbäddade i befintliga vyer. Polymorf: ange EN av
 * restaurantId/orderId/customerPhone. Super-admin-only (renderar null annars).
 * Backend: packages/api/src/routes/admin.ts (/api/admin/notes).
 */
export interface NoteRecord {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  restaurantId?: string | null;
  orderId?: string | null;
  customerPhone?: string | null;
}

type Target =
  | { restaurantId: string }
  | { orderId: string }
  | { customerPhone: string };

const targetQuery = (t: Target) => new URLSearchParams(t as Record<string, string>).toString();

export function NotesPanel({ target, title = "Anteckningar" }: { target: Target; title?: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const isSuperAdmin = getStoredAdmin()?.role === "SUPER_ADMIN";

  const qs = targetQuery(target);
  const key = ["notes", qs] as const;

  const notes = useQuery({
    queryKey: key,
    queryFn: () => apiGet<NoteRecord[]>(`/admin/notes?${qs}`),
    enabled: isSuperAdmin,
  });

  const add = useMutation({
    mutationFn: (body: string) => apiPost<NoteRecord>("/admin/notes", { ...target, body }),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/notes/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  // Anteckningar är en super-admin/support-funktion. Merchant-vyer döljer panelen.
  if (!isSuperAdmin) return null;

  const list = notes.data || [];

  return (
    <div className="grid gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-secondary)]">
        <StickyNote size={14} /> {title}
        {list.length > 0 ? <span className="text-[var(--text-muted)]">({list.length})</span> : null}
      </div>

      <div className="grid gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Skriv en anteckning…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            type="button"
            disabled={!draft.trim() || add.isPending}
            onClick={() => add.mutate(draft.trim())}
          >
            {add.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Lägg till
          </Button>
        </div>
      </div>

      {notes.isLoading ? (
        <p className="text-xs text-[var(--text-muted)]">Laddar…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Inga anteckningar än.</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((note) => (
            <li key={note.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2">
              <p className="whitespace-pre-wrap break-words text-[13px] text-[var(--text-primary)]">{note.body}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>{note.authorName} · {new Date(note.createdAt).toLocaleString("sv-SE")}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-rose-400"
                  onClick={() => remove.mutate(note.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
