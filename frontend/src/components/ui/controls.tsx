import Link from "next/link";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "success" | "warning";
export type ButtonSize = "sm" | "md" | "lg";
export type BadgeTone = "success" | "warning" | "danger" | "critical" | "info" | "neutral" | "brand";
export type PanelVariant = "marketing" | "ops" | "docs" | "elevated" | "inset";

type CommonButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  children: ReactNode;
};

function buttonClass({ variant = "primary", size = "md", block, loading, className }: CommonButtonProps & { loading?: boolean }) {
  return [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    block ? "ui-button--block" : "",
    loading ? "is-loading" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  ...props
}: CommonButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant ?? "primary"}
      data-size={size ?? "md"}
      className={buttonClass({ variant, size, block, loading, className, children })}
    >
      {loading ? <LoaderCircle className="ui-spinner" size={15} aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  block,
  leadingIcon,
  trailingIcon,
  className,
  children,
  external = false,
  ...props
}: CommonButtonProps & Omit<React.ComponentProps<typeof Link>, "href" | "children"> & { href: string; external?: boolean }) {
  const classes = buttonClass({ variant, size, block, className, children });
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {leadingIcon}<span>{children}</span>{trailingIcon}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {leadingIcon}<span>{children}</span>{trailingIcon}
    </Link>
  );
}

export function IconButton({
  label,
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      title={label}
      data-variant={variant}
      data-size={size}
      className={`ui-icon-button ui-button--${variant} ui-button--${size} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  dot = true,
  className = "",
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`} data-tone={tone}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export function Panel({
  as: Tag = "section",
  variant = "ops",
  padding = "md",
  className = "",
  children,
  ...props
}: {
  as?: "section" | "div" | "article";
  variant?: PanelVariant;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...props} className={`ui-panel ui-panel--${variant} ui-panel--pad-${padding} ${className}`} data-variant={variant}>
      {children}
    </Tag>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`ui-field ${className}`} data-invalid={Boolean(error)}>
      <label className="ui-field-label" htmlFor={id}>
        {label}
        {required && <span className="ui-field-required" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="ui-field-hint" id={hintId}>{hint}</p>}
      {error && <p className="ui-field-error" id={errorId} role="alert">{error}</p>}
      <span className="ui-field-describedby" data-hint={hintId} data-error={errorId} hidden />
    </div>
  );
}

export function SegmentedLink({
  href,
  active,
  className = "",
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`ui-segmented-item ui-segmented-link ${className}`} data-active={active} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          data-active={value === option.value}
          className="ui-segmented-item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty" role="status">
      <span className="ui-empty-icon"><Inbox size={18} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something needs attention",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-alert ui-alert--danger" role="alert">
      <AlertTriangle size={17} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`ui-skeleton ${className}`} aria-label="Loading" role="status">
      {Array.from({ length: lines }).map((_, index) => <span key={index} style={{ width: `${92 - index * 13}%` }} />)}
    </div>
  );
}
