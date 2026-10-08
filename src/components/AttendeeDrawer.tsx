"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Button, cx, inputClass, linkClass, PaymentBadge, RolePill, StatusPill } from "@/components/ui";
import { IconClose, IconExternal } from "@/components/icons";
import {
  categoryLabel,
  formatDateTime,
  jobFunctionLabel,
  money,
  paymentLabel,
  stripeSessionUrl,
} from "@/lib/admin-format";
import { roleLabel } from "@/lib/role-style";
import { ATTENDEE_ROLES, hasValidTicket, type Attendee } from "@/lib/types";

// Slide-over with everything we know about one registrant, plus the
// actions staff need (resend QR, check in, passport, Stripe).

const CLOSE_MS = 200;

export default function AttendeeDrawer({
  attendee,
  ticketName,
  busy,
  message,
  onClose,
  onResend,
  onToggleCheckIn,
  onChangeRole,
  canManageVip,
  onPassport,
  onDelete,
}: {
  attendee: Attendee;
  ticketName: string;
  busy: boolean;
  message: string;
  onClose: () => void;
  onResend: () => void;
  onToggleCheckIn: () => void;
  /** Changes their category; `notify` emails them when they become a VIP. */
  onChangeRole: (role: string, notify: boolean) => void;
  /** Making someone a VIP, or removing it, is for super admins only. */
  canManageVip: boolean;
  /** Omitted for admins who may not open passports (super admins only). */
  onPassport?: () => void;
  /** Deletes this registration (asks for confirmation first). Super admins only. */
  onDelete?: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Slide out, then unmount.
  function close() {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }
  const onEscape = useEffectEvent(close);

  // Focus moves into the drawer and back to where it was on close; Tab
  // stays inside while it's open; Escape closes it.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(a.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address is on screen */
    }
  }

  const a = attendee;
  const stripeUrl = stripeSessionUrl(a.stripe_session_id);
  const yesNo = (v: boolean | null) => (v == null ? null : v ? "Yes" : "No");

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div
        aria-hidden="true"
        onClick={() => close()}
        className={cx("absolute inset-0 bg-blue/50 transition-opacity duration-200 starting:opacity-0", closing && "opacity-0")}
      />
      <aside
        ref={panel}
        className={cx(
          "relative h-full w-full max-w-xl overflow-y-auto border-l border-line bg-canvas transition-transform duration-200 ease-out starting:translate-x-full",
          closing && "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="on-dark sticky top-0 z-10 bg-blue px-5 pb-5 pt-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar name={a.full_name} large />
              <div className="min-w-0">
                <h2 id="drawer-title" className="truncate font-display text-xl font-bold leading-tight">
                  {a.full_name}
                </h2>
                <p className="truncate text-sm text-white/80">{[a.job_title, a.organization].filter(Boolean).join(" · ") || a.email}</p>
              </div>
            </div>
            <button
              ref={closeButton}
              type="button"
              onClick={() => close()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white active:bg-white/15"
              aria-label="Close details"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <RolePill role={a.role} />
            <PaymentBadge status={a.payment_status} source={a.source} />
            <StatusPill checkedIn={a.checked_in} />
            <span className="ml-auto font-mono text-xs text-white/65">#{a.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="on-dark" size="sm" onClick={onToggleCheckIn} loading={busy}>
              {a.checked_in ? "Undo check-in" : "Mark checked in"}
            </Button>
            <Button variant="on-dark" size="sm" onClick={onResend} disabled={busy}>
              Resend QR email
            </Button>
            {a.passport_path && onPassport && (
              <Button variant="on-dark" size="sm" onClick={onPassport} disabled={busy}>
                View passport
              </Button>
            )}
            <Button variant="on-dark" size="sm" onClick={copyEmail}>
              {copied ? "Email copied" : "Copy email"}
            </Button>
          </div>
          {message && (
            <p role="status" className="mt-3 text-sm text-gold">
              {message}
            </p>
          )}
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <RoleEditor key={`${a.id}:${a.role}`} attendee={a} busy={busy} onChangeRole={onChangeRole} canManageVip={canManageVip} />

          <Section title="Contact">
            <Row label="Email" value={<a className={linkClass} href={`mailto:${a.email}`}>{a.email}</a>} />
            <Row label="Phone" value={a.phone ? <a className={linkClass} href={`tel:${a.phone.replace(/\s/g, "")}`}>{a.phone}</a> : null} />
            <Row label="Language" value={a.language === "fr" ? "French" : a.language === "en" ? "English" : null} />
          </Section>

          <Section title="Professional">
            <Row label="Job title" value={a.job_title} />
            <Row label="Organisation" value={a.organization} />
            <Row label="Organisation country" value={a.organization_country} />
            <Row label="Professional category" value={categoryLabel(a.professional_category)} />
            <Row label="Job function" value={jobFunctionLabel(a.job_function)} />
          </Section>

          <Section title="Travel and logistics">
            <Row label="Nationality" value={a.nationality} />
            <Row label="Country of residence" value={a.residence_country} />
            <Row
              label="Invitation letter"
              value={
                a.needs_invitation_letter == null ? null : a.needs_invitation_letter ? (
                  <span className="font-semibold">Needed{a.passport_path ? ", passport uploaded" : ", no passport yet"}</span>
                ) : (
                  "Not needed"
                )
              }
            />
            <Row label="Food allergies" value={a.food_allergies} />
          </Section>

          <Section title="Ticket and payment">
            <Row label="Ticket" value={ticketName || null} />
            <Row label="Amount" value={money(a.amount_cents, a.currency) || null} />
            <Row label="Promo code" value={a.promo_code} />
            <Row label="Payment" value={paymentLabel(a.payment_status, a.source)} />
            <Row label="Paid at" value={formatDateTime(a.paid_at) || null} />
            <Row label="VAT number" value={a.vat_number} />
            <Row label="Invoice ID" value={a.invoice_reference} />
            <Row
              label="Stripe"
              value={
                stripeUrl ? (
                  <a className={cx(linkClass, "inline-flex items-center gap-1")} href={stripeUrl} target="_blank" rel="noopener noreferrer">
                    Open payment in Stripe <IconExternal />
                  </a>
                ) : null
              }
            />
          </Section>

          <Section title="Check-in and badge">
            <Row label="Status" value={a.checked_in ? "Checked in" : "Not checked in"} />
            <Row label="Checked in at" value={formatDateTime(a.checked_in_at) || null} />
            <Row label="Station" value={a.checked_in_station} />
            <Row label="Badge prints" value={String(a.badge_print_count ?? 0)} />
            <Row label="QR email sent" value={formatDateTime(a.qr_email_sent_at) || "Not sent"} />
          </Section>

          <Section title="Consent and communications">
            <Row label="Terms and privacy accepted" value={formatDateTime(a.consent_at) || null} />
            <Row label="Organiser updates" value={yesNo(a.opt_in_organizer)} />
            <Row label="Sponsor updates" value={yesNo(a.opt_in_sponsors)} />
            <Row label="Details shared on QR scan" value={a.share_details == null ? "Not asked" : yesNo(a.share_details)} />
          </Section>

          <Section title="Record">
            <Row label="Registered" value={formatDateTime(a.created_at)} />
            <Row label="Last updated" value={formatDateTime(a.updated_at)} />
            <Row label="Source" value={a.source === "web" ? "Registration form" : a.source === "walk_in" ? "Walk-in (admin)" : a.source === "jotform" ? "Jotform" : a.source} />
            <Row label="Jotform submission" value={a.jotform_submission_id} />
          </Section>

          {onDelete && (
            <section className="space-y-3 rounded-lg border border-danger bg-surface p-5">
              <h3 className="font-semibold text-danger">Delete this registration</h3>
              <p className="text-sm text-ink-2">
                Removes {a.full_name} and their passport file for good. Their ticket and QR code stop working. A payment
                isn&apos;t refunded: do that in Stripe.
              </p>
              <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>
                Delete registration
              </Button>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        large ? "h-12 w-12 bg-gold text-base text-blue" : "h-9 w-9 bg-subtle text-xs text-blue"
      )}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

// VIP isn't on the registration form: people register as Delegate, Speaker
// and so on, and an admin makes them a VIP here (with an email to tell them).
function RoleEditor({
  attendee: a,
  busy,
  onChangeRole,
  canManageVip,
}: {
  attendee: Attendee;
  busy: boolean;
  onChangeRole: (role: string, notify: boolean) => void;
  canManageVip: boolean;
}) {
  const [role, setRole] = useState(a.role);
  const [notify, setNotify] = useState(true);
  const changed = role !== a.role;
  const becomingVip = changed && role === "vip";
  const canEmail = hasValidTicket(a);
  const firstName = a.full_name.trim().split(/\s+/)[0] || a.full_name;
  // Older rows may hold a category that's no longer in the list.
  const all: readonly string[] = (ATTENDEE_ROLES as readonly string[]).includes(a.role) ? ATTENDEE_ROLES : [a.role, ...ATTENDEE_ROLES];
  const options = canManageVip ? all : all.filter((r) => r !== "vip");

  // Other admins can't change a VIP's category (the server refuses it too).
  if (a.role === "vip" && !canManageVip) {
    return (
      <section className="space-y-1 rounded-lg border border-line bg-surface p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Registration category</h3>
        <p className="text-sm text-ink">VIP. Only super admins can change this.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <div className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Registration category</h3>
        <p className="text-sm text-ink-3">
          {canManageVip
            ? "VIP isn't on the registration form. Make someone a VIP here; their badge will show it."
            : "VIP isn't on the registration form. Ask a super admin to make someone a VIP."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="drawer-role" className="sr-only">Registration category</label>
        <select id="drawer-role" className={inputClass(false, "w-auto min-w-44 flex-1 sm:flex-none")} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
          {options.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
        <Button variant={becomingVip ? "primary" : "secondary"} onClick={() => onChangeRole(role, becomingVip && canEmail && notify)} disabled={!changed} loading={busy && changed}>
          {becomingVip ? (canEmail && notify ? "Make VIP and email them" : "Make VIP") : "Save category"}
        </Button>
      </div>
      {becomingVip &&
        (canEmail ? (
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input type="checkbox" className="h-5 w-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email {firstName} to tell them they&apos;re a VIP (with their QR code)
          </label>
        ) : (
          <p className="text-sm text-ink-3">
            They haven&apos;t paid yet, so no email now. Their confirmation email will show VIP once they pay.
          </p>
        ))}
      {changed && a.badge_print_count > 0 && (
        <p className="text-sm text-ink-2">Their badge was already printed as {roleLabel(a.role)}. Reprint it after saving.</p>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <h3 className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h3>
      <dl className="divide-y divide-line px-5 pb-2">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cx("wrap-break-word", empty ? "text-ink-3" : "text-ink")}>{empty ? "Not given" : value}</dd>
    </div>
  );
}
