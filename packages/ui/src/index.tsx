import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "primary" | "buy" | "sell" | "neutral" | "danger";
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      busy = false,
      children,
      className = "",
      disabled,
      tone = "primary",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`forge-button forge-button--${tone} ${className}`.trim()}
        disabled={Boolean(disabled) || busy}
        aria-busy={busy}
        {...rest}
      >
        {busy ? <span className="forge-spinner" aria-hidden="true" /> : null}
        <span>{children}</span>
      </button>
    );
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: "confirmed" | "caution" | "danger" | "muted" | "collecting";
  icon?: ReactNode;
}

export function Badge({
  status,
  icon,
  children,
  className = "",
  ...rest
}: BadgeProps) {
  const fallbackIcon =
    status === "confirmed"
      ? "✓"
      : status === "caution"
        ? "!"
        : status === "danger"
          ? "×"
          : status === "collecting"
            ? "…"
            : "·";
  return (
    <span
      className={`forge-badge forge-badge--${status} ${className}`.trim()}
      {...rest}
    >
      <span aria-hidden="true">{icon ?? fallbackIcon}</span>
      <span>{children}</span>
    </span>
  );
}

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode | null | undefined;
  hint?: string;
}

export function Metric({
  label,
  value,
  hint,
  className = "",
  ...rest
}: MetricProps) {
  return (
    <div className={`forge-metric ${className}`.trim()} {...rest}>
      <span className="forge-metric__label">{label}</span>
      <strong className="forge-metric__value">{value ?? "—"}</strong>
      {hint ? <span className="forge-metric__hint">{hint}</span> : null}
    </div>
  );
}

export interface ExternalLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  href?: string | null;
}

export function ExternalLink({
  href,
  children,
  className = "",
  ...rest
}: ExternalLinkProps) {
  if (!href) return <span className="forge-unavailable">지원되지 않음</span>;
  return (
    <a
      className={`forge-external-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
    >
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="visually-hidden">{children}</span>;
}
