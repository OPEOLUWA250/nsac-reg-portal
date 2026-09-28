import { NextRequest, NextResponse } from "next/server";
import { adminCodeRequired, isAdminAuthorized, isStaffAuthorized } from "@/lib/staff-auth";
import { listTickets, saveTicket, validateTicketInput } from "@/lib/ticket-store";

export const runtime = "nodejs";

// Tickets & prices, edited from /admin. Changes show on /register straight
// away. Registrations already made keep the price they were charged.
export async function GET(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const tickets = await listTickets();
    return NextResponse.json({ tickets, adminCodeRequired: adminCodeRequired() });
  } catch {
    return NextResponse.json(
      { error: "Could not load tickets. Has the tickets migration been run?" },
      { status: 500 }
    );
  }
}

// Body: { isNew: boolean, ticket: { id, nameEn, nameFr, descriptionEn,
// descriptionFr, amountCents, availableUntil, active, sortOrder } }
export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Wrong admin code." }, { status: 403 });
  }

  let body: { isNew?: unknown; ticket?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.ticket || typeof body.ticket !== "object") {
    return NextResponse.json({ error: "missing ticket" }, { status: 400 });
  }

  const result = validateTicketInput(body.ticket as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fields: result.errors },
      { status: 400 }
    );
  }

  try {
    const saved = await saveTicket(result.row, body.isNew === true);
    if (!saved.ok) {
      return "conflict" in saved
        ? NextResponse.json(
            { error: "A ticket with this ID already exists.", fields: { id: "Already in use." } },
            { status: 409 }
          )
        : NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    console.info(
      `Ticket ${saved.ticket.id} saved: ${saved.ticket.amountCents} ${saved.ticket.currency}, active=${saved.ticket.active}`
    );
    return NextResponse.json({ ticket: saved.ticket });
  } catch (err) {
    console.error("Save ticket error", err);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
