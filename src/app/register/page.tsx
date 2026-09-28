import type { Metadata } from "next";
import RegistrationForm from "@/components/RegistrationForm";
import { availableTickets } from "@/lib/ticket-store";
import { registrationOpen, PRIVACY_POLICY_URL } from "@/lib/registration-config";
import type { Ticket } from "@/lib/tickets";
import { describeError } from "@/lib/describe-error";

// Rendered per request so price changes made in /admin, and expired tickets
// (e.g. Early Bird after 31 Dec), show up immediately without a redeploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register — NewSpace Africa Conference 2027",
  description: "Register for the NewSpace Africa Conference 2027. Inscription à la Conférence NewSpace Africa 2027.",
};

export default async function RegisterPage(props: PageProps<"/register">) {
  const query = await props.searchParams;
  let onSale: Ticket[] = [];
  try {
    onSale = await availableTickets();
  } catch (err) {
    // Without tickets nobody can register; the form shows "closed" rather
    // than an error page.
    console.error(`Could not load tickets for /register: ${describeError(err)}`);
  }
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
      registrationOpen={registrationOpen() && tickets.length > 0}
      paymentCancelled={query.payment === "cancelled"}
    />
  );
}
