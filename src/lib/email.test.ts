import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendAdminRegistrationEmail, sendCategoryChangeEmail, sendQrEmail } from "./email";
import type { Attendee } from "./types";

const mail = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mail.send }) } }));
beforeEach(() => {
  vi.stubEnv("EMAIL_FROM", "event@example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("PUBLIC_BASE_URL", "https://event.example.com");
});
afterEach(() => vi.unstubAllEnvs());

beforeEach(() => mail.send.mockClear());

it.each(["en", "fr"] as const)("renders the credential card in %s without sending real mail", async (language) => {
  await sendQrEmail({ toEmail: "attendee@example.com", fullName: "Ada Example", role: "delegate", language, qrPngBuffer: Buffer.from("test") });
  const message = mail.send.mock.calls[0][0];
  expect(message.html).toContain(language === "en" ? "REGISTRATION CATEGORY" : "CATÉGORIE D’INSCRIPTION");
  // The category, large and in their language, then their name and the dates.
  expect(message.html).toMatch(language === "en" ? /font-size:32px[^>]*>Delegate</ : /font-size:26px[^>]*>Délégué\(e\)</);
  expect(message.html).toContain(">Ada Example<");
  expect(message.html).toContain(language === "en" ? "19–23 April 2027" : "19–23 avril 2027");
  expect(message.html).toContain('src="cid:checkin-qr.png"');
});

it.each([
  ["vip", "en", "You're a VIP guest", ">VIP<"],
  ["speaker", "en", "Your registration category", ">Speaker<"],
  ["delegate", "fr", "Votre catégorie d'inscription", ">Délégué(e)<"],
] as const)("emails a change to %s (%s)", async (role, language, subject, category) => {
  await sendCategoryChangeEmail({ toEmail: "attendee@example.com", fullName: "Ada Example", role, language, qrPngBuffer: Buffer.from("test") });
  const message = mail.send.mock.calls[0][0];
  expect(message.subject).toContain(subject);
  expect(message.html).toContain(category);
  expect(message.html).toContain('src="cid:checkin-qr.png"');
});

it("escapes category and name values in the email", async () => {
  await sendQrEmail({ toEmail: "attendee@example.com", fullName: "<script>alert(1)</script>", role: "<img src=x>", qrPngBuffer: Buffer.from("test") });
  const html = mail.send.mock.calls[0][0].html;
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img src=x&gt;");
});

it("ends every email with the calendar links and invite, and the flyer when there is one", async () => {
  await sendCategoryChangeEmail({ toEmail: "a@example.com", fullName: "Ada Example", role: "host", qrPngBuffer: Buffer.from("test"), flyerUrl: "https://event.example.com/flyer" });
  const message = mail.send.mock.calls[0][0];
  expect(message.html).toContain("Add to your calendar");
  expect(message.html).toContain('href="https://event.example.com/flyer"');
  expect(message.attachments.some((a: { contentType: string }) => a.contentType === "text/calendar")).toBe(true);
});

it("tells the organisers about a new registration, laid out like the dashboard", async () => {
  const attendee = {
    id: "c1e00a55-9281-4643-b3ca-89e6a447fbf5", full_name: "Ada Example<script>x</script>", email: "ada@example.com", role: "speaker",
    phone: "+234 801 234 5678", job_title: "Engineer", organization: "Example Space", language: "en", food_allergies: "Nuts\nShellfish",
    promo_code: null, amount_cents: 35000, currency: "eur", payment_status: "paid", source: "web", paid_at: "2026-10-14T19:42:21Z",
    needs_invitation_letter: true, passport_path: null,
  } as unknown as Attendee;
  await sendAdminRegistrationEmail({
    to: "organiser@example.com",
    attendee,
    ticketName: "Standard",
    passportUploaded: false,
    dashboardUrl: "https://event.example.com/admin",
  });
  const message = mail.send.mock.calls[0][0];
  expect(message.to).toBe("organiser@example.com");
  expect(message.subject).toBe("New registration: Ada Example<script>x</script> (Standard)");
  expect(message.html).toContain("Ada Example&lt;script&gt;x&lt;/script&gt;");
  expect(message.html).not.toContain("<script>");
  // Name, category and payment, then the drawer sections. No avatar or id.
  expect(message.html).toMatch(/>Speaker</);
  expect(message.html).toMatch(/>€350</);
  expect(message.html).toContain("Travel and logistics");
  expect(message.html).not.toContain("#C1E00A55");
  expect(message.html).toContain("Nuts<br />Shellfish");
  expect(message.html).toContain("14 Oct 2026, 20:42 WAT");
  expect(message.html).not.toContain("Promo code");
  expect(message.html).toContain("Not received. Email them to collect it.");
  expect(message.html).toContain('href="https://event.example.com/admin"');
  // The dashboard fonts, not the letterhead.
  expect(message.html).toContain("'DM Sans', Arial, Helvetica, sans-serif");
  expect(message.html).not.toContain("Questions? Simply reply");
  expect(message.attachments).toEqual([]);
});

it("puts the brand logo in the alert header when there is one", async () => {
  const attendee = { id: "a1", full_name: "Ada Example", email: "ada@example.com", role: "delegate", amount_cents: null } as unknown as Attendee;
  await sendAdminRegistrationEmail({ to: "o@example.com", attendee, ticketName: "Free pass", passportUploaded: true, logoPngBuffer: Buffer.from("png") });
  const message = mail.send.mock.calls[0][0];
  expect(message.html).toContain('src="cid:brand-logo.png"');
  expect(message.attachments).toEqual([expect.objectContaining({ cid: "brand-logo.png" })]);
  expect(message.html).toMatch(/>Free</);
  // Blue and greys only: the brand gold is kept out of the organiser alert.
  expect(message.html).not.toMatch(/#F09F07/i);
  // No dashboard link for this recipient (not an admin): no button.
  expect(message.html).not.toContain("Open the dashboard");
});

it("attaches the passport as uploaded, not as a picture in the email", async () => {
  const attendee = { id: "a1", full_name: "Adá Example", email: "ada@example.com", role: "delegate", amount_cents: null, registration_number: 7 } as unknown as Attendee;
  for (const [contentType, ext] of [["application/pdf", "pdf"], ["image/png", "png"]]) {
    mail.send.mockClear();
    await sendAdminRegistrationEmail({
      to: "o@example.com", attendee, ticketName: "Free pass", passportUploaded: true,
      passportFile: { content: Buffer.from("file"), contentType },
    });
    const message = mail.send.mock.calls[0][0];
    expect(message.html).not.toContain("cid:passport");
    expect(message.html).toContain("Uploaded, attached to this email");
    expect(message.html).toContain("please don't forward it");
    expect(message.attachments).toEqual([expect.objectContaining({ filename: `7-passport-ada-example.${ext}`, contentType })]);
    expect(message.attachments[0].cid).toBeUndefined();
  }
});

it("groups alerts in threads of 100 by registration number", async () => {
  vi.stubEnv("EMAIL_FROM", "NewSpace Africa <hello@newspace.example.com>");
  const send = async (registration_number: number | null) => {
    mail.send.mockClear();
    const attendee = { id: "a1", full_name: "Ada Example", email: "ada@example.com", role: "delegate", amount_cents: null, registration_number } as unknown as Attendee;
    await sendAdminRegistrationEmail({ to: "o@example.com", attendee, ticketName: "Standard", passportUploaded: false });
    return mail.send.mock.calls[0][0];
  };
  const first = await send(1);
  const hundredth = await send(100);
  const next = await send(101);
  expect(first.subject).toBe("New registrations 1 to 100 · NewSpace Africa 2027");
  expect(hundredth.subject).toBe(first.subject);
  expect(first.headers).toEqual({
    "In-Reply-To": "<registration-alerts-2027-1-100@newspace.example.com>",
    References: "<registration-alerts-2027-1-100@newspace.example.com>",
  });
  expect(hundredth.headers).toEqual(first.headers);
  expect(next.subject).toBe("New registrations 101 to 200 · NewSpace Africa 2027");
  expect(next.headers.References).toBe("<registration-alerts-2027-101-200@newspace.example.com>");
  // Who it is shows in the inbox preview and the heading.
  expect(next.html).toContain("#101 Ada Example: Delegate, Standard, Free");
  expect(next.html).toContain("#101</strong>");
  // No number yet (database not updated): a standalone alert, as before.
  const unnumbered = await send(null);
  expect(unnumbered.subject).toBe("New registration: Ada Example (Standard)");
  expect(unnumbered.headers).toBeUndefined();
});
