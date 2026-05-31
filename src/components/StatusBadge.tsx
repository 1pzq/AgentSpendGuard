import type { StateTone } from "@/shared/types";

const READY_STATES = [
  "connected",
  "active",
  "approved",
  "redeemed",
  "succeeded",
  "paid",
  "confirmed",
  "has_success",
  "available"
];

const WORKING_STATES = [
  "requested",
  "ready_to_sign",
  "prechecking",
  "running",
  "required_402",
  "paying",
  "quote_requested",
  "quoted",
  "submitted",
  "pending",
  "revoking"
];

const WARN_STATES = [
  "draft",
  "not_requested",
  "idle",
  "none",
  "not_used",
  "empty",
  "mocked",
  "fallback_local",
  "waiting"
];

const DANGER_STATES = [
  "unsupported",
  "rejected",
  "blocked",
  "failed",
  "exhausted",
  "expired",
  "revoked",
  "has_blocked",
  "closed"
];

export function formatStateLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function toneForState(value: string): StateTone {
  if (READY_STATES.includes(value)) return "ready";
  if (WORKING_STATES.includes(value)) return "working";
  if (WARN_STATES.includes(value)) return "warn";
  if (DANGER_STATES.includes(value)) return "danger";
  return "warn";
}

type StatusBadgeProps = {
  value: string;
  label?: string;
  prefix?: string;
  variant?: "badge" | "pill";
};

export function StatusBadge({
  value,
  label,
  prefix,
  variant = "badge"
}: StatusBadgeProps) {
  const copy = label ?? (prefix ? `${prefix}: ${value}` : formatStateLabel(value));

  return (
    <span className={variant === "pill" ? "state-pill" : "badge"} data-tone={toneForState(value)}>
      {copy}
    </span>
  );
}
