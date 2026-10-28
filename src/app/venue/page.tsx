import type { Metadata } from "next";
import VenueWayfinder from "@/components/venue/VenueWayfinder";
import { getBoothAssignments } from "@/lib/server/booth-assignments";
import { buildPlaces } from "@/lib/venue/places";
import { parseVenueQuery } from "@/lib/venue/params";
import { EVENT_INFO } from "@/lib/event-info";

// Booth assignments are read on every visit, so a change in Supabase shows up
// on the next page load.
export const dynamic = "force-dynamic";

const TITLE = "Venue map & directions";
const DESCRIPTION = `Find booths, rooms and the registration desks at ${EVENT_INFO.name.en}, ${EVENT_INFO.place.en}, with walking directions.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "NewSpace Africa Conference", title: `${TITLE} | NewSpace Africa 2027`, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: `${TITLE} | NewSpace Africa 2027`, description: DESCRIPTION },
};

// /venue?from=Q3 (a QR sticker), /venue?to=W-S4, or both.
export default async function VenuePage(props: PageProps<"/venue">) {
  const [query, exhibitors] = await Promise.all([props.searchParams, getBoothAssignments()]);
  const { from, to } = parseVenueQuery(query, buildPlaces());
  return <VenueWayfinder exhibitors={exhibitors} initialFrom={from} initialTo={to} renderedAt={new Date().toISOString()} />;
}
