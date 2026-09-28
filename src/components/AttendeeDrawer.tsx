"use client";

import { useEffect, type ReactNode } from "react";
import { RolePill, StatusPill } from "@/components/ui";
import {
  categoryLabel,
  formatDateTime,
  jobFunctionLabel,
  money,
  paymentLabel,
  stripeSessionUrl,
} from "@/lib/admin-format";
import type { Attendee } from "@/lib/types";

// Slide-over with everything we know about one registrant, plus the
// actions staff need (resend QR, check in, passport, Stripe).

export default function AttendeeDrawer({
  attendee,
  ticketName,
  busy,
  message,
  onClose,
  onResend,
  onToggleCheckIn,
  onPassport,
}: {
  attendee: Attendee;
  ticketName: string;
  busy: boolean;
  message: string;
  onClose: () => void;
  onResend: () => void;
  onToggleCheckIn: () => void;
  onPassport: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = attendee;
  const stripeUrl = stripeSessionUrl(a.stripe_session_id);
  const yesNo = (v: boolean | null) => (v == null ? null : v ? "Yes" : "No");

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={a.full_name}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-offwhite shadow-2xl">
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 pt-6 pb-5 text-white"
          style={{ background: "linear-gradient(135deg, var(--navy) 0%, #03416A 100%)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar name={a.full_name} large />
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-tight truncate">{a.full_name}</h2>
                <p className="text-sm text-white/65 truncate">
                  {[a.job_title, a.organization].filter(Boolean).join(" · ") || a.email}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-0.5 py-0.5"><RolePill role={a.role} /></span>
            <PaymentBadge status={a.payment_status} />
            <span className="rounded-full bg-white px-0.5 py-0.5"><StatusPill checkedIn={a.checked_in} /></span>
            <span className="text-xs text-white/50 font-mono ml-auto">#{a.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={onResend} disabled={busy}>Resend QR email</ActionButton>
            <ActionButton onClick={onToggleCheckIn} disabled={busy}>{a.checked_in ? "Undo check-in" : "Mark checked in"}</ActionButton>
            {a.passport_path && <ActionButton onClick={onPassport} disabled={busy}>View passport</ActionButton>}
            <ActionButton onClick={() => navigator.clipboard?.writeText(a.email)}>Copy email</ActionButton>
          </div>
          {message && <p className="mt-3 text-sm text-gold-light">{message}</p>}
        </div>

        <div className="p-6 space-y-5">
          <Section title="Contact">
            <Row label="Email" value={<a className="text-navy underline decoration-gold" href={`mailto:${a.email}`}>{a.email}</a>} />
            <Row label="Phone" value={a.phone ? <a className="text-navy underline decoration-gold" href={`tel:${a.phone.replace(/\s/g, "")}`}>{a.phone}</a> : null} />
            <Row label="Language" value={a.language === "fr" ? "French" : a.language === "en" ? "English" : null} />
          </Section>

          <Section title="Professional">
            <Row label="Job title" value={a.job_title} />
            <Row label="Organisation" value={a.organization} />
            <Row label="Organisation country" value={a.organization_country} />
            <Row label="Professional category" value={categoryLabel(a.professional_category)} />
            <Row label="Job function" value={jobFunctionLabel(a.job_function)} />
          </Section>

          <Section title="Travel & logistics">
            <Row label="Nationality" value={a.nationality} />
            <Row label="Country of residence" value={a.residence_country} />
            <Row
              label="Invitation letter"
              value={
                a.needs_invitation_letter == null ? null : a.needs_invitation_letter ? (
                  <span className="font-semibold text-navy">Needed{a.passport_path ? " · passport uploaded" : " · no passport yet"}</span>
                ) : (
                  "Not needed"
                )
              }
            />
            <Row label="Food allergies" value={a.food_allergies} />
          </Section>

          <Section title="Ticket & payment">
            <Row label="Ticket" value={ticketName || null} />
            <Row label="Amount" value={money(a.amount_cents, a.currency) || null} />
            <Row label="Payment" value={paymentLabel(a.payment_status)} />
            <Row label="Paid at" value={formatDateTime(a.paid_at) || null} />
            <Row label="VAT number" value={a.vat_number} />
            <Row label="Invoice ID" value={a.invoice_reference} />
            <Row
              label="Stripe"
              value={stripeUrl ? <a className="text-navy underline decoration-gold" href={stripeUrl} target="_blank" rel="noopener noreferrer">Open payment in Stripe ↗</a> : null}
            />
          </Section>

          <Section title="Check-in & badge">
            <Row label="Status" value={a.checked_in ? "Checked in" : "Not checked in"} />
            <Row label="Checked in at" value={formatDateTime(a.checked_in_at) || null} />
            <Row label="Station" value={a.checked_in_station} />
            <Row label="Badge prints" value={String(a.badge_print_count ?? 0)} />
            <Row label="QR email sent" value={formatDateTime(a.qr_email_sent_at) || "Not sent"} />
          </Section>

          <Section title="Consent & communications">
            <Row label="Terms & privacy accepted" value={formatDateTime(a.consent_at) || null} />
            <Row label="Organiser updates" value={yesNo(a.opt_in_organizer)} />
            <Row label="Sponsor updates" value={yesNo(a.opt_in_sponsors)} />
          </Section>

          <Section title="Record">
            <Row label="Registered" value={formatDateTime(a.created_at)} />
            <Row label="Last updated" value={formatDateTime(a.updated_at)} />
            <Row label="Source" value={a.source === "web" ? "Registration form" : a.source === "walk_in" ? "Walk-in (admin)" : a.source === "jotform" ? "Jotform" : a.source} />
            <Row label="Jotform submission" value={a.jotform_submission_id} />
          </Section>
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        large ? "h-12 w-12 text-base bg-gold text-navy" : "h-9 w-9 text-xs bg-navy/8 text-navy"
      }`}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function PaymentBadge({ status }: { status: Attendee["payment_status"] }) {
  const styles: Record<string, string> = {
    paid: "border-emerald-300 bg-emerald-50 text-emerald-700",
    pending: "border-red-300 bg-red-50 text-red-700",
    not_required: "border-navy/15 bg-white text-navy/60",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
        styles[status ?? ""] ?? "border-navy/15 bg-white text-navy/50"
      }`}
    >
      {paymentLabel(status)}
    </span>
  );
}

function ActionButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-navy/10 bg-white">
      <h3 className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{title}</h3>
      <dl className="divide-y divide-navy/6 px-5 pb-2">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[10.5rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-navy/50">{label}</dt>
      <dd className="text-navy break-words">{value === null || value === undefined || value === "" ? <span className="text-navy/30">—</span> : value}</dd>
    </div>
  );
}
