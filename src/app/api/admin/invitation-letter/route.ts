import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { describeError } from "@/lib/describe-error";
import { buildInvitationLetterEmail, sendInvitationLetterEmail } from "@/lib/email";
import { buildLetter, letterFilename, parseLetterInput } from "@/lib/invitation-letter";
import { renderLetterPages, renderLetterPdf } from "@/lib/server/invitation-letter-pdf";
import { brandLogoPng } from "@/lib/ticket-image";
import { logActivity } from "@/lib/server/activity-log";
import { hasValidTicket, type Attendee } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/admin/invitation-letter
//   { id, action: "preview" | "send", senderEmail, signatoryName,
//     signatoryTitle?, passportNumber?, language, copyToSender }
// Letters are never sent on their own: an admin opens the preview from the
// dashboard (the attendee's details are filled in), checks it, and sends it.
// "preview" returns the email and the letter's pages as pictures; "send"
// emails the letter as a PDF and records who sent it and when.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The sent_at / sent_by columns aren't there yet (the SQL wasn't run).
const missingColumn = (err: unknown) => ["42703", "PGRST204"].includes((err as { code?: string } | null)?.code ?? "");

export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!UUID.test(id) || (action !== "preview" && action !== "send")) {
    return NextResponse.json({ error: "Missing registration or action." }, { status: 400 });
  }
  const parsed = parseLetterInput(body);
  if ("fields" in parsed) return NextResponse.json({ error: "Check the highlighted fields.", fields: parsed.fields }, { status: 400 });
  const input = parsed.value;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("attendees").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`Invitation letter: couldn't read attendee ${id}: ${describeError(error)}`);
    return NextResponse.json({ error: "Couldn't load this registration." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "This registration no longer exists." }, { status: 404 });
  const attendee = data as Attendee;
  // An official letter is for confirmed registrations only.
  if (!hasValidTicket(attendee)) {
    return NextResponse.json({ error: "They haven't paid yet. Letters can be sent once the registration is confirmed." }, { status: 409 });
  }

  const content = buildLetter(attendee, input);
  const email = {
    fullName: attendee.full_name,
    signatoryName: input.signatoryName,
    signatoryTitle: input.signatoryTitle,
    language: input.language,
  };

  try {
    if (action === "preview") {
      const [pages, logo] = await Promise.all([renderLetterPages(content), brandLogoPng()]);
      const { subject, html } = buildInvitationLetterEmail({ ...email, hasLogo: Boolean(logo) });
      return NextResponse.json({
        to: attendee.email,
        subject,
        // The logo is an attachment in the real email; inline here so the preview shows it.
        html: logo ? html.replaceAll("cid:brand-logo.png", `data:image/png;base64,${logo.toString("base64")}`) : html,
        pages: pages.map((p) => `data:image/jpeg;base64,${p.toString("base64")}`),
        filename: letterFilename(attendee),
      });
    }

    const [pdf, logoPngBuffer] = await Promise.all([renderLetterPdf(content), brandLogoPng()]);
    await sendInvitationLetterEmail({
      ...email,
      toEmail: attendee.email,
      replyTo: input.senderEmail,
      bcc: input.copyToSender && input.senderEmail !== attendee.email.toLowerCase() ? input.senderEmail : null,
      pdf,
      filename: letterFilename(attendee),
      logoPngBuffer,
    });
  } catch (err) {
    console.error(`Invitation letter ${action} failed for attendee ${id}: ${describeError(err)}`);
    return NextResponse.json({ error: action === "send" ? "The email didn't send. Nothing was recorded; try again." : "Couldn't draw the letter." }, { status: 502 });
  }

  await logActivity(
    session,
    {
      area: "letters",
      action: "letter.sent",
      summary: `sent ${attendee.full_name} their invitation letter (${input.language === "fr" ? "French" : "English"}, signed by ${input.signatoryName}, replies to ${input.senderEmail})`,
      target: { type: "attendee", id },
      details: { passportNumberGiven: Boolean(input.passportNumber), copyToSender: input.copyToSender },
    },
    req
  );

  // Sent: note it, so the dashboard shows "Letter sent".
  const { data: updated, error: saveError } = await supabase
    .from("attendees")
    .update({ invitation_letter_sent_at: new Date().toISOString(), invitation_letter_sent_by: session.email })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (saveError) {
    if (!missingColumn(saveError)) console.error(`Invitation letter sent to ${id}, but not recorded: ${describeError(saveError)}`);
    return NextResponse.json({
      sent: true,
      recorded: false,
      warning: missingColumn(saveError)
        ? "Sent. It isn't marked as sent yet: run the invitation letters SQL in Supabase."
        : "Sent, but it couldn't be marked as sent.",
    });
  }
  return NextResponse.json({ sent: true, recorded: true, attendee: updated });
});
