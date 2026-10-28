import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPaymentReminderEmail, sendPaymentReminderEmail } from "./email";

const mail = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mail.send }) } }));
beforeEach(() => {
  vi.stubEnv("EMAIL_FROM", "event@example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  mail.send.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const details = {
  subject: "Complete your registration",
  message: "Dear Ada,\n\nYour <b>payment</b> wasn't completed.\nIt takes two minutes.",
  payUrl: "https://event.example.com/pay/abc.def",
  ticket: "Early Bird",
  price: "€500",
  language: "en" as const,
};

it("lays out the admin's message, the ticket and today's price, and the payment button", () => {
  const { subject, html } = buildPaymentReminderEmail({ ...details, hasLogo: false });
  expect(subject).toBe("Complete your registration");
  // Typed text is escaped; blank lines make paragraphs, single ones line breaks.
  expect(html).toContain("Your &lt;b&gt;payment&lt;/b&gt; wasn&#39;t completed.<br />It takes two minutes.");
  expect(html).not.toContain("<b>payment</b>");
  expect(html).toContain(">Early Bird<");
  expect(html).toContain(">€500<");
  expect(html).toContain('href="https://event.example.com/pay/abc.def"');
  expect(html).toContain("Complete my payment");
});

it("signs with the sender's name when given, and in French when asked", () => {
  const signed = buildPaymentReminderEmail({ ...details, signedBy: "Ada Obi", signerTitle: "Head of Partnerships", hasLogo: false }).html;
  expect(signed).toContain("<strong style=\"color:#232323;\">Ada Obi</strong><br />Head of Partnerships");
  const fr = buildPaymentReminderEmail({ ...details, language: "fr", hasLogo: false }).html;
  expect(fr).toContain("Finaliser mon paiement");
});

it("sends replies to the sender, with a hidden copy when asked", async () => {
  await sendPaymentReminderEmail({ ...details, toEmail: "ada@example.com", replyTo: "ops@example.com", bcc: "ops@example.com" });
  expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "ada@example.com", replyTo: "ops@example.com", bcc: "ops@example.com", subject: "Complete your registration" });
});
