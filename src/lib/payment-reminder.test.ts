import { expect, it } from "vitest";
import { DEFAULT_TEMPLATES, fillTemplate, parseReminderInput, remindedRecently } from "./payment-reminder";
import { cleanAutoReminders } from "./auto-reminders";

const valid = { replyTo: "ops@example.com", signedBy: "Ada", signerTitle: "", templates: DEFAULT_TEMPLATES, copyToSender: true };

it("accepts the standard wording with a reply address", () => {
  const parsed = parseReminderInput(valid);
  expect("value" in parsed && parsed.value.replyTo).toBe("ops@example.com");
});

it("points at each field that needs fixing, per language", () => {
  const parsed = parseReminderInput({ ...valid, replyTo: "nope", templates: { en: { subject: "", message: "Hi" }, fr: DEFAULT_TEMPLATES.fr } });
  expect("fields" in parsed && parsed.fields).toEqual({ replyTo: "This doesn't look like an email address.", "en.subject": "Enter a subject." });
});

it("fills in each person's details, and leaves the rest as typed", () => {
  expect(fillTemplate("Dear {first name}, your {ticket} ticket is {price}. {first name}!", { firstName: "Ada", ticket: "Early Bird", price: "€500" })).toBe(
    "Dear Ada, your Early Bird ticket is €500. Ada!"
  );
  // The standard wording never promises to remove anyone.
  expect(DEFAULT_TEMPLATES.en.message).not.toMatch(/remove your registration/i);
});

it("knows who was reminded in the last day", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  expect(remindedRecently({ payment_reminder_sent_at: "2026-10-28T02:00:00Z" }, now)).toBe(true);
  expect(remindedRecently({ payment_reminder_sent_at: "2026-10-26T12:00:00Z" }, now)).toBe(false);
  expect(remindedRecently({ payment_reminder_sent_at: null }, now)).toBe(false);
});

it("checks the automatic reminder setting", () => {
  expect(cleanAutoReminders({ enabled: true, afterDays: 2, replyTo: " " })).toEqual({ enabled: true, afterDays: 2, replyTo: null });
  expect(cleanAutoReminders({ enabled: true, afterDays: 0 })).toBeNull();
  expect(cleanAutoReminders({ enabled: "yes", afterDays: 2 })).toBeNull();
  expect(cleanAutoReminders({ enabled: false, afterDays: 3, replyTo: "not an email" })).toBeNull();
});
