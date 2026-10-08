import { beforeEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Ticket } from "./tickets";

const api = vi.hoisted(() => ({
  products: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  coupons: { create: vi.fn() },
  promotionCodes: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn(), list: vi.fn() },
}));
vi.mock("stripe", () => ({ default: vi.fn(() => api) }));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) })),
}));
vi.mock("@/lib/attendee-service", () => ({ sendAttendeeQr: vi.fn() }));
const used = vi.hoisted(() => vi.fn());
vi.mock("@/lib/student-codes", () => ({ markStudentCodeUsed: used }));
import { checkoutAttendeeId, createCheckoutSession, fulfillCheckoutSession, TICKET_PRODUCT_ID } from "./payments";
import { createPromoCode, setPromoCodeActive } from "./promo-codes";

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
  await fulfillCheckoutSession(session({ client_reference_id: "a1", metadata: meta, payment_status: "paid", amount_total: 20000, currency: "eur" }));
  expect(used).toHaveBeenCalledWith("STU-7K3QXP", "a1");
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
