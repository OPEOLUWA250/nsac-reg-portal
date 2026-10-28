import type { Metadata } from "next";
import { ButtonLink, Card, Eyebrow, linkClass } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";
import PayPanel from "@/components/PayPanel";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { attendeeIdFromToken, paymentOffer, type PaymentOffer } from "@/lib/server/payment-link";
import { COPY } from "@/lib/registration-copy";
import { PAY_COPY } from "@/lib/pay-copy";
import { firstNameOf } from "@/lib/payment-reminder";
import { listTickets } from "@/lib/ticket-store";
import { formatPrice } from "@/lib/tickets";
import type { Attendee } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Complete your registration",
  description: "Pay for your NewSpace Africa Conference 2027 ticket to confirm your place.",
  robots: { index: false },
};

// Opened from a payment reminder's button. Shows what they'll pay today and
// sends them to Stripe only when they press the button (link checkers that
// open emails don't create payment pages). See src/lib/server/payment-link.ts.
export default async function PayPage(props: PageProps<"/pay/[token]">) {
  const { token } = await props.params;
  const id = attendeeIdFromToken(decodeURIComponent(token));

  let attendee: Attendee | null = null;
  let offer: PaymentOffer | null = null;
  let previousTicket = "";
  if (id) {
    try {
      const { data, error } = await supabaseAdmin().from("attendees").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      attendee = (data as Attendee | null) ?? null;
      if (attendee) {
        offer = await paymentOffer(attendee);
        if (offer.kind === "choose" && attendee.ticket_type) {
          const old = (await listTickets()).find((t) => t.id === attendee!.ticket_type);
          previousTicket = old ? old.name[attendee.language === "fr" ? "fr" : "en"] || old.name.en : "";
        }
      }
    } catch (err) {
      console.error(`Payment page ${id} failed: ${describeError(err)}`);
    }
  }

  const lang = attendee?.language === "fr" ? "fr" : "en";
  const t = PAY_COPY[lang];
  const help = COPY[lang].helpEmail;

  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12" lang={lang}>
      <div className="mx-auto max-w-lg space-y-6">
        {attendee && offer && (offer.kind === "pay" || offer.kind === "choose") ? (
          <Card className="space-y-5 p-6 sm:p-8">
            <div className="space-y-2">
              <Eyebrow>{COPY[lang].kicker}</Eyebrow>
              <h1 className="font-display text-3xl font-extrabold text-blue">{t.title}</h1>
              <p className="text-ink-2">{t.greeting(firstNameOf(attendee))}</p>
            </div>
            <PayPanel
              token={token}
              language={lang}
              offer={
                offer.kind === "pay"
                  ? {
                      kind: "pay",
                      ticket: offer.ticket.name[lang] || offer.ticket.name.en,
                      price: formatPrice(offer.amountCents, offer.ticket.currency, lang),
                      note: offer.promo ? t.codeApplied(offer.promo.code) : offer.codeDropped ? t.codeDropped(offer.codeDropped) : null,
                    }
                  : {
                      kind: "choose",
                      intro: t.chooseIntro(previousTicket),
                      tickets: offer.tickets.map((x) => ({
                        id: x.id,
                        name: x.name[lang] || x.name.en,
                        description: x.description[lang] || x.description.en,
                        price: formatPrice(x.amountCents, x.currency, lang),
                      })),
                    }
              }
            />
          </Card>
        ) : attendee && offer?.kind === "paid" ? (
          <Card className="space-y-4 p-6 text-center sm:p-8">
            <IconCheck className="mx-auto h-8 w-8 text-success" />
            <h1 className="font-display text-2xl font-extrabold text-blue">{t.paidTitle}</h1>
            <p className="text-ink-2">{t.paidBody(attendee.email)}</p>
          </Card>
        ) : (
          <Card className="space-y-4 p-6 text-center sm:p-8">
            <IconAlert className="mx-auto h-8 w-8 text-danger" />
            <h1 className="font-display text-2xl font-extrabold text-blue">{offer?.kind === "closed" ? t.closedTitle : t.invalidTitle}</h1>
            <p className="text-ink-2">
              {offer?.kind === "closed" ? t.closedBody : t.invalidBody}{" "}
              <a className={linkClass} href={`mailto:${help}`}>
                {help}
              </a>
              .
            </p>
            {offer?.kind !== "closed" && (
              <ButtonLink href="/" variant="outline">
                {t.backHome}
              </ButtonLink>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
