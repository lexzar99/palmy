"use client";

import { X } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("surface", className)}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1 className="section-title mt-3">{title}</h1>
        {description ? <p className="section-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <article className="metric-card">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{value}</p>
      {detail ? <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{detail}</div> : null}
    </article>
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
    <div className="surface-muted px-6 py-12 text-center">
      <h3 className="text-xl font-black tracking-[-0.03em]">{title}</h3>
      {description ? <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function LoadingPanel({ label = "Laddar..." }: { label?: string }) {
  return (
    <div className="surface flex min-h-[260px] items-center justify-center px-6 py-12 text-sm font-semibold text-[var(--text-secondary)]">
      {label}
    </div>
  );
}

export function ErrorPanel({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="surface flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h3 className="text-2xl font-black tracking-[-0.03em]">{title}</h3>
      {description ? <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{description}</p> : null}
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
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[rgba(17,21,29,0.94)] px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.04em]">{title}</h2>
            {description ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[rgba(17,21,29,0.96)] px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em]",
            value === option.value
              ? "border-[rgba(243,191,87,0.28)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]"
              : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
