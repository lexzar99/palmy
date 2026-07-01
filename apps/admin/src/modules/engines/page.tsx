"use client";

// Motorn: de autonoma hemskärmsmodulerna. Varje motor kan slås på/av och
// justeras, och allt de gör loggas här. Inget händer i appen som inte syns.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPatch } from "@/shared/api/client";
import { Button, EmptyState, ErrorPanel, PageHeader, Surface, Toggle } from "@/shared/components/ui";
import { cn } from "@/shared/utils/cn";

interface EngineRecord {
  key: string;
  title: string;
  description: string;
  paramLabels: Record<string, string>;
  enabled: boolean;
  params: Record<string, number>;
}

interface EngineEventRecord {
  id: string;
  engine: string;
  message: string;
  createdAt: string;
}

const enginesKey = ["engines"] as const;
const engineEventsKey = ["engines", "events"] as const;

export function EnginesPage() {
  const qc = useQueryClient();
  const engines = useQuery({
    queryKey: enginesKey,
    queryFn: () => apiGet<{ engines: EngineRecord[] }>("/admin/engines"),
  });
  const events = useQuery({
    queryKey: engineEventsKey,
    queryFn: () => apiGet<{ events: EngineEventRecord[] }>("/admin/engines/events?limit=60"),
  });
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});

  const patchMutation = useMutation({
    mutationFn: ({ key, body }: { key: string; body: { enabled?: boolean; params?: Record<string, number> } }) =>
      apiPatch(`/admin/engines/${key}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: enginesKey });
      void qc.invalidateQueries({ queryKey: engineEventsKey });
    },
  });

  if (engines.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Plattform" title="Motorn" />
        <Surface className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar motorerna...</Surface>
      </div>
    );
  }
  if (engines.isError || !engines.data) {
    return <ErrorPanel title="Kunde inte ladda motorerna" action={<Button onClick={() => void engines.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;
  }

  const titleByKey = new Map(engines.data.engines.map((e) => [e.key, e.title]));

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Plattform"
        title="Motorn"
        actions={<Button variant="secondary" onClick={() => { void engines.refetch(); void events.refetch(); }} aria-label="Uppdatera"><RefreshCw size={14} /></Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {engines.data.engines.map((engine) => {
          const draft = drafts[engine.key];
          const dirty = draft && Object.keys(draft).some((k) => draft[k] !== engine.params[k]);
          return (
            <Surface key={engine.key} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] font-extrabold">{engine.title}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{engine.description}</p>
                </div>
                <Toggle
                  checked={engine.enabled}
                  onChange={(next) => patchMutation.mutate({ key: engine.key, body: { enabled: next } })}
                />
              </div>

              {Object.keys(engine.paramLabels).length > 0 && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {Object.entries(engine.paramLabels).map(([param, label]) => (
                    <label key={param} className="flex flex-col gap-1 text-[11px] font-bold text-[var(--text-muted)]">
                      {label}
                      <input
                        type="number"
                        className="h-9 w-28 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 text-[13px] font-semibold"
                        value={draft?.[param] ?? engine.params[param] ?? 0}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [engine.key]: { ...engine.params, ...prev[engine.key], [param]: Number(e.target.value) },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <Button
                    variant="secondary"
                    disabled={!dirty || patchMutation.isPending}
                    onClick={() => {
                      patchMutation.mutate({ key: engine.key, body: { params: drafts[engine.key] } });
                      setDrafts((prev) => { const next = { ...prev }; delete next[engine.key]; return next; });
                    }}
                  >
                    Spara
                  </Button>
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="text-[13px] font-extrabold">Händelser</div>
          <div className="text-[11.5px] text-[var(--text-muted)]">Allt motorerna gör loggas här</div>
        </div>
        {events.isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--text-secondary)]">Laddar...</div>
        ) : (events.data?.events || []).length === 0 ? (
          <div className="p-6"><EmptyState title="Inga händelser än" description="Motorerna loggar här när de agerar." /></div>
        ) : (
          (events.data?.events || []).map((event, i, arr) => (
            <div key={event.id} className={cn("flex items-center justify-between gap-3 px-5 py-3 text-[12.5px]", i !== arr.length - 1 && "border-b border-[var(--row-divider)]")}>
              <span className="min-w-0 truncate">
                <span className="font-bold">{titleByKey.get(event.engine) || event.engine}</span>
                <span className="text-[var(--text-secondary)]"> · {event.message}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleString("sv-SE")}</span>
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}
