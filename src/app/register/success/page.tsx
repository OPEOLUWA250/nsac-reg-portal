import type { Metadata } from "next";
import { ButtonAnchor, ButtonLink, Card, Eyebrow, linkClass, Spinner } from "@/components/ui";
import { IconAlert, IconCalendar, IconCheck } from "@/components/icons";
import ClearRegistrationDraft from "@/components/ClearRegistrationDraft";
import { COPY } from "@/lib/registration-copy";
import { retrieveCheckoutSession, fulfillCheckoutSession } from "@/lib/payments";
import type { Attendee } from "@/lib/types";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your ticket",
  description: "Your NewSpace Africa Conference 2027 ticket and check-in QR code.",
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
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12" lang={lang}>
      <div className="mx-auto max-w-lg space-y-6">
        {/* Payment done (or being confirmed): the form draft is no longer needed. */}
        {session && attendee && <ClearRegistrationDraft />}

        {paid ? (
          <>
            <Card className="space-y-5 p-6 text-center sm:p-8">
              <IconCheck className="mx-auto h-8 w-8 text-success" />
              <div className="space-y-2">
                <Eyebrow>{COPY[lang].kicker}</Eyebrow>
                <h1 className="font-display text-3xl font-extrabold text-blue">{t.title}</h1>
                <p className="text-ink-2">{t.paidBody(firstName)}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated per attendee, not optimisable */}
              <img
                src={ticketUrl}
                alt={t.ticketAlt}
                width={300}
                height={487}
                className="mx-auto block h-auto w-72 max-w-full rounded-lg border border-line bg-subtle"
              />
              <p className="text-sm text-ink-3">{t.qrHelp}</p>
              <ButtonAnchor href={`${ticketUrl}&download=1`} download="newspace-africa-2027-ticket.png" variant="primary" size="lg" className="w-full sm:w-auto">
                {t.download}
              </ButtonAnchor>
              <p className="text-sm text-ink-3">{attendee?.qr_email_sent_at ? t.emailNote : t.emailPending}</p>
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold text-blue">{t.addToCalendar}</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { href: googleCalendarUrl(lang), label: "Google", external: true },
                  { href: outlookCalendarUrl(lang), label: "Outlook", external: true },
                  { href: `/api/calendar?lang=${lang}`, label: "Apple / .ics", external: false },
                ].map((c) => (
                  <ButtonAnchor
                    key={c.label}
                    href={c.href}
                    {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    variant="outline"
                    size="sm"
                  >
                    <IconCalendar />
                    {c.label}
                  </ButtonAnchor>
                ))}
              </div>
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold text-blue">{t.flyerTitle}</h2>
              <p className="text-sm text-ink-2">{t.flyerBody}</p>
              <ButtonLink href={`/flyer?session_id=${encodeURIComponent(sessionId)}`} variant="outline">
                {t.flyerCta}
              </ButtonLink>
            </Card>
          </>
        ) : session && attendee ? (
          <Card className="space-y-4 p-6 text-center sm:p-8" role="status">
            <Spinner className="mx-auto h-8 w-8 text-ink-3" />
            <h1 className="font-display text-2xl font-extrabold text-blue">{t.processingTitle}</h1>
            <p className="text-ink-2">{t.processingBody}</p>
            <ButtonLink href={`/register/success?session_id=${encodeURIComponent(sessionId)}`} variant="primary">
              {t.checkAgain}
            </ButtonLink>
          </Card>
        ) : (
          <Card className="space-y-4 p-6 text-center sm:p-8">
            <IconAlert className="mx-auto h-8 w-8 text-danger" />
            <h1 className="font-display text-2xl font-extrabold text-blue">{t.notFoundTitle}</h1>
            <p className="text-ink-2">
              {t.notFoundBody}{" "}
              <a className={linkClass} href={`mailto:${help}`}>
                {help}
              </a>
              .
            </p>
            <ButtonLink href="/" variant="primary">
              {t.backToForm}
            </ButtonLink>
          </Card>
        )}
      </div>
    </main>
  );
}
