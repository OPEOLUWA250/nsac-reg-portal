import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ create: vi.fn(), checkout: vi.fn(), tickets: vi.fn(), promo: vi.fn(), email: vi.fn() }));
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
