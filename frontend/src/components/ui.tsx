/** Small building blocks shared by every page. Restyle them here, not page by page. */
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from "react";

import { messageFor } from "../api/errors";
import { Logo } from "./Logo";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger" | "danger-outline";
  size?: "lg";
  block?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
};

export function Button({ variant = "primary", size, block, busy = false, icon: Icon, children, disabled,
                         className = "", type = "button", ...rest }: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, size && `btn-${size}`, block && "btn-block", className].filter(Boolean);
  return (
    <button type={type} className={classes.join(" ")} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {Icon && <Icon size={18} aria-hidden />}
      {busy ? "Please wait…" : children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string };

export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={error ? true : undefined}
             aria-describedby={[hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(" ") || undefined}
             {...rest} />
      {hint && <p id={`${inputId}-hint`} className="hint">{hint}</p>}
      {error && <p id={`${inputId}-error`} className="field-error">{error}</p>}
    </div>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string };

export function TextArea({ label, hint, error, id, ...rest }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <textarea id={inputId} aria-invalid={error ? true : undefined} {...rest} />
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

const ALERT_ICONS = { error: AlertTriangle, warning: AlertTriangle, info: Info, success: CheckCircle2 };

export function Alert({ kind = "error", children }: { kind?: keyof typeof ALERT_ICONS; children: ReactNode }) {
  const Icon = ALERT_ICONS[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden style={{ flex: "none", marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

/** Shows a query's error, or nothing. */
export function ErrorAlert({ error }: { error: unknown }) {
  return error ? <Alert>{messageFor(error)}</Alert> : null;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="loading" role="status">{label}</p>;
}

export function Empty({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

export function Card({ title, subtitle, action, children, className = "", footer }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, tone = "blue", note }: {
  icon: LucideIcon; label: string; value: ReactNode; tone?: "blue" | "green" | "amber"; note?: ReactNode;
}) {
  return (
    <div className="card statcard">
      <div className={`icon ${tone === "blue" ? "" : tone}`}><Icon size={20} aria-hidden /></div>
      <div>
        <p className="eyebrow">{label}</p>
        <p className="value">{value}</p>
        {note && <p className="small muted">{note}</p>}
      </div>
    </div>
  );
}

export function Switch({ id, checked, onChange, label, disabled }: {
  id: string; checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label}
             onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden />
    </span>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label, primary }: {
  value: T; options: { value: T; label: string; icon?: LucideIcon }[]; onChange: (v: T) => void; label: string; primary?: boolean;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map(({ value: v, label: text, icon: Icon }) => (
        <button key={v} type="button" role="tab" aria-selected={v === value} className={`tab ${primary ? "primary" : ""}`}
                onClick={() => onChange(v)}>
          {Icon && <Icon size={16} aria-hidden />}
          {text}
        </button>
      ))}
    </div>
  );
}

/** A confirmation dialog for actions that cannot be undone. */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, busy, danger = true }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
  busy?: boolean; danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="confirm-title">
      <div className="modal-body">
        <h2 id="confirm-title">{title}</h2>
        <div>{children}</div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

/** The two-pane frame of the screens before sign-in is complete (GP1 figure 4.23). */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <div className="auth-art" aria-hidden>
          <StudyIllustration />
          <h2>Empowering your <em>academic well-being</em></h2>
          <p className="muted">Balance productivity with mindful mental-health habits, built for PSUT students.</p>
        </div>
        <div className="auth-panel">
          <Logo />
          <h1>{title}</h1>
          {intro && <div className="intro">{intro}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

function StudyIllustration() {
  return (
    <svg className="art" viewBox="0 0 300 200" role="presentation">
      <rect x="30" y="140" width="240" height="18" rx="9" fill="#d6e6f5" />
      <rect x="70" y="70" width="110" height="72" rx="8" fill="#2e75b6" />
      <rect x="78" y="78" width="94" height="56" rx="4" fill="#eaf2fa" />
      <path d="M86 116l16-14 14 10 20-20 26 18" fill="none" stroke="#52b788" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="60" y="142" width="130" height="8" rx="4" fill="#245e93" />
      <rect x="198" y="96" width="44" height="46" rx="6" fill="#52b788" />
      <rect x="204" y="88" width="32" height="10" rx="4" fill="#3f9a70" />
      <circle cx="232" cy="52" r="20" fill="#f2b631" opacity="0.85" />
      <circle cx="56" cy="50" r="10" fill="#8b7ec8" opacity="0.6" />
      <circle cx="262" cy="118" r="7" fill="#7aa7d6" />
    </svg>
  );
}
