import type { Metadata } from "next";
import VenueWayfinder from "@/components/venue/VenueWayfinder";
import { getBoothAssignments } from "@/lib/server/booth-assignments";
import { DEFAULT_FROM } from "@/lib/venue/params";
import { EVENT_INFO } from "@/lib/event-info";

// One copy of the page for everyone, served from the CDN, so thousands of
// visitors at once cost the same as one (src/lib/venue/live.ts). It is drawn
// again every 10 minutes, and straight after an admin changes a booth.
// The start and destination in the address (?from=Q3 from a QR sticker,
// ?to=W-S4) are read in the browser. (Next needs this number written out.)
export const revalidate = 600;

const TITLE = "Venue map & directions";
const DESCRIPTION = `Find booths, rooms and the registration desks at ${EVENT_INFO.name.en}, ${EVENT_INFO.place.en}, with walking directions.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "NewSpace Africa Conference", title: `${TITLE} | NewSpace Africa 2027`, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: `${TITLE} | NewSpace Africa 2027`, description: DESCRIPTION },
};

export default async function VenuePage() {
  const exhibitors = await getBoothAssignments();
  return <VenueWayfinder exhibitors={exhibitors} initialFrom={DEFAULT_FROM} initialTo={null} renderedAt={new Date().toISOString()} />;
}
