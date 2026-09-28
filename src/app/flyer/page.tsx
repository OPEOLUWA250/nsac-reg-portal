import type { Metadata } from "next";
import FlyerMaker, { type FlyerPrefill } from "@/components/FlyerMaker";
import { retrieveCheckoutSession } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidTicket, type Attendee } from "@/lib/types";
import { EVENT_INFO } from "@/lib/event-info";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your flyer — NewSpace Africa Conference 2027",
  description: "Make an “I'm attending” graphic for LinkedIn, Instagram or WhatsApp.",
};

// Anyone can make a flyer. Coming from /register/success (?session_id=…),
// the registrant's details are filled in for them.
export default async function FlyerPage(props: PageProps<"/flyer">) {
  const query = await props.searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";

  let prefill: FlyerPrefill = { name: "", jobTitle: "", organization: "", role: null, language: null };
  let backHref: string | undefined;

  if (sessionId) {
    const session = await retrieveCheckoutSession(sessionId);
    const attendeeId = session?.client_reference_id ?? session?.metadata?.attendee_id;
    if (attendeeId) {
      const { data } = await supabaseAdmin().from("attendees").select("*").eq("id", attendeeId).maybeSingle();
      const attendee = data as Attendee | null;
      if (attendee && hasValidTicket(attendee)) {
        prefill = {
          name: attendee.full_name,
          jobTitle: attendee.job_title ?? "",
          organization: attendee.organization ?? "",
          role: attendee.role,
          language: attendee.language === "fr" ? "fr" : attendee.language === "en" ? "en" : null,
        };
        backHref = `/register/success?session_id=${encodeURIComponent(sessionId)}`;
      }
    }
  }

  // The flyer's QR code points people at the registration form.
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const registerUrl = base ? `${base}/register` : EVENT_INFO.websiteUrl;

  return <FlyerMaker prefill={prefill} backHref={backHref} registerUrl={registerUrl} />;
}
