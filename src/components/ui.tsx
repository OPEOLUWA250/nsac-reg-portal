import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  ReactNode,
} from "react";
import { roleAccent } from "@/lib/role-style";
import { IconAlert, IconCheck, IconInfo } from "@/components/icons";
import type { Attendee } from "@/lib/types";
import { paymentLabel } from "@/lib/admin-format";

// Shared building blocks. Styles follow DESIGN.md; pages should use these
// instead of writing their own button, card or input classes.

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------- buttons ----------

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "on-dark";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-black hover:bg-gold-hover active:bg-gold-press",
  secondary: "bg-blue text-white hover:bg-blue-hover active:bg-blue-deep",
  outline: "border border-line-strong bg-surface text-blue hover:bg-subtle active:bg-line",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink active:bg-line",
  danger: "border border-danger bg-surface text-danger hover:bg-subtle active:bg-line",
  "on-dark": "border border-white/30 text-white hover:bg-white/10 active:bg-white/15",
};

const SIZES: Record<ButtonSize, string> = {
  // 36px on a mouse, 44px on touch screens.
  sm: "min-h-9 pointer-coarse:min-h-11 px-3 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className = "") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md py-2 text-center font-semibold leading-tight",
    "cursor-pointer transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** A link that looks like a button (internal pages). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** A plain <a> that looks like a button (downloads, other sites). */
export function ButtonAnchor({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}

/** Inline text link. */
export const linkClass =
  "font-semibold text-blue underline decoration-gold decoration-2 underline-offset-2 hover:text-blue-hover transition-colors [overflow-wrap:anywhere]";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cx("shrink-0 animate-spin", className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- layout ----------

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function Eyebrow({ children, onDark = false, className = "" }: { children: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "block text-xs font-semibold uppercase tracking-wider",
        onDark ? "text-gold" : "text-gold-ink",
        className
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="font-display text-3xl font-extrabold text-blue">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard page wrapper for admin pages (the admin shell provides <main>). */
export function AdminPage({ children, width = "max-w-6xl" }: { children: ReactNode; width?: string }) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className={cx(width, "mx-auto space-y-6")}>{children}</div>
    </div>
  );
}

// ---------- form controls ----------

// Text fields, selects and text areas. Focus: a 2px brand-blue edge (border
// plus an inset ring), fading in.
export function inputClass(invalid = false, className = "") {
  return cx(
    "block w-full min-h-12 rounded-md border bg-surface px-4 py-2.5 text-base text-ink placeholder:text-ink-3 [&:is(select)]:pr-10",
    "transition-[border-color,box-shadow,outline-color] duration-150",
    "focus:outline-none focus:ring-1 focus:ring-inset",
    "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-3",
    invalid
      ? "border-danger focus:border-danger focus:ring-danger"
      : "border-line-strong hover:border-ink-3 focus:border-blue focus:ring-blue",
    className
  );
}

/** ids of the hint and error under a field, for aria-describedby. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-danger">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Field({
  id,
  label,
  optionalLabel,
  required = false,
  hint,
  error,
  children,
  as = "label",
}: {
  id: string;
  label: ReactNode;
  optionalLabel?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  /** "div" for groups whose label isn't a single <label for>. */
  as?: "label" | "div";
}) {
  const Label = as;
  return (
    <div className="group space-y-1.5">
      <Label
        {...(as === "label" ? { htmlFor: id } : {})}
        className="block text-sm font-semibold text-ink transition-colors duration-150 group-focus-within:text-blue"
      >
        {label}
        {optionalLabel && <span className="ml-1.5 font-normal text-ink-3">({optionalLabel})</span>}
        {required && (
          <span className="ml-0.5 text-gold-ink" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

// ---------- feedback ----------

type AlertTone = "error" | "success" | "info";

const ALERT_TONE: Record<AlertTone, { border: string; icon: string }> = {
  error: { border: "border-danger", icon: "text-danger" },
  success: { border: "border-success", icon: "text-success" },
  info: { border: "border-line-strong", icon: "text-ink-3" },
};

export function Alert({
  tone,
  title,
  children,
  action,
  className = "",
}: {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? IconAlert : tone === "success" ? IconCheck : IconInfo;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-sm text-ink",
        "transition-opacity duration-200 starting:opacity-0",
        ALERT_TONE[tone].border,
        className
      )}
    >
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", ALERT_TONE[tone].icon)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded-sm bg-subtle", className)} />;
}

/** Screen-reader text for a region that is still loading. */
export function LoadingLabel({ children = "Loading" }: { children?: string }) {
  return (
    <span role="status" className="sr-only">
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-xl font-bold text-blue">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this page", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <Card role="alert" className="px-6 py-12 text-center">
      <IconAlert className="mx-auto h-6 w-6 text-danger" />
      <p className="mt-3 font-display text-xl font-bold text-blue">{title}</p>
      {message && <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">{message}</p>}
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------- chips ----------

export function Chip({ children, dot, className = "" }: { children: ReactNode; dot?: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-ink",
        className
      )}
    >
      {dot && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function RolePill({ role }: { role: string }) {
  return <Chip dot={roleAccent(role)} className="capitalize">{role}</Chip>;
}

export function StatusPill({ checkedIn }: { checkedIn: boolean }) {
  return checkedIn ? (
    <Chip dot="var(--color-success)">Checked in</Chip>
  ) : (
    <Chip dot="var(--color-line-strong)" className="text-ink-3">
      Not checked in
    </Chip>
  );
}

export function PaymentBadge({ status, source }: { status: Attendee["payment_status"]; source?: string | null }) {
  const dot =
    source === "walk_in"
      ? "var(--color-gold)"
      : status === "paid"
        ? "var(--color-success)"
        : status === "pending"
          ? "var(--color-danger)"
          : "var(--color-line-strong)";
  return <Chip dot={dot}>{paymentLabel(status, source)}</Chip>;
}

// ---------- language ----------

export function LanguageSwitch({ lang, onChange }: { lang: "en" | "fr"; onChange: (l: "en" | "fr") => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Language / Langue">
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "English" : "Français"}
          className={cx(
            "min-h-9 min-w-11 pointer-coarse:min-h-11 rounded-sm px-3 text-xs font-semibold uppercase tracking-wider transition-colors duration-150",
            lang === l ? "bg-blue text-white" : "text-ink-2 hover:bg-subtle hover:text-ink"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
