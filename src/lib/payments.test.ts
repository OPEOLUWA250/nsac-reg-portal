import { beforeEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Ticket } from "./tickets";

const api = vi.hoisted(() => ({
  products: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  coupons: { create: vi.fn(), update: vi.fn() },
  promotionCodes: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn(), list: vi.fn() },
}));
vi.mock("stripe", () => ({ default: vi.fn(() => api) }));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) })),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/attendee-service", () => ({ sendAttendeeQr: vi.fn(), notifyAdminsOfRegistration: notify }));
const used = vi.hoisted(() => vi.fn());
vi.mock("@/lib/student-codes", () => ({ markStudentCodeUsed: used }));
import { checkoutAttendeeId, createCheckoutSession, fulfillCheckoutSession, TICKET_PRODUCT_ID } from "./payments";
import { createPromoCode, setPromoCodeActive, updatePromoCode, type PromoCode } from "./promo-codes";

const session = (fields: Partial<Stripe.Checkout.Session>) => fields as Stripe.Checkout.Session;
const ticket = {
  id: "standard", name: { en: "Standard", fr: "Standard FR" }, description: { en: "", fr: "" },
  amountCents: 50000, currency: "eur", availableUntil: null, active: true, sortOrder: 1,
} as Ticket;

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  for (const group of Object.values(api)) for (const fn of Object.values(group)) if (typeof fn === "function") fn.mockReset();
  api.products.retrieve.mockResolvedValue({ id: TICKET_PRODUCT_ID, active: true });
  api.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
});

it("recognises only Checkout Sessions this portal created", () => {
  expect(checkoutAttendeeId(session({ client_reference_id: "a1", metadata: { attendee_id: "a1" } }))).toBe("a1");
  // The shared Stripe account's other checkouts (the Space in Africa website).
  expect(checkoutAttendeeId(session({ client_reference_id: "wp-order-123", metadata: {} }))).toBeNull();
  expect(checkoutAttendeeId(session({ client_reference_id: null, metadata: { attendee_id: "a1" } }))).toBeNull();
  expect(checkoutAttendeeId(session({ client_reference_id: "a2", metadata: { attendee_id: "a1" } }))).toBeNull();
  expect(checkoutAttendeeId(null)).toBeNull();
});

it("leaves other sites' paid sessions alone", async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  vi.mocked(supabaseAdmin).mockClear();
  const paid = session({ client_reference_id: "wp-order-123", metadata: {}, payment_status: "paid" });
  expect(await fulfillCheckoutSession(paid)).toBeNull();
  expect(supabaseAdmin).not.toHaveBeenCalled();
});

it("sells every ticket as the portal's own product, naming the ticket on the page and invoice", async () => {
  await createCheckoutSession({
    attendee: { id: "a1", email: "a@example.com", vat_number: null, invoice_reference: null, organization: null },
    ticket,
    language: "fr",
    baseUrl: "https://example.com",
  });
  const params = api.checkout.sessions.create.mock.calls[0][0];
  expect(params.line_items[0].price_data).toEqual({ currency: "eur", unit_amount: 50000, product: TICKET_PRODUCT_ID });
  expect(params.custom_text.submit.message).toBe("Standard FR");
  expect(params.invoice_creation.invoice_data.description).toContain("Standard");
  expect(params.invoice_creation.invoice_data.custom_fields).toEqual([{ name: "Ticket", value: "Standard" }]);
  // Euros only: no converted price on the payment page.
  expect(params.adaptive_pricing).toEqual({ enabled: false });
  // The wide Space in Africa logo, for this site's payment pages only.
  expect(params.branding_settings).toEqual({ logo: { type: "url", url: "https://example.com/brand/space-in-africa-checkout.png" } });
});

it("still opens the payment page if Stripe refuses the logo", async () => {
  const args = {
    attendee: { id: "a1", email: "a@example.com", vat_number: null, invoice_reference: null, organization: null },
    ticket,
    language: "en" as const,
  };
  api.checkout.sessions.create
    .mockRejectedValueOnce(Object.assign(new Error("Invalid logo"), { param: "branding_settings[logo][url]" }))
    .mockResolvedValueOnce({ id: "cs_2", url: "https://checkout.stripe.com/y" });
  expect(await createCheckoutSession({ ...args, baseUrl: "https://example.com" })).toBe("https://checkout.stripe.com/y");
  expect(api.checkout.sessions.create.mock.calls[1][0].branding_settings).toBeUndefined();
  // Locally (http://localhost) Stripe couldn't fetch it, so it isn't sent.
  api.checkout.sessions.create.mockReset().mockResolvedValue({ id: "cs_3", url: "https://checkout.stripe.com/z" });
  await createCheckoutSession({ ...args, baseUrl: "http://localhost:3000" });
  expect(api.checkout.sessions.create.mock.calls[0][0].branding_settings).toBeUndefined();
});

it("limits new promo codes to the portal's product", async () => {
  api.coupons.create.mockResolvedValue({ id: "co_1" });
  api.promotionCodes.create.mockResolvedValue({
    id: "promo_1", code: "NSAC-X", metadata: { app: "nsac-reg-portal" }, promotion: { coupon: { percent_off: 100 } },
    max_redemptions: null, times_redeemed: 0, expires_at: null, active: true, created: 1,
  });
  await createPromoCode({ label: "Sponsors", percentOff: 100, maxUses: null, expiresAt: null, ticketIds: null });
  expect(api.coupons.create.mock.calls[0][0].applies_to).toEqual({ products: [TICKET_PRODUCT_ID] });
});

it("never switches off another site's promo code", async () => {
  api.promotionCodes.retrieve.mockResolvedValue({ id: "promo_sia", metadata: {}, promotion: { coupon: { percent_off: 20 } } });
  expect(await setPromoCodeActive("promo_sia", false)).toBeNull();
  expect(api.promotionCodes.update).not.toHaveBeenCalled();
});

const asvCode: PromoCode = {
  id: "promo_old", code: "ASV-2027", label: "ASV", percentOff: 20, maxUses: 15, used: 4,
  expiresAt: "2026-12-31T00:00:00.000Z", active: true, ticketIds: ["standard"], createdAt: "2026-10-01T00:00:00.000Z",
};
const asvChanges = { label: "ASV", percentOff: 20, maxUses: 15, expiresAt: "2026-12-31T00:00:00.000Z", ticketIds: ["standard"] };

it("edits who a promo code is for and its tickets in place", async () => {
  api.promotionCodes.retrieve.mockResolvedValue({ id: "promo_old", promotion: { coupon: { id: "co_1", percent_off: 20 } } });
  api.promotionCodes.update.mockResolvedValue({
    id: "promo_old", code: "ASV-2027", metadata: { app: "nsac-reg-portal", label: "ASV team", tickets: "standard,early" },
    promotion: { coupon: { percent_off: 20 } }, max_redemptions: 15, times_redeemed: 4, expires_at: 1798675200, active: true, created: 1,
  });
  const promo = await updatePromoCode(asvCode, { ...asvChanges, label: "ASV team", ticketIds: ["standard", "early"] });
  expect(api.promotionCodes.create).not.toHaveBeenCalled();
  expect(api.coupons.update).toHaveBeenCalledWith("co_1", { name: "ASV team (20% off)" });
  expect(promo.ticketIds).toEqual(["standard", "early"]);
});

it("replaces a promo code to change its end date, keeping the code and its uses", async () => {
  api.promotionCodes.retrieve.mockResolvedValue({ id: "promo_old", promotion: { coupon: { id: "co_1", percent_off: 20 } } });
  api.promotionCodes.create.mockImplementation(async (params) => ({
    id: "promo_new", code: params.code, metadata: params.metadata, promotion: { coupon: { percent_off: 20 } },
    max_redemptions: params.max_redemptions, times_redeemed: 0, expires_at: params.expires_at, active: true, created: 2,
  }));
  const promo = await updatePromoCode(asvCode, { ...asvChanges, expiresAt: "2027-01-31T00:00:00.000Z" });
  expect(api.promotionCodes.update).toHaveBeenCalledWith("promo_old", { active: false, metadata: { replaced: "true" } });
  const params = api.promotionCodes.create.mock.calls[0][0];
  expect(params.code).toBe("ASV-2027");
  expect(params.promotion.coupon).toBe("co_1"); // same discount, same coupon
  expect(params.max_redemptions).toBe(11); // 15 minus the 4 already used
  expect(promo).toMatchObject({ code: "ASV-2027", used: 4, maxUses: 15, createdAt: asvCode.createdAt, expiresAt: "2027-01-31T00:00:00.000Z" });
});

it("puts the old promo code back if Stripe refuses the new one", async () => {
  api.promotionCodes.retrieve.mockResolvedValue({ id: "promo_old", promotion: { coupon: { id: "co_1", percent_off: 20 } } });
  api.promotionCodes.update.mockResolvedValue({});
  api.promotionCodes.create.mockRejectedValue(new Error("Stripe is down"));
  await expect(updatePromoCode(asvCode, { ...asvChanges, maxUses: 20 })).rejects.toThrow("Stripe is down");
  expect(api.promotionCodes.update).toHaveBeenLastCalledWith("promo_old", { active: true, metadata: { replaced: "" } });
});

it("uses up a student code only once the payment has gone through", async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const paidRow = { id: "a1", payment_status: "paid" };
  vi.mocked(supabaseAdmin).mockReturnValue({
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: paidRow, error: null }) }) }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "a1", payment_status: "pending" }, error: null }) }) }),
    }),
  } as never);
  const meta = { attendee_id: "a1", ticket_type: "student", promo_code: "STU-7K3QXP", student_code: "STU-7K3QXP" };
  await fulfillCheckoutSession(session({ client_reference_id: "a1", metadata: meta, payment_status: "unpaid" }));
  expect(used).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  await fulfillCheckoutSession(session({ client_reference_id: "a1", metadata: meta, payment_status: "paid", amount_total: 20000, currency: "eur" }));
  expect(used).toHaveBeenCalledWith("STU-7K3QXP", "a1");
  // The organisers hear about it once, when the payment goes through.
  expect(notify).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith(paidRow);
});

it("puts the student code on the payment, as the code used", async () => {
  await createCheckoutSession({
    attendee: { id: "a1", email: "a@example.com", vat_number: null, invoice_reference: null, organization: null },
    ticket: { ...ticket, id: "student" },
    studentCode: "STU-7K3QXP",
    language: "en",
    baseUrl: "https://example.com",
  });
  const params = api.checkout.sessions.create.mock.calls[0][0];
  expect(params.metadata).toMatchObject({ ticket_type: "student", promo_code: "STU-7K3QXP", student_code: "STU-7K3QXP" });
  expect(params.discounts).toBeUndefined();
});
