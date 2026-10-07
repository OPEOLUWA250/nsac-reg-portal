import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";
import {
  cancelStudentCode,
  createStudentCode,
  getStudentCode,
  isMissingTable,
  listStudentCodes,
  markStudentCodeEmailed,
  type StudentCode,
} from "@/lib/student-codes";
import { listTickets } from "@/lib/ticket-store";
import { isOnSale, STUDENT_TICKET_ID } from "@/lib/tickets";
import { sendStudentCodeEmail } from "@/lib/email";
import { brandLogoPng } from "@/lib/ticket-image";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

// /admin/student-codes: list (GET), create (POST), cancel or email (PATCH).
// Any admin: checking student IDs that arrive at info@ is day-to-day work.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOT_SET_UP = "Student codes aren't set up yet: run the student codes setup script in the Supabase SQL Editor.";

function registerUrl(req: NextRequest, language: "en" | "fr"): string {
  return `${publicBaseUrl() ?? toHttps(req.nextUrl.origin)}/?lang=${language}`;
}

async function emailCode(req: NextRequest, code: StudentCode, language: "en" | "fr"): Promise<string | null> {
  try {
    await sendStudentCodeEmail({
      toEmail: code.email,
      name: code.name,
      code: code.code,
      expiresAt: code.expiresAt,
      registerUrl: registerUrl(req, language),
      logoPngBuffer: await brandLogoPng(),
      language,
    });
    await markStudentCodeEmailed(code.id);
    return null;
  } catch (err) {
    console.error(`Emailing student code ${code.code} failed: ${describeError(err)}`);
    return "The code was created, but the email couldn't be sent. Copy the message and send it yourself.";
  }
}

export const GET = adminRoute(async () => {
  try {
    const [codes, tickets] = await Promise.all([listStudentCodes(), listTickets()]);
    const ticket = tickets.find((t) => t.id === STUDENT_TICKET_ID) ?? null;
    return NextResponse.json({
      codes,
      // The panel warns when there's no Student ticket for the codes to unlock.
      studentTicket: ticket ? { onSale: isOnSale(ticket), amountCents: ticket.amountCents, currency: ticket.currency } : null,
    });
  } catch (err) {
    console.error(`List student codes failed: ${describeError(err)}`);
    if (isMissingTable(err as { code?: string })) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
    return NextResponse.json({ error: "Couldn't load the student codes. Try again." }, { status: 500 });
  }
});

// Body: { name, email, expiresAt (ISO), language: "en" | "fr", send: boolean }
export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  const language = body.language === "fr" ? "fr" : "en";
  const fields: Record<string, string> = {};
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) fields.email = "Enter the email address the student wrote from.";
  if (name.length > 120) fields.name = "Keep it under 120 characters.";
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    fields.expiresAt = "Pick a date in the future.";
  }
  if (Object.keys(fields).length) return NextResponse.json({ error: "Check the highlighted fields.", fields }, { status: 400 });

  let code: StudentCode;
  try {
    code = await createStudentCode({ email, name, expiresAt: expiresAt!.toISOString(), createdBy: session.email, language });
  } catch (err) {
    console.error(`Create student code failed: ${describeError(err)}`);
    if (isMissingTable(err as { code?: string })) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
    return NextResponse.json({ error: "Couldn't create the code. Try again." }, { status: 500 });
  }
  console.info(`Student code ${code.code} created for ${email} by ${session.email}`);

  const emailError = body.send === true ? await emailCode(req, code, language) : null;
  const saved = body.send === true && !emailError ? { ...code, emailedAt: new Date().toISOString() } : code;
  return NextResponse.json({ code: saved, emailError });
});

// Body: { id, action: "cancel" | "email" } (emails go in the code's own language)
export const PATCH = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || (body.action !== "cancel" && body.action !== "email")) {
    return NextResponse.json({ error: "Missing id or action." }, { status: 400 });
  }
  try {
    if (body.action === "cancel") {
      const code = await cancelStudentCode(id);
      if (!code) return NextResponse.json({ error: "This code was already used or cancelled." }, { status: 409 });
      console.info(`Student code ${code.code} cancelled by ${session.email}`);
      return NextResponse.json({ code });
    }
    const code = await getStudentCode(id);
    if (!code) return NextResponse.json({ error: "No such code." }, { status: 404 });
    if (code.cancelledAt || code.usedAt) return NextResponse.json({ error: "This code was already used or cancelled." }, { status: 409 });
    const emailError = await emailCode(req, code, code.language);
    if (emailError) return NextResponse.json({ error: "The email couldn't be sent. Copy the message and send it yourself." }, { status: 502 });
    return NextResponse.json({ code: { ...code, emailedAt: new Date().toISOString() } });
  } catch (err) {
    console.error(`Update student code failed: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't update the code. Try again." }, { status: 500 });
  }
});
