"use client";

import type { SelectHTMLAttributes } from "react";
import { Badge, Select } from "@/shared/components/ui";
import {
  acceptingOrdersModeLabel,
  availabilityReasonLabel,
  type AcceptingOrdersMode,
  type RestaurantAvailabilityReason,
} from "@/shared/contracts/restaurants";
import { cn } from "@/shared/utils/cn";

type ModeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> & {
  value: AcceptingOrdersMode;
  onValueChange: (value: AcceptingOrdersMode) => void;
  compactLabels?: boolean;
};

export function AcceptingOrdersModeSelect({
  value,
  onValueChange,
  compactLabels = false,
  ...props
}: ModeSelectProps) {
  return (
    <Select
      {...props}
      value={value}
      onChange={(event) => onValueChange(event.target.value as AcceptingOrdersMode)}
    >
      <option value="SCHEDULED">{compactLabels ? "Följ schema" : acceptingOrdersModeLabel.SCHEDULED}</option>
      <option value="FORCE_OPEN">{acceptingOrdersModeLabel.FORCE_OPEN}</option>
      <option value="FORCE_CLOSED">{acceptingOrdersModeLabel.FORCE_CLOSED}</option>
    </Select>
  );
}

type ModeToggleProps = {
  value: AcceptingOrdersMode;
  onValueChange: (value: AcceptingOrdersMode) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** Compact three-state control used wherever the operator changes order mode. */
export function AcceptingOrdersModeToggle({ value, onValueChange, disabled, className, "aria-label": ariaLabel }: ModeToggleProps) {
  const options: Array<{ value: AcceptingOrdersMode; label: string; title: string }> = [
    { value: "SCHEDULED", label: "Schema", title: acceptingOrdersModeLabel.SCHEDULED },
    { value: "FORCE_OPEN", label: "Öppet", title: acceptingOrdersModeLabel.FORCE_OPEN },
    { value: "FORCE_CLOSED", label: "Pausat", title: acceptingOrdersModeLabel.FORCE_CLOSED },
  ];
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex min-w-0 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-1", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "min-w-0 flex-1 rounded-[6px] px-2 py-1.5 text-[11px] font-bold transition-colors",
            value === option.value
              ? "bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(17,17,19,0.12)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            disabled && "cursor-wait opacity-60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RestaurantAvailabilitySummary({
  isOpen,
  reason,
  className,
  compact = false,
}: {
  isOpen: boolean;
  reason: RestaurantAvailabilityReason;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge tone={isOpen ? "success" : "warning"}>
        {compact ? (isOpen ? "Öppen" : "Stängd") : (isOpen ? "Tar emot beställningar" : "Tar inte emot beställningar")}
      </Badge>
      <span className="text-xs text-[var(--text-secondary)]">
        {availabilityReasonLabel[reason] ?? reason}
      </span>
    </div>
  );
}
