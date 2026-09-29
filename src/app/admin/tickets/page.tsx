import type { Metadata } from "next";
import TicketManager from "@/components/TicketManager";

export const metadata: Metadata = {
  title: "Tickets & prices",
  description: "Staff: the ticket types and prices shown on the registration form.",
  robots: { index: false },
};

export default function AdminTicketsPage() {
  return <TicketManager />;
}
