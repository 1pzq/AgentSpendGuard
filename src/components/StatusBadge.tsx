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
  "available",
  "allowed",
  "spend",
  "high"
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
  "waiting",
  "skip",
  "medium",
  "low"
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
  "closed",
  "denied"
];

const STATE_LABELS: Record<string, string> = {
  active: "已启用",
  allowed: "已允许",
  approved: "已授权",
  available: "可用",
  blocked: "已阻断",
  closed: "已关闭",
  confirmed: "已确认",
  connected: "已连接",
  denied: "已拒绝",
  disconnected: "未连接",
  draft: "草稿",
  empty: "空",
  exhausted: "已阻断",
  expired: "已过期",
  failed: "失败",
  fallback_local: "本地兜底",
  has_blocked: "有阻断记录",
  has_success: "有成功记录",
  high: "高",
  idle: "空闲",
  low: "低",
  medium: "中",
  mocked: "模拟",
  none: "无",
  not_applicable: "不适用",
  not_requested: "未请求",
  not_submitted: "未提交",
  not_used: "未使用",
  paying: "支付中",
  paid: "已支付",
  pending: "等待确认",
  prechecking: "预检查中",
  quote_requested: "询价中",
  quoted: "已报价",
  ready_to_sign: "待签名",
  redeemed: "已使用",
  rejected: "已拒绝",
  required_402: "收到 402",
  requested: "已请求",
  revoked: "已撤销",
  revoking: "撤销中",
  running: "运行中",
  settled: "已结算",
  skip: "跳过",
  spend: "支出",
  submitted: "已提交",
  succeeded: "成功",
  unsupported: "不支持",
  waiting: "等待中"
};

const PREFIX_LABELS: Record<string, string> = {
  Ledger: "账本",
  Payment: "支付",
  Permission: "权限",
  Policy: "策略",
  Relayer: "中继",
  Revocation: "撤销",
  Wallet: "钱包"
};

export function formatStateLabel(value: string) {
  return STATE_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatPrefix(value: string) {
  return PREFIX_LABELS[value] ?? value;
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
  const copy = label ?? (prefix ? `${formatPrefix(prefix)}：${formatStateLabel(value)}` : formatStateLabel(value));

  return (
    <span className={variant === "pill" ? "state-pill" : "badge"} data-tone={toneForState(value)}>
      {copy}
    </span>
  );
}
