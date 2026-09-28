import type { Metadata } from "next";
import Link from "next/link";
import { Card, Kicker } from "@/components/ui";
import ClearRegistrationDraft from "@/components/ClearRegistrationDraft";
import { COPY } from "@/lib/registration-copy";
import { retrieveCheckoutSession, fulfillCheckoutSession } from "@/lib/payments";
import type { Attendee } from "@/lib/types";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registration — NewSpace Africa Conference 2027",
  robots: { index: false },
};

// Stripe sends the registrant here after paying. We confirm the payment
// with Stripe directly (never trusting the URL alone), mark them paid if the
// webhook hasn't already, and show their QR code.
export default async function RegisterSuccessPage(props: PageProps<"/register/success">) {
  const query = await props.searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";

  const session = sessionId ? await retrieveCheckoutSession(sessionId) : null;
  let attendee: Attendee | null = null;
  if (session) {
    try {
      attendee = await fulfillCheckoutSession(session);
    } catch (err) {
      console.error("Success page could not fulfil session", err);
    }
  }

  const lang = attendee?.language === "fr" ? "fr" : session?.locale === "fr" ? "fr" : "en";
  const t = COPY[lang].success;
  const help = COPY[lang].helpEmail;
  const paid = Boolean(attendee && attendee.payment_status !== "pending");
  const ticketUrl = `/api/ticket?session_id=${encodeURIComponent(sessionId)}`;
  const firstName = attendee?.first_name ?? attendee?.full_name.split(" ")[0] ?? "";

  return (
    <main className="flex-1 brand-glow px-4 py-10 sm:py-16" lang={lang}>
      <div className="max-w-lg mx-auto">
        <Card className="p-6 sm:p-9 space-y-5 text-center">
          <Kicker>{COPY[lang].kicker}</Kicker>

          {/* Payment done (or being confirmed): the form draft is no longer needed. */}
          {session && attendee && <ClearRegistrationDraft />}

          {paid ? (
            <>
              <h1 className="font-display text-3xl text-navy">{t.title}</h1>
              <p className="text-navy/70">{t.paidBody(firstName)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated per attendee, not optimisable */}
              <img
                src={ticketUrl}
                alt={t.ticketAlt}
                width={300}
                height={487}
                className="mx-auto block w-[300px] max-w-full h-auto rounded-2xl shadow-[0_10px_28px_-12px_rgba(10,26,49,0.35)]"
              />
              <p className="text-sm text-navy/60">{t.qrHelp}</p>
              <a
                href={`${ticketUrl}&download=1`}
                download="newspace-africa-2027-ticket.png"
                className="inline-flex rounded-full bg-gold text-navy px-6 py-3 text-sm font-semibold hover:bg-gold-light transition-colors"
              >
                {t.download}
              </a>
              <p className="text-xs text-navy/50">
                {attendee?.qr_email_sent_at ? t.emailNote : t.emailPending}
              </p>
              <div className="space-y-2.5 pt-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-navy/50">{t.addToCalendar}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { href: googleCalendarUrl(lang), label: "Google", external: true },
                    { href: outlookCalendarUrl(lang), label: "Outlook", external: true },
                    { href: `/api/calendar?lang=${lang}`, label: "Apple / .ics", external: false },
                  ].map((c) => (
                    <a
                      key={c.label}
                      href={c.href}
                      {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5 transition-colors"
                    >
                      <CalendarIcon />
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 space-y-3 text-left">
                <div className="font-display text-lg text-navy">{t.flyerTitle}</div>
                <p className="text-sm text-navy/70">{t.flyerBody}</p>
                <Link
                  href={`/flyer?session_id=${encodeURIComponent(sessionId)}`}
                  className="inline-flex rounded-full bg-navy text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-2 transition-colors"
                >
                  {t.flyerCta}
                </Link>
              </div>
            </>
          ) : session && attendee ? (
            <>
              <h1 className="font-display text-2xl text-navy">{t.processingTitle}</h1>
              <p className="text-navy/70">{t.processingBody}</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl text-navy">{t.notFoundTitle}</h1>
              <p className="text-navy/70">
                {t.notFoundBody}{" "}
                <a className="underline decoration-gold" href={`mailto:${help}`}>
                  {help}
                </a>
                .
              </p>
              <Link href="/register" className="inline-block text-sm font-semibold text-navy underline decoration-gold">
                {t.backToForm}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
