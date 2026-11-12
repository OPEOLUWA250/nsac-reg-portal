import type { Metadata } from "next";
import RegistrationForm from "@/components/RegistrationForm";
import { availableTickets } from "@/lib/ticket-store";
import { isRegistrationOpen, PRIVACY_POLICY_URL } from "@/lib/registration-config";
import type { Ticket } from "@/lib/tickets";
import { describeError } from "@/lib/describe-error";

// Served from the cache and rebuilt at most once a minute, so an expired ticket
// (e.g. Early Bird after 31 Dec) drops off within a minute; ticket, price and
// registration changes in /admin refresh it immediately (revalidatePath("/")).
// ?payment= and ?lang= are read in the browser, so they don't force a fresh render.
export const revalidate = 60;

// The home page is the registration form itself.
export const metadata: Metadata = {
  title: { absolute: "Register | NewSpace Africa Conference 2027" },
  description:
    "Register for the NewSpace Africa Conference 2027 in Dakar, 19–23 April. Inscription à la Conférence NewSpace Africa 2027.",
};

export default async function HomePage() {
  let onSale: Ticket[] = [];
  try {
    onSale = await availableTickets();
  } catch (err) {
    // Without tickets nobody can register; the form shows "closed" rather
    // than an error page.
    console.error(`Could not load tickets for /register: ${describeError(err)}`);
  }
  const open = await isRegistrationOpen();
  const tickets = onSale.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    amountCents: t.amountCents,
    currency: t.currency,
  }));

  return (
    <RegistrationForm
      tickets={tickets}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}
      privacyPolicyUrl={PRIVACY_POLICY_URL}
      registrationOpen={open && tickets.length > 0}
    />
  );
}
