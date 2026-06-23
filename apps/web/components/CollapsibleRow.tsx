"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * CollapsibleRow — kollapsad länkrad, samma mönster som kassans
 * CartCollapsibleRow: etikett + valfri ikon + valfri hint till höger,
 * expanderar inline. Default stängd. first=true tar bort topplinjen så
 * flera rader kan staplas hårfint i en rundad box.
 */
export default function CollapsibleRow({
  label,
  hint,
  icon,
  defaultOpen = false,
  first = false,
  children,
}: {
  label: string;
  hint?: string | null;
  icon?: ReactNode;
  defaultOpen?: boolean;
  first?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--border-muted)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {icon}
          <span className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {hint && <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{hint}</span>}
          <ChevronDown size={16} strokeWidth={2} className="transition-transform" style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>
      {open && <div className="pb-3.5">{children}</div>}
    </div>
  );
}
