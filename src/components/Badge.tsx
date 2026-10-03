"use client";

import { createPortal } from "react-dom";
import type { Attendee } from "@/lib/types";
import { roleAccent, roleLabel } from "@/lib/role-style";
import { EVENT_INFO } from "@/lib/event-info";

export default function Badge({ attendee, qr }: { attendee: Pick<Attendee, "full_name" | "role" | "organization" | "job_title">; qr?: string | null }) {
  const nameLength = attendee.full_name.length;
  const card = (
    <div className="badge-card">
      <header className="badge-header">
        <svg className="badge-header-art" viewBox="0 0 336 184" preserveAspectRatio="none" aria-hidden="true">
          <path fill="#03416a" d="M0 0h336v184H0z" />
          <g fill="none" stroke="#0a5283" strokeWidth="1">
            <circle cx="290" cy="54" r="104" /><circle cx="290" cy="54" r="78" />
            <ellipse cx="290" cy="54" rx="130" ry="43" transform="rotate(-35 290 54)" />
          </g>
          <path fill="#f09f07" d="M0 178h336v6H0z" />
          <circle cx="211" cy="102" r="4" fill="#f09f07" />
        </svg>
        <div className="badge-brand-row">
          {/* Use the full-resolution asset for sharp physical printing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" width="156" height="58" alt="NewSpace Africa Conference" loading="eager" />
          <div className="badge-edition"><span>{EVENT_INFO.mark[0]}</span><strong>{EVENT_INFO.mark[1]}</strong></div>
        </div>
        <div className="badge-event-meta"><strong>{EVENT_INFO.date.en}</strong><span>{EVENT_INFO.place.en}</span></div>
      </header>
      <div className="badge-body">
        <div className="badge-kicker">NewSpace Africa Conference</div>
        <div className={`badge-name${nameLength > 48 ? " badge-name-long" : nameLength > 28 ? " badge-name-medium" : ""}`}>{attendee.full_name}</div>
        <div className="badge-affiliation">
          {attendee.job_title && <div className="badge-title">{attendee.job_title}</div>}
          {attendee.organization && <div className="badge-org">{attendee.organization}</div>}
        </div>
      </div>
      <div className="badge-role"><span style={{ borderColor: roleAccent(attendee.role) }} />{roleLabel(attendee.role) || "Attendee"}</div>
      <footer className="badge-footer">
        <div className="badge-footer-text">
          {qr && <em>Scan to connect</em>}
          <span>Official conference badge</span>
          <strong>{EVENT_INFO.website}</strong>
        </div>
        {/* Public contact code (not the entry code): opens their contact page, refused by the check-in scanner. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img className="badge-qr" src={qr} width="96" height="96" alt="Attendee QR code" />}
      </footer>
    </div>
  );

  return (
    <>
      <section className="badge-preview" aria-label="Badge preview">
        <p className="badge-preview-label">Badge preview <span>3.5 × 5.5 in</span></p>
        {card}
      </section>
      {typeof document !== "undefined" && createPortal(<div id="badge-print-root" className="badge-print">{card}</div>, document.body)}
    </>
  );
}
