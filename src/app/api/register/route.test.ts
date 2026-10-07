import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ create: vi.fn(), checkout: vi.fn(), tickets: vi.fn(), promo: vi.fn(), email: vi.fn(), student: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/student-codes", () => ({ checkStudentCode: mocks.student }));
vi.mock("@/lib/server/rate-limit", () => ({ clientIp: () => "203.0.113.1", withinLimit: mocks.limit }));
vi.mock("@/lib/registration-config", () => ({ isRegistrationOpen: async () => true }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => true }));
vi.mock("@/lib/ticket-store", () => ({ availableTickets: mocks.tickets }));
vi.mock("@/lib/attendee-service", () => ({ createAttendee: mocks.create, sendAttendeeQr: mocks.email, canResendQr: () => false }));
vi.mock("@/lib/payments", () => ({ createCheckoutSession: mocks.checkout }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/promo-codes", async () => ({ checkPromoCode: mocks.promo, discountedCents: (await import("@/lib/tickets")).discountedCents }));

const input = {
  id: "12345678-1234-4234-8234-123456789abc", category: "vip",
  firstName: "Ada", lastName: "Example", email: "ada@example.com", jobTitle: "Engineer",
  phone: "+2348012345678", nationality: "NG", residenceCountry: "GH",
  organization: "Example", organizationCountry: "NG", professionalCategory: "industry",
  jobFunction: "engineering", invitationLetter: "no", foodAllergies: "None", ticket: "standard",
  safetyConsent: true, optInOrganizer: true, optInSponsors: true, shareDetails: "yes",
};
beforeEach(() => {
  mocks.tickets.mockResolvedValue([{ id: "standard", amountCents: 50000, currency: "eur" }]);
  mocks.create.mockResolvedValue({ status: "created", attendee: { id: input.id, payment_status: "pending" } });
  mocks.checkout.mockResolvedValue("https://checkout.stripe.com/test");
  mocks.limit.mockResolvedValue(true);
  mocks.student.mockReset();
  mocks.create.mockClear();
  mocks.checkout.mockClear();
});
function request(body = input) {
  return new NextRequest("https://example.com/api/register", { method: "POST", body: JSON.stringify(body) });
}

it.each(["vip", "delegate", "speaker", "media", "exhibitor"])("creates a pending %s registration and requires Stripe checkout", async (category) => {
  const response = await POST(request({ ...input, category }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "payment_required", checkoutUrl: "https://checkout.stripe.com/test" });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ role: category, details: expect.objectContaining({ payment_status: "pending", amount_cents: 50000, share_details: true, residence_country: "Ghana" }) }));
  expect(mocks.checkout).toHaveBeenCalledOnce();
  expect(mocks.email).not.toHaveBeenCalled();
});

it("rejects a free VIP ticket before creating a registration", async () => {
  mocks.tickets.mockResolvedValue([{ id: "standard", amountCents: 0, currency: "eur" }]);
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ fields: { ticket: "vip_payment_required" } });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("rejects a 100% VIP discount before creating a registration", async () => {
  mocks.promo.mockResolvedValue({ ok: true, promo: { id: "promo", code: "FREE", percentOff: 100 } });
  const response = await POST(request({ ...input, promoCode: "FREE" } as typeof input));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ fields: { promoCode: "vip_payment_required" } });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.checkout).not.toHaveBeenCalled();
});

describe("Student ticket", () => {
  const student = { ...input, category: "speaker", ticket: "student", studentCode: "stu-7k3qxp" };
  beforeEach(() => {
    mocks.tickets.mockResolvedValue([
      { id: "standard", amountCents: 50000, currency: "eur" },
      { id: "student", amountCents: 20000, currency: "eur" },
    ]);
  });

  it("registers a Delegate at the student price with a code for this email", async () => {
    mocks.student.mockResolvedValue({ ok: true, code: { code: "STU-7K3QXP" } });
    const response = await POST(request(student as typeof input));
    expect(response.status).toBe(200);
    expect(mocks.student).toHaveBeenCalledWith("STU-7K3QXP", "ada@example.com");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      role: "delegate",
      details: expect.objectContaining({ ticket_type: "student", amount_cents: 20000, promo_code: "STU-7K3QXP" }),
    }));
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ studentCode: "STU-7K3QXP", promo: null }));
  });

  it.each(["unknown", "expired", "used"])("refuses a %s code before creating a registration", async (problem) => {
    mocks.student.mockResolvedValue({ ok: false, problem });
    const response = await POST(request(student as typeof input));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: { studentCode: `student_code_${problem}` } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a code, and takes no promo code", async () => {
    const noCode = await POST(request({ ...student, studentCode: "" } as typeof input));
    expect(await noCode.json()).toMatchObject({ fields: { studentCode: "student_code_required" } });
    const withPromo = await POST(request({ ...student, promoCode: "SPONSOR" } as typeof input));
    expect(await withPromo.json()).toMatchObject({ fields: { promoCode: "promo_not_for_ticket" } });
    expect(mocks.student).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stops code guessing", async () => {
    mocks.limit.mockResolvedValue(false);
    const response = await POST(request(student as typeof input));
    expect(await response.json()).toMatchObject({ fields: { studentCode: "promo_rate_limited" } });
    expect(mocks.student).not.toHaveBeenCalled();
  });

  it("ignores a student code on other tickets", async () => {
    const response = await POST(request({ ...student, ticket: "standard" } as typeof input));
    expect(response.status).toBe(200);
    expect(mocks.student).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ role: "speaker" }));
  });
});
