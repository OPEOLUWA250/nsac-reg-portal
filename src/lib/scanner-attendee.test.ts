import { expect, it } from "vitest";
import { scannerAttendee } from "./scanner-attendee";
import type { Attendee } from "./types";

const attendee = {
  full_name: "Ada Example", unique_code: "code12345678", checked_in: false,
  payment_status: "paid", share_details: true, role: "vip", email: "ada@example.com",
  phone: "+234123456789", organization: "Example Company", job_title: "Engineer",
  nationality: "Nigeria", residence_country: "Ghana", passport_path: "private.pdf", raw_payload: { secret: true },
} as unknown as Attendee;

it.each([false, null, undefined])("shows only name, company, designation and operational state when consent is %s", (consent) => {
  const result = scannerAttendee({ ...attendee, share_details: consent } as Attendee);
  expect(result).toEqual({ full_name: attendee.full_name, unique_code: attendee.unique_code,
    checked_in: false, payment_status: "paid", share_details: false,
    role: "", email: "", phone: null, organization: attendee.organization, job_title: attendee.job_title, nationality: null, residence_country: null });
  expect(result).not.toHaveProperty("passport_path");
  expect(result).not.toHaveProperty("raw_payload");
  expect(result.nationality).toBeNull();
  expect(result.residence_country).toBeNull();
});

it("includes permitted contact details only with explicit consent", () => {
  const result = scannerAttendee(attendee);
  expect(result).toMatchObject({ email: attendee.email, phone: attendee.phone, role: "vip", organization: attendee.organization });
  expect(result).not.toHaveProperty("passport_path");
  expect(result).not.toHaveProperty("raw_payload");
});
