import { Resend } from "resend";

interface SendQrEmailArgs {
  toEmail: string;
  fullName: string;
  qrPngBuffer: Buffer;
  eventName?: string;
}

export async function sendQrEmail({
  toEmail,
  fullName,
  qrPngBuffer,
  eventName = "NewSpace Africa Conference",
}: SendQrEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (!apiKey || !fromAddress) {
    throw new Error("Missing RESEND_API_KEY or EMAIL_FROM environment variables");
  }

  const resend = new Resend(apiKey);

  const firstName = fullName.split(" ")[0] || fullName;

  await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `You're registered for ${eventName} — your check-in QR code`,
    attachments: [
      {
        filename: "checkin-qr.png",
        content: qrPngBuffer,
        contentType: "image/png",
        contentId: "checkin-qr.png",
      },
    ],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <h2 style="color: #0b3d91;">Registration confirmed 🎉</h2>
        <p>Hi ${firstName},</p>
        <p>
          Thanks for registering for <strong>${eventName}</strong>. Your spot is confirmed.
        </p>
        <p>
          Please bring the QR code attached to this email (digital or printed) to the
          registration desk on the day of the event — it will be scanned to check you in
          and print your badge.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <img src="cid:checkin-qr.png" alt="Your check-in QR code" style="width: 220px; height: 220px;" />
        </div>
        <p style="font-size: 13px; color: #555;">
          If you have any questions, just reply to this email.
        </p>
      </div>
    `,
  });
}
