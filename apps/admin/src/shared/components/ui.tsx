"use client";

import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
} from "react";
import { ChevronLeft, Loader2, X } from "lucide-react";
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
      <div className="flex min-w-0 items-center gap-3">
        {onBack ? (
          <button type="button" className="page-back" onClick={onBack} aria-label="Tillbaka">
            <ChevronLeft size={18} />
          </button>
        ) : null}
        <div className="min-w-0">
          {breadcrumb ? <div className="page-breadcrumb max-w-full break-words">{breadcrumb}</div> : null}
          <h1 className="page-title break-words">{title}</h1>
        </div>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
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
  loading = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        variant === "primary" ? "button-primary" : variant === "danger" ? "button-danger" : "button-secondary",
        className,
      )}
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
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

type FieldControlAttributes = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
};

function attachFirstFieldControl(
  node: React.ReactNode,
  attributes: FieldControlAttributes,
): { node: React.ReactNode; attached: boolean } {
  if (!isValidElement(node)) return { node, attached: false };

  const nodeProps = node.props as Record<string, unknown>;
  const isNativeControl = typeof node.type === "string" && ["input", "select", "textarea"].includes(node.type);
  const isCustomControl = typeof node.type !== "string"
    && node.type !== Fragment
    && ["value", "defaultValue", "checked", "defaultChecked", "onChange", "onValueChange", "placeholder", "inputMode"]
      .some((prop) => prop in nodeProps);
  if (isNativeControl || isCustomControl) {
    return {
      node: cloneElement(node as React.ReactElement<Record<string, unknown>>, {
        ...attributes,
        id: nodeProps.id ?? attributes.id,
      }),
      attached: true,
    };
  }

  let attached = false;
  const nestedChildren = Children.map((node.props as { children?: React.ReactNode }).children, (child) => {
    if (attached) return child;
    const result = attachFirstFieldControl(child, attributes);
    attached = result.attached;
    return result.node;
  });

  return {
    node: attached
      ? cloneElement(node as React.ReactElement<{ children?: React.ReactNode }>, undefined, nestedChildren)
      : node,
    attached,
  };
}

export function Field({
  label,
  children,
  hint,
  error,
  required,
  optional,
  className,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = attachFirstFieldControl(children, {
    id: controlId,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  }).node;

  return (
    <div className={cn("field", Boolean(error) && "field-error", className)}>
      <label className="field-label" htmlFor={controlId}>
        {label}
        {required ? <span className="field-required" aria-hidden> *</span> : null}
        {optional ? <span className="field-optional">Valfritt</span> : null}
      </label>
      {hint ? <p id={hintId} className="field-hint">{hint}</p> : null}
      {control}
      {error ? <p id={errorId} className="field-message" role="alert">{error}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  const { className, ...rest } = props;
  return <input {...rest} ref={ref} className={cn("input", className)} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  const { className, ...rest } = props;
  return <select {...rest} ref={ref} className={cn("select", className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  const { className, ...rest } = props;
  return <textarea {...rest} ref={ref} className={cn("textarea", className)} />;
});

export function FieldGroup({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={cn("field", "field-group", Boolean(error) && "field-error", className)} aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="field-label">
        {label}{required ? <span className="field-required" aria-hidden> *</span> : null}
      </legend>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      {children}
      {error ? <p className="field-message" role="alert">{error}</p> : null}
    </fieldset>
  );
}

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "inputMode"> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
  suffix?: React.ReactNode;
  integer?: boolean;
  wrapperClassName?: string;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, suffix, integer = false, className, wrapperClassName, min, max, step, onBlur, onKeyDown, ...props },
  ref,
) {
  const numericValue = Number(String(value ?? "").replace(",", "."));
  const hasNumericValue = String(value ?? "").trim() !== "" && Number.isFinite(numericValue);
  const minValue = min === undefined ? Number.NEGATIVE_INFINITY : Number(min);
  const maxValue = max === undefined ? Number.POSITIVE_INFINITY : Number(max);

  const normalizeOnBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value.trim();
    if (rawValue) {
      const parsed = Number(rawValue.replace(",", "."));
      if (Number.isFinite(parsed)) {
        const normalized = Math.min(maxValue, Math.max(minValue, integer ? Math.round(parsed) : parsed));
        const nextValue = String(normalized);
        if (nextValue !== rawValue) onValueChange(nextValue);
      }
    }
    onBlur?.(event);
  };

  const changeWithKeyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const stepValue = Number(step ?? 1);
    const delta = Number.isFinite(stepValue) && stepValue > 0 ? stepValue : 1;
    const fallback = Number.isFinite(minValue) ? minValue : 0;
    const nextRaw = (hasNumericValue ? numericValue : fallback) + (event.key === "ArrowUp" ? delta : -delta);
    const nextValue = Math.min(maxValue, Math.max(minValue, integer ? Math.round(nextRaw) : nextRaw));
    onValueChange(String(Number(nextValue.toFixed(10))));
  };

  return (
    <div className={cn("input-shell", wrapperClassName)}>
      <input
        ref={ref}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        role="spinbutton"
        className={cn("input", Boolean(suffix) && "has-suffix", className)}
        value={value ?? ""}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={normalizeOnBlur}
        onKeyDown={changeWithKeyboard}
        aria-valuenow={hasNumericValue ? numericValue : undefined}
        aria-valuemin={min === undefined ? undefined : Number(min)}
        aria-valuemax={max === undefined ? undefined : Number(max)}
        {...props}
      />
      {suffix ? <span className="input-suffix" aria-hidden>{suffix}</span> : null}
    </div>
  );
});

export function IntegerInput(props: Omit<NumberInputProps, "integer">) {
  return <NumberInput {...props} integer />;
}

export function MoneyInput({ currency = "kr", ...props }: Omit<NumberInputProps, "suffix"> & { currency?: string }) {
  return <NumberInput {...props} suffix={currency} />;
}

export function PercentInput(props: Omit<NumberInputProps, "suffix">) {
  return <NumberInput {...props} suffix="%" />;
}

export function DurationInput({ unit = "min", ...props }: Omit<NumberInputProps, "suffix"> & { unit?: "min" | "h" }) {
  return <NumberInput {...props} suffix={unit} />;
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
  size = "md",
  closeOnBackdrop = false,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  widthClassName?: string;
  size?: "sm" | "md" | "lg" | "xl" | "fullscreen";
  closeOnBackdrop?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (activeElement === panelRef.current || !panelRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn("modal-panel", `modal-${size}`, widthClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] px-7 py-6">
          <div>
            <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
            {description ? <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body px-7 py-7">{children}</div>
        {footer ? <div className="modal-footer sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] px-7 py-5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Bekräfta",
  cancelLabel = "Avbryt",
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button type="button" variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      }
    >
      <div className={cn("confirm-dialog-mark", danger && "is-danger")} aria-hidden>!</div>
    </Modal>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  id,
  name,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      id={id}
      name={name}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "switch-control relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--accent)]" : "bg-[#d8d8d4]",
        className,
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

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("choice-field", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="choice-label">{label}</label>
        {hint ? <p id={hintId} className="field-hint">{hint}</p> : null}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
  name,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <label className={cn("checkbox-field", className)} htmlFor={id}>
      <input
        id={id}
        name={name}
        type="checkbox"
        className="checkbox-control"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-describedby={hintId}
      />
      <span className="min-w-0">
        <span className="choice-label">{label}</span>
        {hint ? <span id={hintId} className="field-hint block">{hint}</span> : null}
      </span>
    </label>
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
    <div className={cn("flex gap-2", scroll ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap")} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
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
