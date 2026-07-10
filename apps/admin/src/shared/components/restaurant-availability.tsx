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
