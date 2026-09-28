import type { Metadata } from "next";
import Link from "next/link";
import { Card, Kicker } from "@/components/ui";
import { COPY } from "@/lib/registration-copy";
import { retrieveCheckoutSession, fulfillCheckoutSession } from "@/lib/payments";
import { generateQrPngDataUrl } from "@/lib/qrcode";
import type { Attendee } from "@/lib/types";

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
  const paid = attendee && attendee.payment_status !== "pending";
  const qr = paid ? await generateQrPngDataUrl(attendee!.unique_code) : null;
  const firstName = attendee?.first_name ?? attendee?.full_name.split(" ")[0] ?? "";

  return (
    <main className="flex-1 brand-glow px-4 py-10 sm:py-16" lang={lang}>
      <div className="max-w-lg mx-auto">
        <Card className="p-6 sm:p-9 space-y-5 text-center">
          <Kicker>{COPY[lang].kicker}</Kicker>

          {paid && qr ? (
            <>
              <h1 className="font-display text-3xl text-navy">{t.title}</h1>
              <p className="text-navy/70">{t.paidBody(firstName)}</p>
              <div className="mx-auto w-fit rounded-2xl border border-navy/10 bg-offwhite p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
                <img src={qr} alt="QR code" width={240} height={240} className="block h-60 w-60" />
              </div>
              <p className="text-sm text-navy/60">{t.qrHelp}</p>
              <a
                href={qr}
                download="newspace-africa-2027-qr.png"
                className="inline-flex rounded-full bg-gold text-navy px-6 py-3 text-sm font-semibold hover:bg-gold-light transition-colors"
              >
                {t.download}
              </a>
              <p className="text-xs text-navy/50">{t.emailNote}</p>
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
