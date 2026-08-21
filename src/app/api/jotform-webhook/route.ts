import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapJotformSubmission } from "@/lib/jotform-mapping";
import { generateUniqueCode, generateQrPngBuffer } from "@/lib/qrcode";
import { sendQrEmail } from "@/lib/email";

export const runtime = "nodejs";

// Jotform posts submissions as multipart/form-data. Configure this URL as
// the webhook target in Jotform: Settings -> Integrations -> Webhooks.
export async function POST(req: NextRequest) {
  const secret = process.env.JOTFORM_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const form = await req.formData();
  const submissionId = form.get("submissionID")?.toString() ?? null;
  const formId = form.get("formID")?.toString() ?? null;
  const rawRequestStr = form.get("rawRequest")?.toString();

  if (!rawRequestStr) {
    return NextResponse.json(
      { error: "missing rawRequest in webhook payload" },
      { status: 400 }
    );
  }

  let rawRequest: Record<string, unknown>;
  try {
    rawRequest = JSON.parse(rawRequestStr);
  } catch {
    return NextResponse.json({ error: "invalid rawRequest JSON" }, { status: 400 });
  }

  const mapped = mapJotformSubmission(rawRequest);
  if (!mapped) {
    return NextResponse.json(
      {
        error:
          "could not extract name/email from submission — adjust mapJotformSubmission() in src/lib/jotform-mapping.ts",
      },
      { status: 422 }
    );
  }

  const supabase = supabaseAdmin();
  const uniqueCode = generateUniqueCode();

  const { data: attendee, error } = await supabase
    .from("attendees")
    .upsert(
      {
        jotform_submission_id: submissionId,
        jotform_form_id: formId,
        full_name: mapped.full_name,
        email: mapped.email,
        role: mapped.role,
        organization: mapped.organization,
        phone: mapped.phone,
        unique_code: uniqueCode,
        raw_payload: rawRequest,
      },
      { onConflict: "jotform_submission_id" }
    )
    .select()
    .single();

  if (error || !attendee) {
    console.error("Failed to upsert attendee", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  try {
    const qrPngBuffer = await generateQrPngBuffer(attendee.unique_code);
    await sendQrEmail({
      toEmail: attendee.email,
      fullName: attendee.full_name,
      role: attendee.role,
      qrPngBuffer,
    });

    await supabase
      .from("attendees")
      .update({ qr_email_sent_at: new Date().toISOString() })
      .eq("id", attendee.id);
  } catch (emailError) {
    // Attendee is saved even if the email fails — log and let it be resent
    // manually/via a retry job rather than failing the whole webhook.
    console.error("Failed to send QR email", emailError);
  }

  return NextResponse.json({ ok: true, attendeeId: attendee.id });
}
