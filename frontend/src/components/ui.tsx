/** Small building blocks shared by every page. Restyle them here, not page by page. */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} disabled={disabled || busy} aria-busy={busy} {...rest}>
      {busy ? "Please wait…" : children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {hint && <p id={hintId} className="hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** A centred card for the screens before sign-in is complete. */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="center-screen">
      <div className="panel narrow stack">
        <p className="brand">CampusWell</p>
        <h1>{title}</h1>
        {intro && <div className="muted">{intro}</div>}
        {children}
      </div>
    </div>
  );
}
