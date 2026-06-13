import { useEffect } from "react";

export type ConfirmDialogDetail = {
  label: string;
  value: string;
};

export type ConfirmDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmArrow?: boolean;
  details?: ConfirmDialogDetail[];
  eyebrow?: string;
  hideEyebrow?: boolean;
  message: string;
  title: string;
  tone?: "default" | "danger";
};

type ConfirmDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
  options: ConfirmDialogOptions | null;
};

function SketchConfirmIcon() {
  return (
    <svg aria-hidden="true" className="confirm-sketch-icon" viewBox="0 0 64 64">
      <path d="M19 12c7-2 20-2 26 1 4 2 5 7 5 19 0 13-2 18-7 20-7 2-24 1-29-3-3-4-3-25 0-34 1-2 3-3 5-3Z" />
      <path d="M24 27c3-1 10-1 15 0" />
      <path d="M24 36c4 1 11 1 17-1" />
      <path d="M30 8c1 5 1 8 0 13" />
      <path d="m21 47 5 4 11-13" />
    </svg>
  );
}

function detailClassName(detail: ConfirmDialogDetail) {
  const classes = ["confirm-dialog-detail"];

  if (detail.label.includes("金额")) classes.push("is-featured");
  if (detail.label.includes("网络")) classes.push("is-network");
  if (detail.label.includes("预检")) classes.push("is-preflight");

  return classes.join(" ");
}

function confirmButtonClassName(options: ConfirmDialogOptions) {
  const classes = [
    options.tone === "danger" ? "confirm-dialog-primary is-danger" : "confirm-dialog-primary"
  ];

  if (options.confirmArrow === false) classes.push("no-arrow");

  return classes.join(" ");
}

export function ConfirmDialog({
  onCancel,
  onConfirm,
  options
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!options) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, options]);

  if (!options) return null;

  return (
    <div
      aria-labelledby="confirm-dialog-title"
      aria-modal="true"
      className="confirm-dialog-backdrop"
      role="dialog"
    >
      <div className="confirm-dialog-panel">
        <div className="confirm-dialog-brand">
          <span className="confirm-dialog-logo">
            <img src="/loge.svg" alt="" />
            SpendGuard
          </span>
        </div>
        <div className="confirm-dialog-body">
          <span className="confirm-dialog-icon">
            <SketchConfirmIcon />
          </span>
          <div>
            {!options.hideEyebrow ? (
              <p className="eyebrow">{options.eyebrow ?? "Action required"}</p>
            ) : null}
            <h2 id="confirm-dialog-title">{options.title}</h2>
            <p>{options.message}</p>
          </div>
        </div>

        {options.details?.length ? (
          <dl className="confirm-dialog-details">
            {options.details.map((detail) => (
              <div
                className={detailClassName(detail)}
                key={`${detail.label}-${detail.value}`}
              >
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-secondary" onClick={onCancel} type="button">
            {options.cancelLabel ?? "取消"}
          </button>
          <button
            className={confirmButtonClassName(options)}
            onClick={onConfirm}
            type="button"
          >
            {options.confirmLabel ?? "确认"}
          </button>
        </div>
        <div className="confirm-dialog-footer" aria-hidden="true">
          <span>ERC-7710 · x402 Protocol</span>
          <span>1Shot Relay · Ready</span>
        </div>
      </div>
    </div>
  );
}
