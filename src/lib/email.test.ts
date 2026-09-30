import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendQrEmail } from "./email";

const mail = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mail.send }) } }));
beforeEach(() => {
  vi.stubEnv("EMAIL_FROM", "event@example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("PUBLIC_BASE_URL", "https://event.example.com");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["en", "fr"] as const)("renders the prominent category card in %s without sending real mail", async (language) => {
  await sendQrEmail({ toEmail: "attendee@example.com", fullName: "Ada Example", role: "delegate", language, qrPngBuffer: Buffer.from("test") });
  const message = mail.send.mock.calls[0][0];
  expect(message.html).toContain(language === "en" ? "YOUR REGISTRATION CATEGORY" : "VOTRE CATÉGORIE D’INSCRIPTION");
  expect(message.html).toContain("font-size:28px");
  expect(message.html).toContain("delegate");
  expect(message.html).toContain('src="cid:checkin-qr.png"');
});

it("escapes category and name values in the email", async () => {
  await sendQrEmail({ toEmail: "attendee@example.com", fullName: "<script>alert(1)</script>", role: "<img src=x>", qrPngBuffer: Buffer.from("test") });
  const html = mail.send.mock.calls[0][0].html;
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img src=x&gt;");
});
