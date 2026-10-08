import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendCategoryChangeEmail, sendQrEmail } from "./email";

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
