import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";
import { deleteTicket, listTickets, saveTicket, ticketRegistrationCounts, validateTicketInput } from "@/lib/ticket-store";

export const runtime = "nodejs";

// Tickets & prices, edited from /admin. Changes show on /register straight
// away. Registrations already made keep the price they were charged.
export const GET = adminRoute(async (req: NextRequest) => {
  try {
    const [tickets, counts] = await Promise.all([listTickets(), ticketRegistrationCounts()]);
    return NextResponse.json({ tickets, counts });
  } catch {
    return NextResponse.json(
      { error: "Could not load tickets. Has the tickets migration been run?" },
      { status: 500 }
    );
  }
});

// Body: { isNew: boolean, ticket: { id, nameEn, nameFr, descriptionEn,
// descriptionFr, amountCents, availableUntil, active, sortOrder } }
export const POST = adminRoute(async (req: NextRequest) => {
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
});

// DELETE /api/admin/tickets?id=standard — only for tickets nobody has
// registered with (otherwise hide it: past registrations keep their ticket).
export const DELETE = adminRoute(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    const result = await deleteTicket(id);
    if (result === "in_use") {
      return NextResponse.json(
        { error: "People have registered with this ticket, so it can't be deleted. Hide it instead." },
        { status: 409 }
      );
    }
    if (result === "not_found") {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    console.info(`Ticket ${id} deleted`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete ticket error", err);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
});
