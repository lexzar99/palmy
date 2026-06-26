"use client";

import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("surface", className)}>{children}</section>;
}

export function PageHeader({
  title,
  breadcrumb,
  onBack,
  actions,
}: {
  title: string;
  /** Optional breadcrumb shown above the title, e.g. "Restauranger / Pizzeria Roma". */
  breadcrumb?: React.ReactNode;
  /** When set, renders a back-arrow button to the left of the title. */
  onBack?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button type="button" className="page-back" onClick={onBack} aria-label="Tillbaka">
            <ChevronLeft size={18} />
          </button>
        ) : null}
        <div>
          {breadcrumb ? <div className="page-breadcrumb">{breadcrumb}</div> : null}
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="section-title">{title}</h1>
        {description ? <p className="section-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  sparkline,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** Optional decorative SVG (sparkline) shown to the right of the value. */
  sparkline?: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <p className="kpi-label">{label}</p>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <p className="kpi-value">{value}</p>
        {sparkline ? <div className="shrink-0">{sparkline}</div> : null}
      </div>
      {detail ? <div className="mt-1.5 text-[12px] font-medium text-[var(--text-secondary)]">{detail}</div> : null}
    </article>
  );
}

/** Small orange/green sparkline for KPI cards. `tone` picks the stroke colour. */
export function Sparkline({ points, tone = "accent" }: { points: string; tone?: "accent" | "success" }) {
  return (
    <svg width="64" height="30" viewBox="0 0 64 30" fill="none" aria-hidden>
      <polyline
        points={points}
        stroke={tone === "success" ? "var(--success)" : "var(--accent)"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Button({
  variant = "secondary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      className={cn(
        variant === "primary" ? "button-primary" : variant === "danger" ? "button-danger" : "button-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("icon-button", props.className)} {...props} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "danger" | "warning" | "info"; children: React.ReactNode }) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === "number" && props.onChange) {
    const originalOnChange = props.onChange;
    const wrappedOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v.length > 1 && v[0] === "0" && v[1] !== "." && v[1] !== ",") {
        const stripped = v.replace(/^0+/, "") || "0";
        e.target.value = stripped;
      }
      originalOnChange(e);
    };
    return <input className={cn("input", props.className)} {...props} onChange={wrappedOnChange} />;
  }
  return <input className={cn("input", props.className)} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("select", props.className)} {...props} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("textarea", props.className)} {...props} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="surface-muted px-6 py-14 text-center">
      <h3 className="text-xl font-semibold tracking-[-0.025em]">{title}</h3>
      {description ? <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function LoadingPanel({ label = "Laddar..." }: { label?: string }) {
  return (
    <div className="surface flex min-h-[260px] items-center justify-center px-6 py-12 text-sm font-medium text-[var(--text-secondary)]">
      {label}
    </div>
  );
}

export function ErrorPanel({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="surface flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h3 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
      {description ? <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  widthClassName,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  widthClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={cn("modal-panel", widthClassName)}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] px-7 py-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
            {description ? <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
        <div className="px-7 py-7">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] px-7 py-5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--accent)]" : "bg-[#d8d8d4]",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform",
          checked ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  scroll,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  return (
    <div className={cn("flex gap-2", scroll ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-lg border px-4 py-2.5 text-[13px] font-semibold tracking-[-0.005em] transition-colors",
            value === option.value
              ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
